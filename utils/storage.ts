import AsyncStorage from '@react-native-async-storage/async-storage';
import { createBlankWorkout, defaultWeekSchedule, todayWorkout, weekdayLabels } from '@/data/workouts';
import {
  ActiveWorkoutSession,
  CompletedWorkoutSession,
  FutureWorkoutOverride,
  PendingWorkoutLaunch,
  PlannedWorkout,
  ReadinessDecision,
  ScheduledDay,
  TrainingLog,
  TrainingLogSummary,
  WeekdayIndex,
} from '@/types';
import { createActiveSession, normalizePlannedWorkout, withDerivedStatuses } from '@/utils/workout-session';
import { buildStructuredTrainingLog } from '@/utils/domain-adapters';

const CHECKS = 'sprintlab:checks';
const LOGS = 'sprintlab:logs';
const WORKOUT_DRAFT = 'sprintlab:workout-draft';
const TODAY_WORKOUT = 'sprintlab:today-workout';
const WEEK_SCHEDULE = 'sprintlab:week-schedule';
const WEEK_SCHEDULE_SAVED = 'sprintlab:week-schedule-saved';
const READINESS = 'sprintlab:readiness';
const ACTIVE_SESSION = 'sprintlab:active-workout-session';
const COMPLETED_SESSIONS = 'sprintlab:completed-workout-sessions';
const TRAINING_HISTORY = 'sprintlab:training-history';
const FUTURE_WORKOUT_OVERRIDES = 'sprintlab:future-workout-overrides';
const PENDING_WORKOUT_LAUNCH = 'sprintlab:pending-workout-launch';
const WEEK_SCHEDULE_HISTORY = 'sprintlab:week-schedule-history';
const WEEK_SCHEDULE_HISTORY_MAX_ENTRIES = 120;

const localDateKey = (date = new Date()) => date.toLocaleDateString('en-CA');

function refreshWorkoutReminders() {
  void import('@/utils/workout-reminders')
    .then(({ syncWorkoutReminders }) => syncWorkoutReminders())
    .catch(() => undefined);
}

export async function getLogs(): Promise<TrainingLogSummary[]> {
  const value = await AsyncStorage.getItem(LOGS);
  return value ? JSON.parse(value) : [];
}

export async function addLog(log: TrainingLogSummary) {
  const logs = await getLogs();
  await AsyncStorage.setItem(LOGS, JSON.stringify([log, ...logs.filter(existing => existing.id !== log.id)]));
}

function newestFirst<T extends { completedAt?: string | null; date?: string; createdAt?: string }>(records: T[]) {
  return [...records].sort((first, second) => {
    const firstDate = first.completedAt ?? first.date ?? first.createdAt ?? '';
    const secondDate = second.completedAt ?? second.date ?? second.createdAt ?? '';
    return secondDate.localeCompare(firstDate);
  });
}

/** Full, immutable-style training footprints used by the History feature. */
export async function getTrainingLogs(): Promise<TrainingLog[]> {
  const value = await AsyncStorage.getItem(TRAINING_HISTORY);
  const stored = value ? JSON.parse(value) as TrainingLog[] : [];
  const completedSessions = await getCompletedWorkoutSessions();
  const migrated = completedSessions.map(session =>
    session.structuredLog ?? buildStructuredTrainingLog(session, session.review, session.finishedAt),
  );
  const byId = new Map<string, TrainingLog>();
  // Saved History edits are the current source of truth; migration only fills gaps.
  [...migrated, ...stored].forEach(log => byId.set(log.id, log));
  const logs = newestFirst([...byId.values()]);
  if (migrated.some(log => !stored.some(saved => saved.id === log.id))) {
    await AsyncStorage.setItem(TRAINING_HISTORY, JSON.stringify(logs));
  }
  return logs;
}

export async function getTrainingLog(id: string): Promise<TrainingLog | null> {
  return (await getTrainingLogs()).find(log => log.id === id) ?? null;
}

export async function addTrainingLog(log: TrainingLog) {
  const logs = await getTrainingLogs();
  const next = newestFirst([log, ...logs.filter(saved => saved.id !== log.id)]);
  await AsyncStorage.setItem(TRAINING_HISTORY, JSON.stringify(next));
  refreshWorkoutReminders();
}

