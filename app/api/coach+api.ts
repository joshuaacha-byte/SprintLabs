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
  'You must always respond with the given JSON schema: {"message": string, "proposal": object|null}.',
  '"message" is your normal explanatory answer to the athlete. Write it for most questions; leave "proposal" null.',
  `Only set "proposal" when a concrete change to a specific future plan day is clearly warranted (a missed session, a schedule conflict, a fatigue/soreness pattern, an explicit athlete request to change the plan). Its "type" must be exactly one of: ${PLAN_CHANGE_TYPES.join(', ')}.`,
  'A proposal never targets a date before today, and never targets a date SprintLab already has completed training history for — you cannot see history for dates outside what the athlete context provides, so when unsure, do not propose a change to that date.',
  '"workoutId" in a proposal must be the id of the workout currently scheduled on "date" as given in the athlete context, so SprintLab can confirm nothing has changed since you generated the proposal.',
  'You cannot modify the athlete\'s plan yourself. A proposal is only a suggestion; SprintLab validates it and the athlete must explicitly approve it before anything is saved.',
].join(' ');

const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONTEXT_JSON_LENGTH = 20_000;

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
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

  const { message, context, today } = body as { message: unknown; context?: unknown; today?: unknown };
  if (typeof message !== 'string' || message.trim().length === 0) {
    return errorResponse('"message" must be a non-empty string.', 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return errorResponse(`"message" must be ${MAX_MESSAGE_LENGTH} characters or fewer.`, 413);
  }
  if (today !== undefined && (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today))) {
    return errorResponse('"today" must be an ISO date string (YYYY-MM-DD) if provided.', 400);
  }

  const contextResult = validateContext(context);
  if (!contextResult.ok) {
    return errorResponse(contextResult.message, 400);
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
    const input = `${todayPrefix}${contextPrefix}ATHLETE QUESTION:\n${message}`;

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
