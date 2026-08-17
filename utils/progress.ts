import type {
  CompletedWorkoutSession,
  RepFeeling,
  ScheduledDay,
  TrackConditions,
  TrainingLogSummary,
  WeekdayIndex,
} from '@/types';

export type WeekDayStatus =
  | 'completed'
  | 'partial'
  | 'missed'
  | 'rest'
  | 'today'
  | 'upcoming'
  /** No planned session was due (rest/open day), but an extra/unplanned session was logged
   * anyway. Shown distinctly from 'rest' for visibility — it never counts toward the Plan Streak
   * or plan-consistency percentage, both of which only recognize sessions linked to a scheduled
   * workout day (see utils/streaks.ts). */
  | 'extra';

export type WeekDayProgress = {
  date: string;
  dayIndex: WeekdayIndex;
  shortLabel: string;
  status: WeekDayStatus;
  workoutTitle?: string;
};

export type WeeklyProgress = {
  days: WeekDayProgress[];
  completed: number;
  partial: number;
  due: number;
  percentage: number;
};

export type SprintPoint = {
  id: string;
  date: string;
  timeSeconds: number;
  distanceMeters: number;
  exerciseName: string;
  conditions?: TrackConditions;
  feeling?: RepFeeling;
};

export type SprintSeries = {
  key: string;
  label: string;
  distanceMeters: number;
  exerciseName: string;
  points: SprintPoint[];
  best: SprintPoint;
  latest: SprintPoint;
};

export type RecoveryDay = {
  date: string;
  sleep?: number;
  rpe?: number;
  soreness?: number;
};

export type RecoveryTrend = {
  days: RecoveryDay[];
  averages: {
    sleep?: number;
    rpe?: number;
    soreness?: number;
  };
  latest: {
    sleep?: number;
    rpe?: number;
    soreness?: number;
  };
};

export type RecentSession = {
  id: string;
  date: string;
  title: string;
  completed: boolean;
  rpe: number;
  sleep?: number;
  exercisesCompleted?: number;
  exercisesPlanned?: number;
  bestSprintTime?: number;
  bestSprintDistance?: number;
  conditions?: TrackConditions;
  manual: boolean;
};

export type TrainingVolumeSummary = {
  completedSprintMeters: number;
  highIntensityMeters: number;
  lastSevenDaysMeters: number;
  timedReps: number;
};

const pad = (value: number) => String(value).padStart(2, '0');

export function toLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromLocalDateKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function compareDateKeys(first: string, second: string) {
  return first.localeCompare(second);
}

function mondayFor(date: Date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const offset = copy.getDay() === 0 ? -6 : 1 - copy.getDay();
  return addDays(copy, offset);
}

export function sessionDateKey(session: CompletedWorkoutSession) {
  return session.scheduledDate ?? toLocalDateKey(new Date(session.startedAt));
}

export function buildTrainingVolumeSummary(
  sessions: CompletedWorkoutSession[],
  now = new Date(),
): TrainingVolumeSummary {
  const sevenDaysAgo = toLocalDateKey(addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12), -6));
  return sessions.reduce<TrainingVolumeSummary>((summary, session) => {
    let sessionMeters = 0;
    session.actualResults.forEach(result => {
      if (result.trackingKind !== 'track') return;
      const exercise = plannedExercise(session, result.exerciseId);
      const plannedDistance = exercise?.tracking.kind === 'track'
        ? exercise.tracking.distanceMeters
        : undefined;
      (result.trackReps ?? []).forEach(rep => {
        if (rep.status !== 'completed') return;
        const distance = rep.plannedDistanceMeters ?? plannedDistance ?? 0;
        sessionMeters += distance;
        summary.completedSprintMeters += distance;
        const intensity = rep.intensityTargetPercent
          ?? (exercise?.tracking.kind === 'track' ? exercise.tracking.targetIntensity : undefined)
          ?? 0;
        if (intensity >= 90) summary.highIntensityMeters += distance;
        if (typeof rep.timeSeconds === 'number' && rep.timeSeconds > 0) summary.timedReps += 1;
      });
    });
    if (sessionDateKey(session) >= sevenDaysAgo) summary.lastSevenDaysMeters += sessionMeters;
    return summary;
  }, {
    completedSprintMeters: 0,
    highIntensityMeters: 0,
    lastSevenDaysMeters: 0,
    timedReps: 0,
  });
}

/** The single definition of "which completed sessions belong to this date" — reused by
 * buildWeeklyProgress/buildScheduledSessionStreak below and by app/(tabs)/index.tsx's Today
 * screen, so "has today's workout already been completed?" is answered the same way everywhere
 * rather than via a second, separately-tracked completion flag. */
