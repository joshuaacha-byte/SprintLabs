import type {
  ActiveWorkoutSession,
  CompletedWorkoutSession,
  LibraryWorkout,
  PlannedWorkout,
  PostWorkoutReview,
  ReadinessDecision,
  SprintEvent,
} from '@/types';
import { getLibraryWorkouts, isRecommendationEligible } from '@/utils/workout-library';
import { libraryWorkoutToPlannedWorkout } from '@/utils/plan-selector';
import { createActiveSession, withDerivedStatuses } from '@/utils/workout-session';
import { buildStructuredTrainingLog } from '@/utils/domain-adapters';
import {
  addCompletedWorkoutSession,
  addLog,
  addTrainingLog,
  clearGeneratedDevTestData,
  DEV_TEST_RECORD_PREFIX,
  getWeekSchedule,
} from '@/utils/storage';
import type { WeekdayIndex } from '@/types';

/**
 * Development Data Controls' generation engine. Every function here builds real domain objects
 * (ActiveWorkoutSession -> CompletedWorkoutSession/TrainingLog/TrainingLogSummary) using the exact
 * same builders app/log.tsx's save() uses (createActiveSession, withDerivedStatuses,
 * buildStructuredTrainingLog), then writes them through the exact same storage functions
 * (addCompletedWorkoutSession/addTrainingLog/addLog). Streaks, milestones, PR detection, and
 * Coach context are never touched directly here — they're pure functions that already recompute
 * live from this same stored history, so writing real records is enough to make them respond.
 *
 * Every generated record's id starts with DEV_TEST_RECORD_PREFIX so it can be found and removed
 * without affecting real data — see clearGeneratedDevTestData() in utils/storage.ts.
 */

const toDateKey = (date: Date) => date.toLocaleDateString('en-CA');
const addDays = (date: Date, amount: number) => { const next = new Date(date); next.setDate(next.getDate() + amount); return next; };

function blankReadiness(dateKey: string): ReadinessDecision {
  return {
    date: dateKey,
    status: 'completed',
    sleep: 8,
    sleepQuality: 4,
    neuralReadiness: 7,
    focus: 4,
    hydrated: true,
    hasLocalizedIssue: false,
    readinessLevel: 'green',
    readinessReasons: [],
    painNotes: '',
  };
}

export type GeneratedWorkoutStatus = 'completed' | 'partial' | 'abandoned';

export type GenerateWorkoutOptions = {
  workout: LibraryWorkout | PlannedWorkout;
  dateKey: string;
  status: GeneratedWorkoutStatus;
  rpe?: number;
  durationMinutes?: number;
  notes?: string;
  /** Overrides the fastest completed track rep's time for every track exercise present —
   * used by the PR-sequence generator to produce a specific, inspectable result. */
  sprintTimeSeconds?: number;
  idSuffix?: string;
};

const isLibraryWorkout = (workout: LibraryWorkout | PlannedWorkout): workout is LibraryWorkout =>
  'sections' in workout && 'warmup' in (workout as LibraryWorkout).sections;

/** Builds and saves one completed/partial/abandoned session for a given date, through the real
 * session-building and storage pipeline — the same path app/log.tsx's save() uses. */
