import type { PendingWorkoutLaunch, PlannedWorkout, WeekdayIndex } from '@/types';
import {
  clearPendingWorkoutLaunch,
  getActiveWorkoutSession,
  getReadiness,
  savePendingWorkoutLaunch,
  startWorkoutSession,
} from '@/utils/storage';
import { evaluateReadiness, workoutIncludesMaximalSprinting } from '@/utils/readiness';

const localDateKey = () => new Date().toLocaleDateString('en-CA');

export type WorkoutLaunchResult = 'active-session' | 'readiness-required' | 'started';

export async function prepareWorkoutLaunch(
  workout: PlannedWorkout,
  source: PendingWorkoutLaunch['source'],
  scheduleContext?: { scheduledDate: string; scheduledDayIndex: WeekdayIndex },
): Promise<WorkoutLaunchResult> {
  if (await getActiveWorkoutSession()) return 'active-session';

  const readiness = await getReadiness(localDateKey());
  const evaluation = readiness?.status === 'completed' ? evaluateReadiness(readiness) : null;
  const restricted = evaluation?.level === 'red'
    || Boolean(evaluation?.maximalSprintRestricted && workoutIncludesMaximalSprinting(workout));
  if (!readiness || restricted) {
    await savePendingWorkoutLaunch({
      workout,
      source,
      createdAt: new Date().toISOString(),
      ...scheduleContext,
    });
    return 'readiness-required';
  }

  await clearPendingWorkoutLaunch();
  await startWorkoutSession(workout, readiness, scheduleContext);
  return 'started';
}