export function sessionsForDate(sessions: CompletedWorkoutSession[], date: string) {
  return sessions.filter(session => sessionDateKey(session) === date);
}

export type ScheduleHistoryEntry = { effectiveFrom: string; schedule: ScheduledDay[] };

/** Resolves the recurring-plan version that was actually in effect on a given date, falling back to the current schedule if no earlier snapshot exists. */
export function scheduleVersionForDate(
  history: ScheduleHistoryEntry[],
  currentSchedule: ScheduledDay[],
  dateKey: string,
): ScheduledDay[] {
  const applicable = [...history]
    .filter(entry => entry.effectiveFrom <= dateKey)
    .sort((first, second) => second.effectiveFrom.localeCompare(first.effectiveFrom))[0];
  return applicable ? applicable.schedule : currentSchedule;
}

function scheduleForDate(schedule: ScheduledDay[], history: ScheduleHistoryEntry[], date: Date) {
  const dateKey = toLocalDateKey(date);
  const version = scheduleVersionForDate(history, schedule, dateKey);
  return version.find(day => day.dayIndex === date.getDay());
}

export function buildWeeklyProgress(
  schedule: ScheduledDay[],
  sessions: CompletedWorkoutSession[],
  now = new Date(),
  history: ScheduleHistoryEntry[] = [],
): WeeklyProgress {
  const todayKey = toLocalDateKey(now);
  const monday = mondayFor(now);
  const days: WeekDayProgress[] = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(monday, index);
    const dateKey = toLocalDateKey(date);
    const scheduled = scheduleForDate(schedule, history, date);
    const daySessions = sessionsForDate(sessions, dateKey);
    const hasCompleted = daySessions.some(session => session.review.completed);
    const hasPartial = daySessions.length > 0 && !hasCompleted;
    const isFuture = compareDateKeys(dateKey, todayKey) > 0;
    const isToday = dateKey === todayKey;
    let status: WeekDayStatus;

    if (!scheduled || scheduled.kind === 'rest') status = daySessions.some(session => session.review.completed) ? 'extra' : 'rest';
    else if (hasCompleted) status = 'completed';
    else if (hasPartial) status = 'partial';
    else if (isFuture) status = 'upcoming';
    else if (isToday) status = 'today';
    else status = 'missed';

    return {
      date: dateKey,
      dayIndex: date.getDay() as WeekdayIndex,
      shortLabel: scheduled?.shortLabel?.slice(0, 1) ?? ['S', 'M', 'T', 'W', 'T', 'F', 'S'][date.getDay()],
      status,
      workoutTitle: scheduled?.kind === 'workout' ? scheduled.workout?.title : scheduled?.restTitle,
    };
  });

  const dueDays = days.filter(day =>
    day.status === 'completed'
    || day.status === 'partial'
    || day.status === 'missed'
    || day.status === 'today'
  );
  const completed = dueDays.filter(day => day.status === 'completed').length;
  const partial = dueDays.filter(day => day.status === 'partial').length;
  return {
    days,
    completed,
    partial,
    due: dueDays.length,
    percentage: dueDays.length ? Math.round((completed / dueDays.length) * 100) : 0,
  };
}

function plannedExercise(session: CompletedWorkoutSession, exerciseId: string) {
  const result = session.actualResults.find(item => item.exerciseId === exerciseId);
  return result?.exerciseSnapshot ?? session.plannedWorkoutSnapshot.sections
    .flatMap(section => section.exercises)
    .find(exercise => exercise.id === exerciseId);
}

function effectiveConditions(
  session: CompletedWorkoutSession,
  windOverride?: TrackConditions,
  legacyWind?: number,
) {
  if (windOverride) return windOverride;
  if (legacyWind !== undefined) return { type: 'measured', measuredWind: legacyWind } as TrackConditions;
  return session.trackConditions;
}

