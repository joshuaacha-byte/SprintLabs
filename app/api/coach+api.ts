import { createGeminiClient, findKnowledgeStoreName, GEMINI_MODEL } from '@/utils/gemini';
import { COACH_RESPONSE_JSON_SCHEMA, PLAN_CHANGE_TYPES, type CoachResponsePayload } from '@/types/ai-plan-change';
import { COACH_ACTION_TYPES, type CoachAction } from '@/types/coach-action';

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
  'You must always respond with the given JSON schema: {"message": string, "proposal": object|null, "action": object|null}.',
  '"message" is your normal explanatory answer to the athlete. Write it for most questions; leave "proposal" and "action" null.',
  'RESPONSE STYLE for "message": default to concise, conversational answers — most normal responses should be roughly 2-5 short paragraphs or a few short bullets. Lead with the most useful conclusion rather than a long preamble. Do not produce a formal report unless the athlete explicitly asks for a detailed analysis, breakdown, or full review. Avoid unnecessary numbered sections like "1. Training Adherence", "2. Recovery" for ordinary questions. Do not repeat athlete data just to prove you have it — mention only the athlete data that materially affects the answer. Prefer plain, direct coaching language over academic or clinical wording, and do not over-explain basic sprint concepts unless asked. Markdown is allowed for useful emphasis or short bullet lists, but do not use headings or report-style formatting for ordinary answers.',
  'For example, instead of "Here is an honest, objective breakdown of your week based on your logged data...", prefer "You\'ve missed most of this week\'s work, so I wouldn\'t try to cram it all into today." Instead of a "### 2. Readiness & Recovery / Missing Data: There are currently no readiness scores..." section, prefer "I don\'t have a readiness check from today, so before changing the session: how are your legs feeling?"',
  'If information that materially changes the recommendation is missing, briefly say what is missing and ask ONE useful follow-up question — do not ask a follow-up if the existing context is already enough to answer confidently. When the athlete explicitly asks for more detail — "go deeper", "break it down", "analyze this", "why exactly", a full breakdown, or a detailed explanation — the concise default no longer applies: give a longer, more thorough answer and do not artificially cap useful detail just to stay short. Even then, keep it structured and readable (clear paragraphs, headings, or bullets where they aid scanning) rather than verbose for its own sake. Concision should never remove safety-relevant nuance or important warnings, and never manufacture certainty you don\'t have.',
  `Only set "proposal" when a concrete change to a specific future plan day is clearly warranted (a missed session, a schedule conflict, a fatigue/soreness pattern, an explicit athlete request to change the plan). Its "type" must be exactly one of: ${PLAN_CHANGE_TYPES.join(', ')}.`,
  'A proposal never targets a date before today, and never targets a date SprintLab already has completed training history for — you cannot see history for dates outside what the athlete context provides, so when unsure, do not propose a change to that date.',
  '"workoutId" in a proposal must be the id of the workout currently scheduled on "date" as given in the athlete context, so SprintLab can confirm nothing has changed since you generated the proposal.',
  'The athlete context includes "libraryCandidates": a small, pre-retrieved list of real Approved Workout Library sessions relevant to today\'s session and this athlete (id, name, category, duration, equipment, surface, purpose) — not the full library. For "replace_workout" or "change_workout_variant", "newWorkoutId" must be the id of one of these candidates. If none of them fit what the athlete is asking for, do not invent a different id — explain in "message" that you don\'t have a suitable Library match rather than guessing one.',
  'You cannot modify the athlete\'s plan yourself. A proposal is only a suggestion; SprintLab validates it and the athlete must explicitly approve it before anything is saved.',
  `"action", if set, must be exactly one of these known SprintLab workflows: ${COACH_ACTION_TYPES.join(', ')}. This is a request for SprintLab to show a card that opens an existing in-app screen — you are never given a route or URL to return, and you cannot invent one; "action" only ever carries its type and, for a few types, one small supporting field (workoutId for view_workout, date for log_session, field for update_profile). SprintLab independently re-validates whatever you return against live data before showing anything, so an unresolvable action simply falls back to your plain text.`,
  'Use "action" only when the athlete would genuinely benefit from entering that existing workflow right now, and only when you can identify the specific real entity involved from the given context — never invent a workoutId, date, or profile field. Guidance: today\'s readiness is missing and it materially affects your recommendation -> complete_readiness. You are discussing a specific real workout (its id is available from context, e.g. the workout the athlete is currently viewing) and its details matter -> view_workout. The athlete is ready to perform today\'s real scheduled session -> start_workout. A real, specific past session was not logged and that missing information matters -> log_session. Several schedule issues need broader review rather than one specific fix -> review_week. Important structured athlete data is missing from their profile -> update_profile.',
  'Do not force "action" into every response, and do not return it merely to make the reply feel interactive — most responses should leave it null. If a required entity (a workout id, a specific date) cannot be identified from the given context, use plain text instead of guessing. Never set both "proposal" and "action" in the same response — if a concrete plan change is warranted, return the proposal and leave "action" null.',
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
function sanitizeCoachProposal(proposal: unknown): CoachResponsePayload['proposal'] | undefined {
  if (proposal === null || proposal === undefined) return null;
  if (typeof proposal !== 'object') return undefined;
  const candidate = proposal as Record<string, unknown>;
  if (typeof candidate.type !== 'string' || !PLAN_CHANGE_TYPES.includes(candidate.type as never)) return undefined;
  if (typeof candidate.date !== 'string' || typeof candidate.reason !== 'string') return undefined;
  return candidate as CoachResponsePayload['proposal'];
}