export async function generateCompletedWorkout(options: GenerateWorkoutOptions): Promise<string> {
  const plan: PlannedWorkout = isLibraryWorkout(options.workout) ? libraryWorkoutToPlannedWorkout(options.workout) : options.workout;
  const readiness = blankReadiness(options.dateKey);
  const dayIndex = new Date(`${options.dateKey}T12:00:00`).getDay() as WeekdayIndex;
  const idSuffix = options.idSuffix ?? `${options.dateKey}-${Math.random().toString(36).slice(2, 8)}`;
  const sessionId = `${DEV_TEST_RECORD_PREFIX}${idSuffix}`;

  let session: ActiveWorkoutSession = {
    ...createActiveSession(plan, readiness, { scheduledDate: options.dateKey, scheduledDayIndex: dayIndex }),
    id: sessionId,
    startedAt: `${options.dateKey}T12:00:00.000Z`,
    elapsedSeconds: (options.durationMinutes ?? 60) * 60,
  };

  const markUnits = <T extends { status: string; timeSeconds?: number }>(units: T[], fraction: number): T[] =>
    units.map((unit, index) => index / units.length < fraction
      ? { ...unit, status: 'completed', ...(options.sprintTimeSeconds !== undefined && 'timeSeconds' in unit ? { timeSeconds: options.sprintTimeSeconds } : {}) }
      : unit);

  const completionFraction = options.status === 'completed' ? 1 : options.status === 'partial' ? 0.6 : 0.15;
  session = {
    ...session,
    actualResults: session.actualResults.map(result => ({
      ...result,
      trackReps: result.trackReps ? markUnits(result.trackReps, completionFraction) : undefined,
      strengthSets: result.strengthSets ? markUnits(result.strengthSets, completionFraction) : undefined,
      status: !result.trackReps && !result.strengthSets && completionFraction >= 1 ? 'completed' : result.status,
    })),
  };
  session = withDerivedStatuses(session);

  const review: PostWorkoutReview = {
    completed: options.status === 'completed',
    rpe: options.rpe ?? 6,
    energy: 4,
    sleep: readiness.sleep ?? 8,
    soreness: 2,
    notes: options.notes ?? '',
  };
  const finishedAt = `${options.dateKey}T${(options.durationMinutes ?? 60) < 60 ? '18' : '17'}:30:00.000Z`;
  const finalSession: CompletedWorkoutSession = {
    ...session,
    finishedAt,
    review,
    structuredLog: buildStructuredTrainingLog(session, review, finishedAt),
  };

  await addCompletedWorkoutSession(finalSession);
  await addTrainingLog(finalSession.structuredLog!);
  await addLog({
    id: sessionId,
    sessionId: finalSession.id,
    date: finishedAt,
    completed: review.completed,
    rpe: review.rpe,
    energy: review.energy,
    sleep: review.sleep,
    soreness: review.soreness,
    notes: review.notes,
    workoutTitle: plan.title,
    exercisesCompleted: session.actualResults.filter(r => r.status === 'completed').length,
    exercisesPlanned: session.actualResults.length,
  });
  return sessionId;
}

async function approvedLibraryWorkouts(): Promise<LibraryWorkout[]> {
  const workouts = await getLibraryWorkouts();
  return workouts.filter(isRecommendationEligible);
}

/** The weekdays the athlete's own current recurring plan actually schedules a workout on —
 * generation only ever produces completions on real scheduled-workout weekdays, exactly like a
 * genuine athlete would, rather than fabricating a schedule to match. */
async function scheduledWorkoutWeekdays(): Promise<WeekdayIndex[]> {
  const schedule = await getWeekSchedule();
  const days = schedule.filter(day => day.kind === 'workout').map(day => day.dayIndex);
  return days.length ? days : [1, 2, 3, 4, 5] as WeekdayIndex[]; // fallback: an athlete with no plan yet still gets a usable streak demo
}

/**
 * Generates a real Plan Streak of the requested length ending on `endDateKey` (default today) by
 * completing a session on each of the athlete's real scheduled-workout weekdays, walking backward
 * through calendar days (skipping real rest weekdays — never a broken/missing day, so
 * calculatePlanStreak() genuinely returns `length`). This never writes a streak NUMBER anywhere —
 * only dated completion records; utils/streaks.ts computes the number.
 */
export async function generateStreakDays(length: number, endDateKey = toDateKey(new Date())): Promise<string[]> {
  const workouts = await approvedLibraryWorkouts();
  if (!workouts.length) throw new Error('No approved library workouts available to generate a streak from.');
  const scheduledDays = await scheduledWorkoutWeekdays();
  const ids: string[] = [];
  let cursor = new Date(`${endDateKey}T12:00:00`);
  let remaining = length;
  let guard = 0;
  while (remaining > 0 && guard < 1500) {
    guard += 1;
    if (scheduledDays.includes(cursor.getDay() as WeekdayIndex)) {
      const workout = workouts[remaining % workouts.length];
      const dateKey = toDateKey(cursor);
      ids.push(await generateCompletedWorkout({ workout, dateKey, status: 'completed', rpe: 6, idSuffix: `streak-${dateKey}` }));
      remaining -= 1;
    }
    cursor = addDays(cursor, -1);
  }
  return ids;
}

