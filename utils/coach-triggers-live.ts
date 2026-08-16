import { detectCoachTriggers, selectActiveCoachTrigger, type CoachTrigger } from '@/utils/coach-triggers';
import { getAthleteProfile } from '@/utils/athlete-profile';
import { deriveSeasonPhase } from '@/utils/season-engine';
import { buildRecentSessions, buildWeeklyProgress, toLocalDateKey } from '@/utils/progress';
import {
  addDismissedCoachTriggerId,
  getCompletedWorkoutSessions,
  getDismissedCoachTriggerIds,
  getLogs,
  getReadiness,
  getScheduleHistory,
  getWeekSchedule,
} from '@/utils/storage';

// SprintLab Coach UI Phase C-3: the AsyncStorage-backed half of trigger evaluation, kept separate
// from utils/coach-triggers.ts's pure detectCoachTriggers()/selectActiveCoachTrigger() for the
// same reason as utils/ai-context-live.ts / utils/coach-resolve.ts — this stays out of the pure
// file so scripts/verify-coach-triggers.ts can test the actual decision logic under plain Node.

const RECENT_SESSIONS_LIMIT = 5; // covers the pure module's 3-session repeated-effort lookback with room to spare

/** Gathers the same kind of live signals utils/ai-context-live.ts does — but only what local
 * trigger detection needs, reusing the same computed helpers — and returns the single most
 * relevant trigger not yet dismissed for its current occurrence, or null. Read-only. */
export async function getActiveCoachTrigger(now = new Date()): Promise<CoachTrigger | null> {
  const today = toLocalDateKey(now);

  const [profile, schedule, scheduleHistory, sessions, logs, readiness, dismissedIds] = await Promise.all([
    getAthleteProfile(),
    getWeekSchedule(),
    getScheduleHistory(),
    getCompletedWorkoutSessions(),
    getLogs(),
    getReadiness(today),
    getDismissedCoachTriggerIds(),
  ]);
  if (!profile) return null;

  const season = deriveSeasonPhase(profile, today);
  const weekly = buildWeeklyProgress(schedule, sessions, now, scheduleHistory);
  const recentSessions = buildRecentSessions(logs, sessions, RECENT_SESSIONS_LIMIT);

  const triggers = detectCoachTriggers({
    today,
    weekDays: weekly.days.map(day => ({ date: day.date, status: day.status })),
    recentSessions: recentSessions.map(session => ({ id: session.id, date: session.date, rpe: session.rpe })),
    readiness: readiness && readiness.status === 'completed' ? { level: readiness.readinessLevel } : null,
    priorityMeet: season.nextMeet ? {
      id: season.nextMeet.id,
      name: season.nextMeet.name,
      date: season.nextMeet.date,
      priority: season.nextMeet.priority,
      daysAway: season.daysToNextMeet,
    } : null,
  });

  return selectActiveCoachTrigger(triggers, dismissedIds);
}

/** Records the given trigger's occurrence as dismissed/acknowledged so it won't re-flag the
 * launcher until a new, different occurrence of the same type appears. Called when Coach is
 * opened while a trigger is active. */
export async function dismissCoachTrigger(id: string) {
  await addDismissedCoachTriggerId(id);
}
