import { createGeminiClient, findKnowledgeStoreName, GEMINI_MODEL } from '@/utils/gemini';
import { COACH_RESPONSE_JSON_SCHEMA, PLAN_CHANGE_TYPES, type CoachResponsePayload } from '@/types/ai-plan-change';

// SprintLab Intelligence I-2: /api/coach now returns structured JSON so Gemini can either
// answer normally or attach one typed plan-change proposal (see types/ai-plan-change.ts).
// This route NEVER writes to storage — it only returns what Gemini proposed. The athlete's
// device does its own local re-validation (utils/plan-change-validator.ts) against the
// live plan state, shows the proposal for review, and only calls
// utils/plan-change-apply.ts::applyAIPlanChange after explicit approval.
const SYSTEM_INSTRUCTION = [
  'You are SprintLab Coach, an AI assistant for athletes using SprintLab.',
  'SprintLab\'s indexed documents (via File Search) are the primary source for SprintLab-specific training systems, workouts, terminology, and planning logic — prefer them over general knowledge when they cover the topic.',
  'The athlete context in this message is factual: never invent or contradict it. If useful athlete information is missing, say what is missing instead of assuming it.',
  'You may use broader sports-performance knowledge to reason and explain, but never claim a recommendation came from SprintLab\'s documentation when it actually came from general knowledge.',
  'SprintLab\'s deterministic planner rules are a strong baseline, not an absolute ceiling, unless they represent a genuine safety or data-integrity constraint — explain any meaningful deviation from that baseline.',
  'The message may include COACH UI CONTEXT (which SprintLab screen the athlete opened Coach from, and an entity such as a specific workout if one was in view) and a RECENT CONVERSATION transcript. Use both to understand short follow-ups like "why not Saturday instead?" without asking the athlete to repeat themselves — but the transcript is a bounded recent window, not the full conversation history, so do not assume anything said earlier than what is shown.',
  'The message may include a SPLIT NOTICED line: a single local, deterministic signal SprintLab detected from the athlete\'s own data (e.g. a missed session, an unusually demanding session, lower readiness) that is why Split proactively has the athlete\'s attention right now. Treat it as a hint about what the athlete likely wants to discuss, not as a directive — it never determines your answer or forces a proposal on its own.',
  'You must always respond with the given JSON schema: {"message": string, "proposal": object|null}.',
  '"message" is your normal explanatory answer to the athlete. Write it for most questions; leave "proposal" null.',
  `Only set "proposal" when a concrete change to a specific future plan day is clearly warranted (a missed session, a schedule conflict, a fatigue/soreness pattern, an explicit athlete request to change the plan). Its "type" must be exactly one of: ${PLAN_CHANGE_TYPES.join(', ')}.`,
  'A proposal never targets a date before today, and never targets a date SprintLab already has completed training history for — you cannot see history for dates outside what the athlete context provides, so when unsure, do not propose a change to that date.',
  '"workoutId" in a proposal must be the id of the workout currently scheduled on "date" as given in the athlete context, so SprintLab can confirm nothing has changed since you generated the proposal.',
  'You cannot modify the athlete\'s plan yourself. A proposal is only a suggestion; SprintLab validates it and the athlete must explicitly approve it before anything is saved.',
].join(' ');

const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONTEXT_JSON_LENGTH = 20_000;
const MAX_SURFACE_LENGTH = 60;
const MAX_ENTITY_LENGTH = 200;
const MAX_HISTORY_ENTRIES = 8;
const MAX_HISTORY_TEXT_LENGTH = 800;
const MAX_TRIGGER_TYPE_LENGTH = 60;
const MAX_TRIGGER_MESSAGE_LENGTH = 300;

type HistoryTurn = { role: 'athlete' | 'split'; text: string };