export async function updateTrainingLog(log: TrainingLog) {
  const now = new Date().toISOString();
  const updated = { ...log, updatedAt: now };
  const logs = await getTrainingLogs();
  await AsyncStorage.setItem(TRAINING_HISTORY, JSON.stringify(newestFirst(logs.map(saved => saved.id === log.id ? updated : saved))));

  const sessions = await getCompletedWorkoutSessions();
  const matchedSessionIds = sessions
    .filter(session => session.structuredLog?.id === log.id || `domain-log:${session.id}` === log.id)
    .map(session => session.id);
  if (matchedSessionIds.length) {
    await AsyncStorage.setItem(COMPLETED_SESSIONS, JSON.stringify(sessions.map(session => {
      if (!matchedSessionIds.includes(session.id)) return session;
      return {
        ...session,
        structuredLog: updated,
        review: {
          ...session.review,
          completed: updated.completionStatus.startsWith('completed'),
          rpe: updated.sessionRpe ?? session.review.rpe,
          sleep: updated.readiness.sleepHours ?? session.review.sleep,
          hamstring: updated.readiness.hamstringSoreness ?? session.review.hamstring,
          soreness: updated.readiness.generalSoreness ?? session.review.soreness,
          bodyWeight: updated.bodyWeight ?? undefined,
          notes: updated.generalNotes,
        },
      };
    })));
    const summaries = await getLogs();
    await AsyncStorage.setItem(LOGS, JSON.stringify(summaries.map(summary => !summary.sessionId || !matchedSessionIds.includes(summary.sessionId) ? summary : {
      ...summary,
      completed: updated.completionStatus.startsWith('completed'),
      rpe: updated.sessionRpe ?? summary.rpe,
      sleep: updated.readiness.sleepHours ?? summary.sleep,
      hamstring: updated.readiness.hamstringSoreness ?? summary.hamstring,
      soreness: updated.readiness.generalSoreness ?? summary.soreness,
      bodyWeight: updated.bodyWeight ?? undefined,
      notes: updated.generalNotes,
    })));
  }
  refreshWorkoutReminders();
  return updated;
}

export async function deleteTrainingLog(id: string) {
  const sessions = await getCompletedWorkoutSessions();
  const matchedSessionIds = sessions
    .filter(session => session.structuredLog?.id === id || `domain-log:${session.id}` === id)
    .map(session => session.id);
  const [logs, summaries] = await Promise.all([getTrainingLogs(), getLogs()]);
  await Promise.all([
    AsyncStorage.setItem(TRAINING_HISTORY, JSON.stringify(logs.filter(log => log.id !== id))),
    AsyncStorage.setItem(COMPLETED_SESSIONS, JSON.stringify(sessions.filter(session => !matchedSessionIds.includes(session.id)))),
    AsyncStorage.setItem(LOGS, JSON.stringify(summaries.filter(summary => summary.id !== id && (!summary.sessionId || !matchedSessionIds.includes(summary.sessionId))))),
  ]);
  refreshWorkoutReminders();
}

export async function getFutureWorkoutOverrides(): Promise<FutureWorkoutOverride[]> {
  const value = await AsyncStorage.getItem(FUTURE_WORKOUT_OVERRIDES);
  return value ? JSON.parse(value) : [];
}

export async function saveFutureWorkoutOverride(workout: PlannedWorkout, date: string, sourceTrainingLogId?: string) {
  const overrides = await getFutureWorkoutOverrides();
  const override: FutureWorkoutOverride = {
    id: `scheduled-override:${date}:${Date.now()}`,
    date,
    kind: 'workout',
    workout: clone(workout),
    sourceTrainingLogId,
  };
  await AsyncStorage.setItem(FUTURE_WORKOUT_OVERRIDES, JSON.stringify([
    override,
    ...overrides.filter(item => item.date !== date),
  ]));
  refreshWorkoutReminders();
  return override;
}

