import { buildAthleteAIContext, type AthleteAIContext } from '@/utils/ai-context';
import { toLocalDateKey } from '@/utils/progress';
import { getAthleteProfile } from '@/utils/athlete-profile';
import { getCompletedWorkoutSessions, getLogs, getReadiness, getScheduleHistory, getWeekSchedule } from '@/utils/storage';

// SprintLab Coach UI Phase C-2: the AsyncStorage-backed half of athlete-context building, kept
// separate from utils/ai-context.ts's pure buildAthleteAIContext() so that pure file stays
// importable under plain Node (see scripts/dev-test-coach-context.ts and friends) without
// pulling in React Native's AsyncStorage module, which utils/storage.ts requires. Mirrors the
// existing plan-change-validator.ts/plan-change-apply.ts and coach.ts/coach-resolve.ts splits.

/** Gathers the athlete's current live data from storage and builds the AI context in one call —
 * the single place both the Coach overlay (components/coach-context.tsx) and the I-2 dev/test
 * surface (app/coach-dev.tsx) get athlete context from, so there is one source of truth for
 * "how SprintLab assembles what Gemini sees about this athlete" rather than two. */
export async function buildCurrentAthleteAIContext(now = new Date()): Promise<AthleteAIContext | null> {
  const today = toLocalDateKey(now);
  const [profile, schedule, scheduleHistory, sessions, logs, readiness] = await Promise.all([
    getAthleteProfile(),
    getWeekSchedule(),
    getScheduleHistory(),
    getCompletedWorkoutSessions(),
    getLogs(),
    getReadiness(today),
  ]);
  if (!profile) return null;
  return buildAthleteAIContext({ profile, schedule, scheduleHistory, sessions, logs, readiness, now });
}
