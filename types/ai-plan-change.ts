/**
 * SprintLab Intelligence I-2: typed schema for AI-proposed plan changes.
 *
 * Gemini returns a `PlanChangeProposal` alongside its explanatory text (see /api/coach).
 * A proposal is never applied automatically — it is validated locally
 * (`utils/plan-change-validator.ts`), shown to the athlete for review, and only written to
 * storage after explicit approval, through the single `applyAIPlanChange` entry point
 * (`utils/plan-change-apply.ts`).
 *
 * The schema is intentionally flat (one shape, `type` discriminant) rather than a real
 * TypeScript discriminated union, because that is what reliably survives Gemini's JSON
 * structured-output schema. `PLAN_CHANGE_PROPOSAL_JSON_SCHEMA` below is the JSON Schema
 * sent to the model; keep both in sync when either changes.
 */

export type PlanChangeType =
  | 'move_workout'
  | 'replace_workout'
  | 'change_workout_variant'
  | 'adjust_volume'
  | 'add_recovery_day'
  | 'remove_future_workout';

export type PlanChangeConfidence = 'low' | 'medium' | 'high';

export type PlanChangeProposal = {
  type: PlanChangeType;
  /** ISO date (YYYY-MM-DD) of the plan day this proposal targets. */
  date: string;
  /** move_workout only: the destination ISO date. */
  toDate?: string;
  /** The PlannedWorkout.id currently scheduled on `date`, used to confirm nothing changed since the proposal was generated. Required for move_workout, adjust_volume, remove_future_workout; recommended for replace_workout/change_workout_variant. */
  workoutId?: string;
  /** replace_workout / change_workout_variant: an Approved Workout Library id to schedule on `date` instead. */
  newWorkoutId?: string;
  /** adjust_volume: multiplier applied to reps/sets/distance across the workout's exercises. */
  modifier?: number;
  /** add_recovery_day: optional authored title/note for the resulting rest day. */
  recoveryTitle?: string;
  recoveryNote?: string;
  /** Short, concrete explanation of why this change is proposed. Always required. */
  reason: string;
  confidence?: PlanChangeConfidence;
};

/** Gemini structured-output response shape for /api/coach: a normal answer, optionally with one proposal. */
export type CoachResponsePayload = {
  message: string;
  proposal: PlanChangeProposal | null;
};

export const PLAN_CHANGE_TYPES: PlanChangeType[] = [
  'move_workout',
  'replace_workout',
  'change_workout_variant',
  'adjust_volume',
  'add_recovery_day',
  'remove_future_workout',
];

/** JSON Schema passed to Gemini's response_format so /api/coach gets a typed reply instead of parsed prose. */
export const COACH_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    message: {
      type: 'string',
      description: 'The explanatory answer shown to the athlete. Always present, even when a proposal is included.',
    },
    proposal: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          properties: {
            type: { type: 'string', enum: PLAN_CHANGE_TYPES },
            date: { type: 'string', description: 'ISO date (YYYY-MM-DD) of the plan day being changed. Must be today or a future date.' },
            toDate: { type: 'string', description: 'move_workout only: destination ISO date.' },
            workoutId: { type: 'string', description: 'The id of the workout currently scheduled on `date`.' },
            newWorkoutId: { type: 'string', description: 'replace_workout / change_workout_variant only: an Approved Workout Library id.' },
            modifier: { type: 'number', description: 'adjust_volume only: a multiplier, typically between 0.5 and 1.2.' },
            recoveryTitle: { type: 'string' },
            recoveryNote: { type: 'string' },
            reason: { type: 'string', description: 'Short, concrete explanation for the athlete.' },
            confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
          required: ['type', 'date', 'reason'],
        },
      ],
    },
  },
  required: ['message', 'proposal'],
} as const;