/** Marks a single future date as rest without touching the recurring weekly template. */
export async function saveRestDateOverride(date: string, restTitle = 'Rest day', restNote = 'No training is scheduled.') {
  const overrides = await getFutureWorkoutOverrides();
  const override: FutureWorkoutOverride = {
    id: `scheduled-override:${date}:${Date.now()}`,
    date,
    kind: 'rest',
    restTitle,
    restNote,
  };
  await AsyncStorage.setItem(FUTURE_WORKOUT_OVERRIDES, JSON.stringify([
    override,
    ...overrides.filter(item => item.date !== date),
  ]));
  refreshWorkoutReminders();
  return override;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const isWeekdayIndex = (value: number): value is WeekdayIndex =>
  Number.isInteger(value) && value >= 0 && value <= 6;

function normalizeSchedule(raw: unknown): ScheduledDay[] {
  const stored = Array.isArray(raw) ? raw as Partial<ScheduledDay>[] : [];
  return defaultWeekSchedule.map(defaultDay => {
    const candidate = stored.find(day => day.dayIndex === defaultDay.dayIndex);
    if (!candidate) return clone(defaultDay);
    if (candidate.kind === 'rest') {
      return {
        dayIndex: defaultDay.dayIndex,
        shortLabel: weekdayLabels[defaultDay.dayIndex].short,
        fullLabel: weekdayLabels[defaultDay.dayIndex].full,
        kind: 'rest',
        restTitle: candidate.restTitle || 'Rest day',
        restNote: candidate.restNote || 'No training is scheduled.',
      };
    }
    const fallback = defaultDay.workout ?? createBlankWorkout(defaultDay.dayIndex);
    return {
      dayIndex: defaultDay.dayIndex,
      shortLabel: weekdayLabels[defaultDay.dayIndex].short,
      fullLabel: weekdayLabels[defaultDay.dayIndex].full,
      kind: 'workout',
      workout: normalizePlannedWorkout(candidate.workout, fallback),
    };
  });
}

export async function getWeekSchedule(): Promise<ScheduledDay[]> {
  const value = await AsyncStorage.getItem(WEEK_SCHEDULE);
  if (value) return normalizeSchedule(JSON.parse(value));

  const schedule = clone(defaultWeekSchedule);
  const legacyWorkout = await AsyncStorage.getItem(TODAY_WORKOUT);
  if (legacyWorkout) {
    const monday = schedule.find(day => day.dayIndex === 1);
    if (monday) {
      monday.kind = 'workout';
      monday.workout = normalizePlannedWorkout(JSON.parse(legacyWorkout), todayWorkout);
      monday.restTitle = undefined;
      monday.restNote = undefined;
    }
  }
  await AsyncStorage.setItem(WEEK_SCHEDULE, JSON.stringify(schedule));
  return schedule;
}

/** Distinguishes a genuinely saved athlete week from the sample/default schedule. */
export async function hasSavedWeekSchedule(): Promise<boolean> {
  return (await AsyncStorage.getItem(WEEK_SCHEDULE_SAVED)) === 'true';
}

export type ScheduleHistoryEntry = { effectiveFrom: string; schedule: ScheduledDay[] };

/** Dated snapshots of the recurring plan, so past-date lookups (streaks, weekly adherence) reflect what was actually scheduled then, not today's edited plan. */
export async function getScheduleHistory(): Promise<ScheduleHistoryEntry[]> {
  const value = await AsyncStorage.getItem(WEEK_SCHEDULE_HISTORY);
  return value ? JSON.parse(value) : [];
}

export async function saveWeekSchedule(schedule: ScheduledDay[]) {
  const normalized = normalizeSchedule(schedule);
  const today = localDateKey();
  const history = await getScheduleHistory();
  const nextHistory = [...history.filter(entry => entry.effectiveFrom !== today), { effectiveFrom: today, schedule: normalized }]
    .sort((first, second) => first.effectiveFrom.localeCompare(second.effectiveFrom))
    .slice(-WEEK_SCHEDULE_HISTORY_MAX_ENTRIES);
  await AsyncStorage.multiSet([
    [WEEK_SCHEDULE, JSON.stringify(normalized)],
    [WEEK_SCHEDULE_SAVED, 'true'],
    [WEEK_SCHEDULE_HISTORY, JSON.stringify(nextHistory)],
  ]);
  refreshWorkoutReminders();
}

export async function getScheduledDay(dayIndex: number = new Date().getDay(), date = localDateKey()): Promise<ScheduledDay> {
  const safeDayIndex: WeekdayIndex = isWeekdayIndex(dayIndex) ? dayIndex : 1;
  const override = (await getFutureWorkoutOverrides()).find(item => item.date === date);
  if (override) {
    if (override.kind === 'rest') {
      return {
        dayIndex: safeDayIndex,
        shortLabel: weekdayLabels[safeDayIndex].short,
        fullLabel: weekdayLabels[safeDayIndex].full,
        kind: 'rest',
        restTitle: override.restTitle || 'Rest day',
        restNote: override.restNote || 'No training is scheduled.',
      };
    }
    if (override.workout) {
      return {
        dayIndex: safeDayIndex,
        shortLabel: weekdayLabels[safeDayIndex].short,
        fullLabel: weekdayLabels[safeDayIndex].full,
        kind: 'workout',
        workout: clone(override.workout),
      };
    }
  }
  const schedule = await getWeekSchedule();
  return schedule.find(day => day.dayIndex === safeDayIndex) ?? clone(defaultWeekSchedule[0]);
}

/** Same lookup as getScheduledDay, but derives the weekday from an ISO date so callers only need the date. */
export async function getScheduledDayForDate(date: string): Promise<ScheduledDay> {
  const dayIndex = new Date(`${date}T00:00:00`).getDay();
  return getScheduledDay(dayIndex, date);
}

export async function saveDayWorkout(dayIndex: WeekdayIndex, workout: PlannedWorkout) {
  const schedule = await getWeekSchedule();
  await saveWeekSchedule(schedule.map(day => day.dayIndex === dayIndex ? {
    ...day,
    kind: 'workout' as const,
    workout,
    restTitle: undefined,
    restNote: undefined,
  } : day));
}

export async function markDayAsRest(dayIndex: WeekdayIndex) {
  const schedule = await getWeekSchedule();
  await saveWeekSchedule(schedule.map(day => day.dayIndex === dayIndex ? {
    ...day,
    kind: 'rest' as const,
    workout: undefined,
    restTitle: 'Rest day',
    restNote: 'No training is scheduled. Focus on recovery and prepare for the next session.',
  } : day));
}

export async function swapScheduledDays(firstIndex: WeekdayIndex, secondIndex: WeekdayIndex) {
  if (firstIndex === secondIndex) return;
  const schedule = await getWeekSchedule();
  const first = schedule.find(day => day.dayIndex === firstIndex);
  const second = schedule.find(day => day.dayIndex === secondIndex);
  if (!first || !second) return;
  const content = (day: ScheduledDay) => ({
    kind: day.kind,
    workout: day.workout,
    restTitle: day.restTitle,
    restNote: day.restNote,
  });
  const firstContent = content(first);
  const secondContent = content(second);
  await saveWeekSchedule(schedule.map(day => {
    if (day.dayIndex === firstIndex) return { ...day, ...secondContent };
    if (day.dayIndex === secondIndex) return { ...day, ...firstContent };
    return day;
  }));
}

export async function getTodayWorkout(): Promise<PlannedWorkout> {
  const day = await getScheduledDay();
  return day.kind === 'workout' && day.workout ? day.workout : createBlankWorkout(day.dayIndex);
}

export async function saveTodayWorkout(workout: PlannedWorkout) {
  await saveDayWorkout(new Date().getDay() as WeekdayIndex, workout);
}

export async function getReadiness(date: string): Promise<ReadinessDecision | null> {
  const value = await AsyncStorage.getItem(READINESS);
  if (!value) return null;
  const stored = JSON.parse(value) as Partial<ReadinessDecision> & { date?: string };
  if (stored.date !== date) return null;
  return {
    ...stored,
    date,
    status: stored.status ?? 'completed',
    painNotes: stored.painNotes ?? '',
  };
}

export async function saveReadiness(readiness: ReadinessDecision) {
  await AsyncStorage.setItem(READINESS, JSON.stringify(readiness));
}

export async function savePendingWorkoutLaunch(launch: PendingWorkoutLaunch) {
  await AsyncStorage.setItem(PENDING_WORKOUT_LAUNCH, JSON.stringify(clone(launch)));
}

export async function getPendingWorkoutLaunch(): Promise<PendingWorkoutLaunch | null> {
  const value = await AsyncStorage.getItem(PENDING_WORKOUT_LAUNCH);
  if (!value) return null;
  const launch = JSON.parse(value) as PendingWorkoutLaunch;
  const createdAt = new Date(launch.createdAt).getTime();
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > 86_400_000) {
    await clearPendingWorkoutLaunch();
    return null;
  }
  return launch;
}

