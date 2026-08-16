import type { PlanChangeProposal, ScheduledDay } from '@/types';
import { getLibraryWorkout, getLibraryWorkouts, isRecommendationEligible } from '@/utils/workout-library';
import { libraryWorkoutToPlannedWorkout } from '@/utils/plan-selector';
import { getScheduledDayForDate, getTrainingLogs, saveFutureWorkoutOverride, saveRestDateOverride } from '@/utils/storage';
import { scaleWorkoutVolume, validatePlanChangeProposal, type PlanChangeContext, type ScheduledDaySnapshot } from '@/utils/plan-change-validator';

/**
 * SprintLab Intelligence I-2: the single entry point that turns an athlete-approved
 * PlanChangeProposal into a real plan mutation. Gemini never calls storage directly —
 * everything the AI proposes flows through here, and only after re-validating against
 * the plan state as it exists right now (not the state captured when the proposal was
 * generated), so a change that has gone stale fails safely instead of silently applying.
 */

const localDateKey = (date = new Date()) => date.toLocaleDateString('en-CA');

const snapshot = (day: ScheduledDay): ScheduledDaySnapshot => ({
  dayIndex: day.dayIndex,
  kind: day.kind,
  workout: day.kind === 'workout' ? day.workout : undefined,
});

async function buildLiveContext(proposal: PlanChangeProposal): Promise<PlanChangeContext> {
  const dates = [proposal.date, ...(proposal.toDate ? [proposal.toDate] : [])];
  const [dayEntries, logs, libraryWorkouts] = await Promise.all([
    Promise.all(dates.map(async date => [date, snapshot(await getScheduledDayForDate(date))] as const)),
    getTrainingLogs(),
    getLibraryWorkouts(),
  ]);

  return {
    todayDateKey: localDateKey(),
    scheduledDays: Object.fromEntries(dayEntries),
    historyDates: new Set(logs.map(log => log.date)),
    approvedLibraryWorkoutIds: new Set(libraryWorkouts.filter(isRecommendationEligible).map(workout => workout.id)),
  };
}

export type ApplyPlanChangeResult =
  | { ok: true; updatedDates: string[] }
  | { ok: false; errors: string[] };

export async function applyAIPlanChange(proposal: PlanChangeProposal): Promise<ApplyPlanChangeResult> {
  const context = await buildLiveContext(proposal);
  const validation = validatePlanChangeProposal(proposal, context);
  if (!validation.ok) return { ok: false, errors: validation.errors };

  const currentDay = context.scheduledDays[proposal.date];

  switch (proposal.type) {
    case 'move_workout': {
      const workout = currentDay.workout!;
      await saveFutureWorkoutOverride(workout, proposal.toDate!);
      await saveRestDateOverride(proposal.date, 'Rest day', `Moved to ${proposal.toDate} — ${proposal.reason}`);
      return { ok: true, updatedDates: [proposal.date, proposal.toDate!] };
    }
    case 'replace_workout':
    case 'change_workout_variant': {
      const replacement = await getLibraryWorkout(proposal.newWorkoutId!);
      if (!replacement || !isRecommendationEligible(replacement)) {
        return { ok: false, errors: [`newWorkoutId "${proposal.newWorkoutId}" is no longer an Approved Workout Library record.`] };
      }
      await saveFutureWorkoutOverride(libraryWorkoutToPlannedWorkout(replacement), proposal.date);
      return { ok: true, updatedDates: [proposal.date] };
    }
    case 'adjust_volume': {
      const scaled = scaleWorkoutVolume(currentDay.workout!, proposal.modifier!);
      await saveFutureWorkoutOverride(scaled, proposal.date);
      return { ok: true, updatedDates: [proposal.date] };
    }
    case 'add_recovery_day': {
      await saveRestDateOverride(proposal.date, proposal.recoveryTitle || 'Recovery day', proposal.recoveryNote || proposal.reason);
      return { ok: true, updatedDates: [proposal.date] };
    }
    case 'remove_future_workout': {
      await saveRestDateOverride(proposal.date, 'Rest day', proposal.reason);
      return { ok: true, updatedDates: [proposal.date] };
    }
    default:
      return { ok: false, errors: [`Unsupported proposal type "${(proposal as { type?: string }).type}".`] };
  }
}