/** Shallow shape-check on the client-supplied conversation window — defensive server-side bound to match the client's own boundedHistory() cap, never trusted blindly. */
function validateHistory(history: unknown): { ok: true; turns: HistoryTurn[] } | { ok: false; message: string } {
  if (history === undefined) return { ok: true, turns: [] };
  if (!Array.isArray(history)) return { ok: false, message: '"history" must be an array.' };
  if (history.length > MAX_HISTORY_ENTRIES) return { ok: false, message: `"history" must have at most ${MAX_HISTORY_ENTRIES} entries.` };
  const turns: HistoryTurn[] = [];
  for (const entry of history) {
    if (typeof entry !== 'object' || entry === null) return { ok: false, message: '"history" entries must be objects.' };
    const { role, text } = entry as Record<string, unknown>;
    if (role !== 'athlete' && role !== 'split') return { ok: false, message: '"history" entry role must be "athlete" or "split".' };
    if (typeof text !== 'string' || !text.trim()) return { ok: false, message: '"history" entry text must be a non-empty string.' };
    turns.push({ role, text: text.slice(0, MAX_HISTORY_TEXT_LENGTH) });
  }
  return { ok: true, turns };
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

type ActiveTriggerInfo = { type: string; date?: string; message: string };

/** Shallow shape-check on the client-supplied active local trigger (utils/coach-triggers.ts's
 * CoachTrigger, reduced to a compact {type, date, message}) — SprintLab's own locally-detected
 * signal, never a Gemini output. Not authoritative for anything; purely a hint forwarded to the
 * model, same defensive-bound treatment as history/context. */
function validateActiveTrigger(activeTrigger: unknown): { ok: true; trigger: ActiveTriggerInfo | null } | { ok: false; message: string } {
  if (activeTrigger === undefined || activeTrigger === null) return { ok: true, trigger: null };
  if (typeof activeTrigger !== 'object') return { ok: false, message: '"activeTrigger" must be an object if provided.' };
  const { type, date, message } = activeTrigger as Record<string, unknown>;
  if (typeof type !== 'string' || !type || type.length > MAX_TRIGGER_TYPE_LENGTH) {
    return { ok: false, message: `"activeTrigger.type" must be a non-empty string of at most ${MAX_TRIGGER_TYPE_LENGTH} characters.` };
  }
  if (typeof message !== 'string' || !message || message.length > MAX_TRIGGER_MESSAGE_LENGTH) {
    return { ok: false, message: `"activeTrigger.message" must be a non-empty string of at most ${MAX_TRIGGER_MESSAGE_LENGTH} characters.` };
  }
  if (date !== undefined && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    return { ok: false, message: '"activeTrigger.date" must be an ISO date string (YYYY-MM-DD) if provided.' };
  }
  return { ok: true, trigger: { type, date, message } };
}

/** Bounds/shape-checks the client-supplied athlete context without deeply validating every field. */
function validateContext(context: unknown): { ok: true; json: string | null } | { ok: false; message: string } {
  if (context === undefined) return { ok: true, json: null };
  if (typeof context !== 'object' || context === null || Array.isArray(context)) {
    return { ok: false, message: '"context" must be a JSON object.' };
  }
  let json: string;
  try {
    json = JSON.stringify(context);
  } catch {
    return { ok: false, message: '"context" must be JSON-serializable.' };
  }
  if (json.length > MAX_CONTEXT_JSON_LENGTH) {
    return { ok: false, message: `"context" is too large (max ${MAX_CONTEXT_JSON_LENGTH} characters serialized).` };
  }
  return { ok: true, json };
}

/** Shallow shape-check only — this is Gemini's own output, not athlete data. Full plan-state
 * validation happens on-device in utils/plan-change-validator.ts, which is the layer that
 * actually protects storage integrity. */
function sanitizeCoachPayload(raw: unknown): CoachResponsePayload | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { message, proposal } = raw as Record<string, unknown>;
  if (typeof message !== 'string') return null;
  if (proposal === null || proposal === undefined) return { message, proposal: null };
  if (typeof proposal !== 'object') return null;
  const candidate = proposal as Record<string, unknown>;
  if (typeof candidate.type !== 'string' || !PLAN_CHANGE_TYPES.includes(candidate.type as never)) return null;
  if (typeof candidate.date !== 'string' || typeof candidate.reason !== 'string') return null;
  return { message, proposal: candidate as CoachResponsePayload['proposal'] };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Request body must be valid JSON.', 400);
  }

  if (typeof body !== 'object' || body === null || !('message' in body)) {
    return errorResponse('A "message" field is required.', 400);
  }

  const { message, context, today, surface, entityId, entityLabel, history, activeTrigger } = body as {
    message: unknown; context?: unknown; today?: unknown; surface?: unknown; entityId?: unknown; entityLabel?: unknown; history?: unknown; activeTrigger?: unknown;
  };
  if (typeof message !== 'string' || message.trim().length === 0) {
    return errorResponse('"message" must be a non-empty string.', 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return errorResponse(`"message" must be ${MAX_MESSAGE_LENGTH} characters or fewer.`, 413);
  }
  if (today !== undefined && (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today))) {
    return errorResponse('"today" must be an ISO date string (YYYY-MM-DD) if provided.', 400);
  }
  if (surface !== undefined && (typeof surface !== 'string' || surface.length > MAX_SURFACE_LENGTH)) {
    return errorResponse(`"surface" must be a string of at most ${MAX_SURFACE_LENGTH} characters.`, 400);
  }
  if (entityId !== undefined && (typeof entityId !== 'string' || entityId.length > MAX_ENTITY_LENGTH)) {
    return errorResponse(`"entityId" must be a string of at most ${MAX_ENTITY_LENGTH} characters.`, 400);
  }
  if (entityLabel !== undefined && (typeof entityLabel !== 'string' || entityLabel.length > MAX_ENTITY_LENGTH)) {
    return errorResponse(`"entityLabel" must be a string of at most ${MAX_ENTITY_LENGTH} characters.`, 400);
  }

  const contextResult = validateContext(context);
  if (!contextResult.ok) {
    return errorResponse(contextResult.message, 400);
  }
  const historyResult = validateHistory(history);
  if (!historyResult.ok) {
    return errorResponse(historyResult.message, 400);
  }
  const triggerResult = validateActiveTrigger(activeTrigger);
  if (!triggerResult.ok) {
    return errorResponse(triggerResult.message, 400);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return errorResponse('Coach is not configured.', 500);
  }

  try {
    const ai = createGeminiClient(apiKey);
    const storeName = await findKnowledgeStoreName(ai);

    const contextPrefix = contextResult.json
      ? `ATHLETE CONTEXT (factual, from SprintLab's own data — do not invent or contradict):\n${contextResult.json}\n\n`
      : '';
    const todayPrefix = typeof today === 'string' ? `TODAY'S DATE: ${today}\n\n` : '';
    const surfaceLine = typeof surface === 'string' && surface
      ? `COACH UI CONTEXT: opened from the SprintLab "${surface}" screen${typeof entityLabel === 'string' && entityLabel ? ` (currently viewing: ${entityLabel})` : ''}.\n\n`
      : '';
    const historyBlock = historyResult.turns.length
      ? `RECENT CONVERSATION (most recent last; a bounded window, not the full history):\n${historyResult.turns.map(turn => `${turn.role === 'athlete' ? 'Athlete' : 'Split'}: ${turn.text}`).join('\n')}\n\n`
      : '';
    const triggerLine = triggerResult.trigger
      ? `SPLIT NOTICED (${triggerResult.trigger.type}${triggerResult.trigger.date ? `, ${triggerResult.trigger.date}` : ''}): ${triggerResult.trigger.message}\n\n`
      : '';
    const input = `${todayPrefix}${contextPrefix}${surfaceLine}${triggerLine}${historyBlock}ATHLETE QUESTION:\n${message}`;

    const interaction = await ai.interactions.create({
      model: GEMINI_MODEL,
      input,
      system_instruction: SYSTEM_INSTRUCTION,
      stream: false,
      response_format: { type: 'text', mime_type: 'application/json', schema: COACH_RESPONSE_JSON_SCHEMA },
      ...(storeName ? { tools: [{ type: 'file_search', file_search_store_names: [storeName] }] } : {}),
    });
    if (!interaction.output_text) return errorResponse('Unable to generate coach response.', 502);

    let parsed: unknown;
    try {
      parsed = JSON.parse(interaction.output_text);
    } catch {
      return errorResponse('Coach returned a response SprintLab could not parse.', 502);
    }
    const payload = sanitizeCoachPayload(parsed);
    if (!payload) return errorResponse('Coach returned an unexpected response shape.', 502);

    return Response.json(payload);
  } catch (err) {
    const status = (err as { status?: number; statusCode?: number } | null)?.status
      ?? (err as { statusCode?: number } | null)?.statusCode;
    if (status === 429) return errorResponse('Gemini rate-limited this request. Try again later.', 429);
    return errorResponse('Unable to generate coach response.', 502);
  }
}