/** A streak that runs, then has one real missed scheduled-workout day, then (optionally) resumes
 * more recently — demonstrates a break without deleting or fabricating a false completion. */
export async function generateBrokenStreakDays(recentLength = 2, priorLength = 5, gapDays = 3): Promise<string[]> {
  const workouts = await approvedLibraryWorkouts();
  const scheduledDays = await scheduledWorkoutWeekdays();
  const ids: string[] = [];
  let cursor = new Date();
  const place = async (count: number) => {
    let remaining = count;
    let guard = 0;
    while (remaining > 0 && guard < 200) {
      guard += 1;
      if (scheduledDays.includes(cursor.getDay() as WeekdayIndex)) {
        const dateKey = toDateKey(cursor);
        ids.push(await generateCompletedWorkout({ workout: workouts[remaining % workouts.length], dateKey, status: 'completed', rpe: 6, idSuffix: `broken-${dateKey}` }));
        remaining -= 1;
      }
      cursor = addDays(cursor, -1);
    }
  };
  await place(recentLength);
  cursor = addDays(cursor, -gapDays); // the gap: real scheduled workout days here are left genuinely missing
  await place(priorLength);
  return ids;
}

export type SprintResultPoint = { dateKey: string; timeSeconds: number };

/** Finds a real approved workout containing a track exercise at the requested distance, so a PR
 * sequence groups correctly with utils/progress.ts's buildSprintSeries() key (distance+exercise
 * name). Falls back to a minimal single-exercise synthetic session only if the library has no
 * exercise at that exact distance — still built and saved through the same real pipeline. */
async function trackWorkoutForDistance(distanceMeters: number): Promise<LibraryWorkout | PlannedWorkout> {
  const workouts = await approvedLibraryWorkouts();
  const match = workouts.find(workout => workout.sections.sprintWork.items.some(item => item.distanceMeters === distanceMeters));
  if (match) return match;
  const fallback = workouts[0];
  const plan = libraryWorkoutToPlannedWorkout(fallback);
  return {
    ...plan,
    id: `${DEV_TEST_RECORD_PREFIX}pr-workout-${distanceMeters}`,
    title: `${distanceMeters}m time trial`,
    sections: [{
      title: 'Track',
      exercises: [{ id: `pr-exercise-${distanceMeters}`, name: `${distanceMeters}m`, tracking: { kind: 'track', reps: 1, distanceMeters } }],
    }],
  };
}

export async function generatePRSequence(event: SprintEvent, results: SprintResultPoint[], notes?: string): Promise<string[]> {
  const distanceMeters = Number(event.replace(/[^0-9]/g, '')) || 100;
  const workout = await trackWorkoutForDistance(distanceMeters);
  const ids: string[] = [];
  for (const point of results) {
    ids.push(await generateCompletedWorkout({
      workout, dateKey: point.dateKey, status: 'completed', rpe: 8,
      sprintTimeSeconds: point.timeSeconds, notes, idSuffix: `pr-${event}-${point.dateKey}`,
    }));
  }
  return ids;
}

/** Deliberately irregular history — a real mix of completed/partial/abandoned sessions on real
 * scheduled-workout weekdays over the last ~3 weeks, rather than one clean streak. */
export async function generateMixedHistory(): Promise<string[]> {
  const workouts = await approvedLibraryWorkouts();
  const scheduledDays = await scheduledWorkoutWeekdays();
  const statuses: GeneratedWorkoutStatus[] = ['completed', 'completed', 'partial', 'completed', 'abandoned', 'completed', 'partial'];
  const ids: string[] = [];
  let cursor = new Date();
  let index = 0;
  let guard = 0;
  while (index < statuses.length && guard < 200) {
    guard += 1;
    if (scheduledDays.includes(cursor.getDay() as WeekdayIndex)) {
      const dateKey = toDateKey(cursor);
      ids.push(await generateCompletedWorkout({ workout: workouts[index % workouts.length], dateKey, status: statuses[index], rpe: 5 + (index % 4), idSuffix: `mixed-${dateKey}` }));
      index += 1;
    }
    cursor = addDays(cursor, -1);
  }
  return ids;
}

