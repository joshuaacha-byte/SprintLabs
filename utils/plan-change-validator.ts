import type { PlanChangeProposal, PlannedWorkout, WeekdayIndex } from '@/types';

/**
 * SprintLab Intelligence I-2: deterministic, storage-free validator for AI-proposed plan
 * changes. This does not re-coach Gemini or re-derive the Season Engine — it only protects
 * data/app integrity: does the target exist, is it editable, is the proposed value sane.
 *
 * Pure by design (no AsyncStorage) so it can run in `scripts/verify-ai-plan-change.ts`
 * against fixtures without a device or a live Gemini call.
 */

export type ScheduledDaySnapshot = {
  dayIndex: WeekdayIndex;
  kind: 'workout' | 'rest';
  workout?: PlannedWorkout;
};

export type PlanChangeContext = {
  /** ISO date (YYYY-MM-DD), the athlete's "today" the proposal is being validated against. */
  todayDateKey: string;
  /** Resolved plan day (recurring schedule + any future-date override already applied) for every date this proposal references. Missing entries are treated as "no record for that date". */
  scheduledDays: Record<string, ScheduledDaySnapshot>;
  /** Dates that already have a saved TrainingLog — history, immutable regardless of status. */
  historyDates: Set<string>;
  /** Approved Workout Library ids eligible as a replace_workout / change_workout_variant target. */
  approvedLibraryWorkoutIds: Set<string>;
};

export type PlanChangeValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_VOLUME_MODIFIER = 0.5;
const MAX_VOLUME_MODIFIER = 1.2;

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

/** Hard constraint: never touch a date before today, or a date SprintLab already logged history for. */
function checkDateEditable(date: string, context: PlanChangeContext, errors: string[], label = 'date') {
  if (!isValidIsoDate(date)) {
    errors.push(`${label} "${date}" is not a valid ISO date.`);
    return false;
  }
  if (date < context.todayDateKey) {
    errors.push(`${label} ${date} is in the past and cannot be modified.`);
    return false;
  }
  if (context.historyDates.has(date)) {
    errors.push(`${label} ${date} already has completed training history and cannot be modified.`);
    return false;
  }
  return true;
}

function requireScheduledDay(date: string, context: PlanChangeContext, errors: string[]): ScheduledDaySnapshot | null {
  const day = context.scheduledDays[date];
  if (!day) {
    errors.push(`No plan record exists for ${date}.`);
    return null;
  }
  return day;
}

function requireCurrentWorkout(day: ScheduledDaySnapshot, expectedWorkoutId: string | undefined, date: string, errors: string[]): PlannedWorkout | null {
  if (day.kind !== 'workout' || !day.workout) {
    errors.push(`${date} is currently a rest day; there is no scheduled workout to change.`);
    return null;
  }
  if (expectedWorkoutId && day.workout.id !== expectedWorkoutId) {
    errors.push(`The workout scheduled on ${date} has changed since this proposal was generated (expected "${expectedWorkoutId}", found "${day.workout.id}"). Ask for a fresh recommendation.`);
    return null;
  }
  return day.workout;
}

export function validatePlanChangeProposal(proposal: PlanChangeProposal, context: PlanChangeContext): PlanChangeValidationResult {
  const errors: string[] = [];

  if (!proposal || typeof proposal !== 'object') {
    return { ok: false, errors: ['Proposal is missing or malformed.'] };
  }
  if (!proposal.reason || !proposal.reason.trim()) {
    errors.push('Proposal is missing a reason.');
  }
  if (!checkDateEditable(proposal.date, context, errors)) {
    return { ok: false, errors };
  }
  const day = requireScheduledDay(proposal.date, context, errors);
  if (!day) return { ok: false, errors };

  switch (proposal.type) {
    case 'move_workout': {
      const workout = requireCurrentWorkout(day, proposal.workoutId, proposal.date, errors);
      if (!proposal.toDate) {
        errors.push('move_workout requires a toDate.');
      } else if (proposal.toDate === proposal.date) {
        errors.push('toDate must be different from date.');
      } else {
        checkDateEditable(proposal.toDate, context, errors, 'toDate');
        if (!context.scheduledDays[proposal.toDate]) {
          errors.push(`No plan record exists for toDate ${proposal.toDate}.`);
        }
      }
      if (!workout) break;
      break;
    }
    case 'replace_workout':
    case 'change_workout_variant': {
      requireCurrentWorkout(day, proposal.workoutId, proposal.date, errors);
      if (!proposal.newWorkoutId) {
        errors.push(`${proposal.type} requires newWorkoutId.`);
      } else if (!context.approvedLibraryWorkoutIds.has(proposal.newWorkoutId)) {
        errors.push(`newWorkoutId "${proposal.newWorkoutId}" does not exist or is not an Approved Workout Library record.`);
      }
      break;
    }
    case 'adjust_volume': {
      requireCurrentWorkout(day, proposal.workoutId, proposal.date, errors);
      if (typeof proposal.modifier !== 'number' || !Number.isFinite(proposal.modifier)) {
        errors.push('adjust_volume requires a numeric modifier.');
      } else if (proposal.modifier < MIN_VOLUME_MODIFIER || proposal.modifier > MAX_VOLUME_MODIFIER) {
        errors.push(`modifier ${proposal.modifier} is outside the safe technical range (${MIN_VOLUME_MODIFIER}–${MAX_VOLUME_MODIFIER}).`);
      }
      break;
    }
    case 'add_recovery_day': {
      // A day that is already rest is a harmless no-op; nothing further to validate.
      break;
    }
    case 'remove_future_workout': {
      requireCurrentWorkout(day, proposal.workoutId, proposal.date, errors);
      break;
    }
    default:
      errors.push(`Unsupported proposal type "${(proposal as { type?: string }).type}".`);
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

/** Pure transform used by the apply step: scales a workout's quantifiable fields by `modifier`, preserving schema. */
export function scaleWorkoutVolume(workout: PlannedWorkout, modifier: number): PlannedWorkout {
  const scaleInt = (value: number) => Math.max(1, Math.round(value * modifier));
  return {
    ...workout,
    sections: workout.sections.map(section => ({
      ...section,
      exercises: section.exercises.map(exercise => {
        if (exercise.tracking.kind === 'track') {
          return {
            ...exercise,
            tracking: {
              ...exercise.tracking,
              reps: scaleInt(exercise.tracking.reps),
              distanceMeters: exercise.tracking.distanceMeters ? scaleInt(exercise.tracking.distanceMeters) : exercise.tracking.distanceMeters,
            },
          };
        }
        if (exercise.tracking.kind === 'strength') {
          return {
            ...exercise,
            tracking: {
              ...exercise.tracking,
              sets: scaleInt(exercise.tracking.sets),
            },
          };
        }
        return exercise;
      }),
    })),
  };
}