export async function clearPendingWorkoutLaunch() {
  await AsyncStorage.removeItem(PENDING_WORKOUT_LAUNCH);
}

export async function startWorkoutSession(
  plan: PlannedWorkout,
  readiness: ReadinessDecision,
  scheduleContext?: { scheduledDate: string; scheduledDayIndex: WeekdayIndex },
) {
  const session = createActiveSession(plan, readiness, scheduleContext);
  await saveActiveWorkoutSession(session);
  await Promise.all([
    AsyncStorage.removeItem(CHECKS),
    AsyncStorage.removeItem(WORKOUT_DRAFT),
  ]);
  return session;
}

export async function getActiveWorkoutSession(): Promise<ActiveWorkoutSession | null> {
  const value = await AsyncStorage.getItem(ACTIVE_SESSION);
  return value ? JSON.parse(value) : null;
}

export async function saveActiveWorkoutSession(session: ActiveWorkoutSession) {
  await AsyncStorage.setItem(ACTIVE_SESSION, JSON.stringify(withDerivedStatuses(session)));
}

export async function clearActiveWorkoutSession() {
  await AsyncStorage.removeItem(ACTIVE_SESSION);
}

export async function getCompletedWorkoutSessions(): Promise<CompletedWorkoutSession[]> {
  const value = await AsyncStorage.getItem(COMPLETED_SESSIONS);
  return value ? JSON.parse(value) : [];
}

export async function addCompletedWorkoutSession(session: CompletedWorkoutSession) {
  const sessions = await getCompletedWorkoutSessions();
  // A session keeps the same id from start to finish; guards against a double-tap on "Finish" creating two records.
  await AsyncStorage.setItem(COMPLETED_SESSIONS, JSON.stringify([session, ...sessions.filter(existing => existing.id !== session.id)]));
}