export type DevScenarioId =
  | 'new-athlete' | 'first-workout' | 'three-day-streak' | 'seven-day-streak' | 'ten-sessions'
  | 'four-consistent-weeks' | 'twenty-five-sessions' | 'fifty-sessions' | 'hundred-sessions'
  | 'missed-workout' | 'broken-streak' | 'returning-athlete' | 'partial-history' | 'pr-improvement';

export type DevScenario = { id: DevScenarioId; label: string; description: string };

export const DEV_SCENARIOS: DevScenario[] = [
  { id: 'new-athlete', label: 'New athlete, no workouts', description: 'Clears generated test data so the app shows a genuine empty state.' },
  { id: 'first-workout', label: 'First completed workout', description: 'One completed session, today.' },
  { id: 'three-day-streak', label: 'Three-day streak', description: 'A real 3-session Plan Streak.' },
  { id: 'seven-day-streak', label: 'Seven-day streak', description: 'A real 7-session Plan Streak.' },
  { id: 'ten-sessions', label: 'Ten completed sessions', description: '10 sessions across real scheduled-workout days.' },
  { id: 'four-consistent-weeks', label: 'Four consistent weeks', description: 'Enough sessions to fill 4 full weeks at ≥80% — a real Consistency Streak.' },
  { id: 'twenty-five-sessions', label: '25 completed sessions', description: 'Longer volume history.' },
  { id: 'fifty-sessions', label: '50 completed sessions', description: 'Longer volume history.' },
  { id: 'hundred-sessions', label: '100 completed sessions', description: 'Long-run volume/milestone testing.' },
  { id: 'missed-workout', label: 'Missed scheduled workout', description: 'A short streak whose most recent scheduled day is genuinely left uncompleted.' },
  { id: 'broken-streak', label: 'Broken streak', description: 'An older streak, a real gap, then a shorter recent streak.' },
  { id: 'returning-athlete', label: 'Returning after inactivity', description: 'A streak from ~2 months ago, nothing since.' },
  { id: 'partial-history', label: 'Partial workout history', description: 'A real mix of completed/partial/abandoned sessions.' },
  { id: 'pr-improvement', label: 'PR improvement (100m)', description: 'Three 100m results gradually improving over ~4 weeks.' },
];

export async function runDevScenario(id: DevScenarioId): Promise<string[]> {
  const today = new Date();
  switch (id) {
    case 'new-athlete': await clearGeneratedDevTestData(); return [];
    case 'first-workout': {
      const workouts = await approvedLibraryWorkouts();
      return [await generateCompletedWorkout({ workout: workouts[0], dateKey: toDateKey(today), status: 'completed', rpe: 6, idSuffix: 'first-workout' })];
    }
    case 'three-day-streak': return generateStreakDays(3);
    case 'seven-day-streak': return generateStreakDays(7);
    case 'ten-sessions': return generateStreakDays(10);
    case 'four-consistent-weeks': {
      const perWeek = Math.max(2, (await scheduledWorkoutWeekdays()).length);
      return generateStreakDays(perWeek * 4);
    }
    case 'twenty-five-sessions': return generateStreakDays(25);
    case 'fifty-sessions': return generateStreakDays(50);
    case 'hundred-sessions': return generateStreakDays(100);
    case 'missed-workout': return generateBrokenStreakDays(0, 4, 2);
    case 'broken-streak': return generateBrokenStreakDays(2, 5, 3);
    case 'returning-athlete': return generateStreakDays(5, toDateKey(addDays(today, -60)));
    case 'partial-history': return generateMixedHistory();
    case 'pr-improvement': {
      const base = addDays(today, -28);
      return generatePRSequence('100m', [
        { dateKey: toDateKey(base), timeSeconds: 11.42 },
        { dateKey: toDateKey(addDays(base, 14)), timeSeconds: 11.21 },
        { dateKey: toDateKey(addDays(base, 28)), timeSeconds: 10.98 },
      ], 'Development test PR sequence.');
    }
  }
}
