/**
 * SprintLab Coach UI Phase C-4: typed, allowlisted navigation/workflow actions Gemini can return
 * alongside its message. A `CoachAction` never carries a route string — it is a discriminated
 * union of known SprintLab workflows, and the client (utils/coach-actions-resolve.ts) owns the
 * mapping from each type to a real, hardcoded destination. Gemini cannot navigate anywhere it
 * wants; it can only ask for one of these exact, pre-approved workflows.
 *
 * This is deliberately separate from PlanChangeProposal (types/ai-plan-change.ts): a proposal
 * can mutate the plan (through validation + explicit approval); a CoachAction never mutates
 * anything by itself — it only opens an existing SprintLab screen so the athlete can act there
 * through the app's normal, already-reviewed flows.
 */

export type CoachActionType =
  | 'complete_readiness'
  | 'view_workout'
  | 'start_workout'
  | 'log_session'
  | 'review_week'
  | 'update_profile';

export type CoachAction =
  | { type: 'complete_readiness' }
  /** References an existing Workout Library id — resolved/validated against live storage before
   * a card is ever shown (see utils/coach-actions-resolve.ts). An id that doesn't resolve to a
   * real record never renders a button. */
  | { type: 'view_workout'; workoutId: string }
  /** Always targets the athlete's real, currently scheduled TODAY workout — resolved fresh from
   * storage, never from anything Gemini supplies, so there is no id to trust or hallucinate. */
  | { type: 'start_workout' }
  /** `date`, if given, is only a display hint used to look up the real scheduled title for that
   * day; the destination itself (the existing /log route) takes no parameters. */
  | { type: 'log_session'; date?: string }
  | { type: 'review_week' }
  /** `field` is a short, purely descriptive label (e.g. "training frequency") for which profile
   * detail is relevant — never used for navigation logic, just shown on the card. */
  | { type: 'update_profile'; field?: string };

export const COACH_ACTION_TYPES: CoachActionType[] = [
  'complete_readiness',
  'view_workout',
  'start_workout',
  'log_session',
  'review_week',
  'update_profile',
];

/** JSON Schema passed to Gemini's response_format for the "action" field. Every field besides
 * `type` is optional so the schema stays a single flat object (same reasoning as
 * PlanChangeProposal's flat shape in types/ai-plan-change.ts) rather than a real oneOf per type,
 * which is what reliably survives Gemini's structured-output support. */
export const COACH_ACTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: COACH_ACTION_TYPES },
    workoutId: { type: 'string', description: 'view_workout only: an existing SprintLab Workout Library id — the workout currently being discussed. Never invent one.' },
    date: { type: 'string', description: 'log_session only: ISO date (YYYY-MM-DD) of the real unlogged session, if known.' },
    field: { type: 'string', description: 'update_profile only: a short label naming the specific missing/relevant profile field (e.g. "training frequency").' },
  },
  required: ['type'],
} as const;