export function buildSprintSeries(sessions: CompletedWorkoutSession[]): SprintSeries[] {
  const grouped = new Map<string, Omit<SprintSeries, 'best' | 'latest'>>();
  const ordered = [...sessions].sort((first, second) => sessionDateKey(first).localeCompare(sessionDateKey(second)));

  ordered.forEach(session => {
    session.actualResults.forEach(result => {
      if (result.trackingKind !== 'track') return;
      const exercise = plannedExercise(session, result.exerciseId);
      if (!exercise || exercise.tracking.kind !== 'track' || !exercise.tracking.distanceMeters) return;
      const completedReps = (result.trackReps ?? []).filter(rep =>
        rep.status === 'completed'
        && typeof rep.timeSeconds === 'number'
        && Number.isFinite(rep.timeSeconds)
        && rep.timeSeconds > 0
      );
      const fastest = completedReps.sort((first, second) => (first.timeSeconds ?? Infinity) - (second.timeSeconds ?? Infinity))[0];
      if (!fastest?.timeSeconds) return;

      const exerciseName = exercise.name.trim();
      const distanceMeters = exercise.tracking.distanceMeters;
      const key = `${distanceMeters}:${exerciseName.toLowerCase()}`;
      const point: SprintPoint = {
        id: `${session.id}:${result.exerciseId}:${fastest.repNumber}`,
        date: sessionDateKey(session),
        timeSeconds: fastest.timeSeconds,
        distanceMeters,
        exerciseName,
        conditions: effectiveConditions(session, fastest.windOverride, fastest.wind),
        feeling: fastest.feeling,
      };
      const current = grouped.get(key) ?? {
        key,
        label: `${distanceMeters}m · ${exerciseName}`,
        distanceMeters,
        exerciseName,
        points: [],
      };
      current.points.push(point);
      grouped.set(key, current);
    });
  });

  return [...grouped.values()]
    .map(series => ({
      ...series,
      best: [...series.points].sort((first, second) => first.timeSeconds - second.timeSeconds)[0],
      latest: series.points[series.points.length - 1],
    }))
    .sort((first, second) => first.distanceMeters - second.distanceMeters || first.exerciseName.localeCompare(second.exerciseName));
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
}

function latestValue(days: RecoveryDay[], key: 'sleep' | 'rpe' | 'soreness') {
  return [...days].reverse().find(day => day[key] !== undefined)?.[key];
}

export function buildRecoveryTrend(
  logs: TrainingLogSummary[],
  now = new Date(),
  dayCount = 14,
): RecoveryTrend {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const days = Array.from({ length: dayCount }, (_, index) => {
    const date = addDays(today, index - dayCount + 1);
    const dateKey = toLocalDateKey(date);
    const dayLogs = logs.filter(log => toLocalDateKey(new Date(log.date)) === dateKey);
    const sleepValues = dayLogs.map(log => log.sleep).filter(value => Number.isFinite(value) && value > 0);
    const rpeValues = dayLogs.map(log => log.rpe).filter(value => Number.isFinite(value) && value > 0);
    const sorenessValues = dayLogs.map(log => log.soreness).filter(value => Number.isFinite(value) && value >= 0);
    return {
      date: dateKey,
      sleep: average(sleepValues),
      rpe: average(rpeValues),
      soreness: average(sorenessValues),
    };
  });
  return {
    days,
    averages: {
      sleep: average(days.flatMap(day => day.sleep === undefined ? [] : [day.sleep])),
      rpe: average(days.flatMap(day => day.rpe === undefined ? [] : [day.rpe])),
      soreness: average(days.flatMap(day => day.soreness === undefined ? [] : [day.soreness])),
    },
    latest: {
      sleep: latestValue(days, 'sleep'),
      rpe: latestValue(days, 'rpe'),
      soreness: latestValue(days, 'soreness'),
    },
  };
}

export function buildRecentSessions(
  logs: TrainingLogSummary[],
  sessions: CompletedWorkoutSession[],
  limit = 5,
): RecentSession[] {
  return [...logs]
    .sort((first, second) => new Date(second.date).getTime() - new Date(first.date).getTime())
    .slice(0, limit)
    .map(log => {
      const session = sessions.find(item => item.id === log.sessionId);
      const timedReps = session?.actualResults.flatMap(result => {
        const exercise = plannedExercise(session, result.exerciseId);
        if (!exercise || exercise.tracking.kind !== 'track') return [];
        const distanceMeters = exercise.tracking.distanceMeters;
        return (result.trackReps ?? [])
          .filter(rep => rep.status === 'completed' && typeof rep.timeSeconds === 'number' && rep.timeSeconds > 0)
          .map(rep => ({
            timeSeconds: rep.timeSeconds as number,
            distanceMeters,
            conditions: effectiveConditions(session, rep.windOverride, rep.wind),
          }));
      }) ?? [];
      const best = [...timedReps].sort((first, second) => first.timeSeconds - second.timeSeconds)[0];
      return {
        id: log.id,
        date: log.date,
        title: log.workoutTitle ?? 'Training session',
        completed: log.completed,
        rpe: log.rpe,
        sleep: log.sleep > 0 ? log.sleep : undefined,
        exercisesCompleted: log.exercisesCompleted,
        exercisesPlanned: log.exercisesPlanned,
        bestSprintTime: best?.timeSeconds,
        bestSprintDistance: best?.distanceMeters,
        conditions: best?.conditions ?? session?.trackConditions,
        manual: !session,
      };
    });
}

export function formatProgressDate(date: string, options?: Intl.DateTimeFormatOptions) {
  return fromLocalDateKey(date).toLocaleDateString(undefined, options ?? { month: 'short', day: 'numeric' });
}