/** Shallow shape-check only, same trust level as the proposal above — this is a REQUEST for a
 * card, never unquestioned truth. Real resolution/validation against live storage happens
 * client-side in utils/coach-actions-resolve.ts before anything renders as tappable. `type` is
 * strictly allowlisted (COACH_ACTION_TYPES) — there is no field here that could ever carry an
 * arbitrary route or URL. */
function sanitizeCoachAction(action: unknown): CoachAction | null | undefined {
  if (action === null || action === undefined) return null;
  if (typeof action !== 'object') return undefined;
  const candidate = action as Record<string, unknown>;
  if (typeof candidate.type !== 'string' || !COACH_ACTION_TYPES.includes(candidate.type as never)) return undefined;
  switch (candidate.type) {
    case 'view_workout':
      if (typeof candidate.workoutId !== 'string' || !candidate.workoutId.trim()) return undefined;
      return { type: 'view_workout', workoutId: candidate.workoutId };
    case 'log_session':
      return { type: 'log_session', date: typeof candidate.date === 'string' ? candidate.date : undefined };
    case 'update_profile':
      return { type: 'update_profile', field: typeof candidate.field === 'string' ? candidate.field : undefined };
    case 'complete_readiness':
    case 'start_workout':
    case 'review_week':
      return { type: candidate.type };
    default:
      return undefined;
  }
}

/** Combines the two sanitizers and enforces the single-card rule: a valid proposal always wins,
 * so the client only ever has to render one primary card per response (see the module doc on
 * CoachResponsePayload in types/ai-plan-change.ts). Exported (despite this being a route file)
 * because it — like sanitizeCoachAction above — is pure sync shape-checking with zero
 * AsyncStorage/network dependency, so scripts/verify-coach-actions.ts can exercise the real
 * single-card-precedence and malformed-action-rejection logic under plain Node rather than just
 * asserting the property by inspection. */
export function sanitizeCoachPayload(raw: unknown): CoachResponsePayload | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { message, proposal, action } = raw as Record<string, unknown>;
  if (typeof message !== 'string') return null;

  const sanitizedProposal = sanitizeCoachProposal(proposal);
  if (sanitizedProposal === undefined) return null;
  if (sanitizedProposal) return { message, proposal: sanitizedProposal, action: null };

  const sanitizedAction = sanitizeCoachAction(action);
  if (sanitizedAction === undefined) return null;
  return { message, proposal: null, action: sanitizedAction };
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
    // TEMP DIAGNOSTIC: distinguishes a missing server-side env var (misconfigured deployment)
    // from a genuine Gemini-side failure below.
    console.error('[coach api] GEMINI_API_KEY is not set in this server environment.');
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
    if (!interaction.output_text) {
      console.error('[coach api] Gemini returned an empty output_text.');
      return errorResponse('Unable to generate coach response.', 502);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(interaction.output_text);
    } catch (err) {
      console.error('[coach api] Gemini output_text was not valid JSON:', err);
      return errorResponse('Coach returned a response SprintLab could not parse.', 502);
    }
    const payload = sanitizeCoachPayload(parsed);
    if (!payload) {
      console.error('[coach api] Gemini JSON did not match the expected coach response shape:', parsed);
      return errorResponse('Coach returned an unexpected response shape.', 502);
    }

    return Response.json(payload);
  } catch (err) {
    const status = (err as { status?: number; statusCode?: number } | null)?.status
      ?? (err as { statusCode?: number } | null)?.statusCode;
    if (status === 429) {
      console.warn('[coach api] Gemini rate-limited this request.');
      return errorResponse('Gemini rate-limited this request. Try again later.', 429);
    }
    // TEMP DIAGNOSTIC: any other exception from createGeminiClient/findKnowledgeStoreName/
    // ai.interactions.create — a genuine Gemini API error, not a network/routing issue.
    console.error('[coach api] Unhandled error calling Gemini:', err);
    return errorResponse('Unable to generate coach response.', 502);
  }
}
