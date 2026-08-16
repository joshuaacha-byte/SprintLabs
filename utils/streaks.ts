import type { CompletedWorkoutSession, ScheduledDay, WeekdayIndex } from '@/types';
import { scheduleVersionForDate, toLocalDateKey } from '@/utils/progress';
import type { ScheduleHistoryEntry, WeekDayProgress, WeekDayStatus } from '@/utils/progress';

/**
 * SprintLab streak rules (see SprintLab-UX-Design-Doctrine.md):
 * - Plan Streak: consecutive *scheduled* sessions completed. Rest/open days never break or
 *   extend it. A missed scheduled day breaks it once that day has passed. One-off/unplanned
 *   workouts never count unless the completed session's own `scheduledDate` matches that day
 *   exactly — a coincidental same-day completion with no link is never inferred as a match.
 * - Consistency Streak: consecutive *weeks* where >= 80% of that week's eligible scheduled
 *   sessions were completed. A week with zero eligible sessions is neutral (skipped, not broken).
 *   The current, still-in-progress week is never counted as a completed streak week.
 *
 * Both numbers are fully derived from the plan + completed-session history on every call —
 * nothing is cached or persisted, so deleting/editing a session or the plan recalculates
 * correctly with no drift. Completion is always matched by explicit scheduledDate linkage,
 * never by day-of-week or content coincidence.
 */

const CONSISTENCY_THRESHOLD = 0.8;
const CONSISTENCY_MAX_WEEKS_LOOKBACK = 156;
const PLAN_STREAK_MAX_LOOKBACK_DAYS = 365;

export const PLAN_STREAK_MILESTONES = [1, 3, 5, 10, 25, 50, 100] as const;
/** 1 represents "first successful week" per the doctrine's milestone list. */
export const CONSISTENCY_STREAK_MILESTONES = [1, 3, 5, 10, 25, 52] as const;

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function mondayFor(date: Date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const offset = copy.getDay() === 0 ? -6 : 1 - copy.getDay();
  copy.setDate(copy.getDate() + offset);
  return copy;
}

/** Resolves the ScheduledDay in effect for an exact calendar date, using historical schedule snapshots. */
function scheduleDayFor(schedule: ScheduledDay[], history: ScheduleHistoryEntry[], date: Date) {
  const dateKey = toLocalDateKey(date);
  const version = scheduleVersionForDate(history, schedule, dateKey);
  return version.find(entry => entry.dayIndex === date.getDay());
}

/**
 * A day counts as completed only when a session's own `scheduledDate` explicitly matches it
 * and its review was marked completed — never inferred from a coincidental same-day timestamp.
 */
function isLinkedCompletion(sessions: CompletedWorkoutSession[], dateKey: string) {
  return sessions.some(session => session.scheduledDate === dateKey && session.review.completed);
}

export function calculatePlanStreak(
  schedule: ScheduledDay[],
  sessions: CompletedWorkoutSession[],
  now = new Date(),
  history: ScheduleHistoryEntry[] = [],
): number {
  const todayKey = toLocalDateKey(now);
  const anchor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  let streak = 0;

  for (let offset = 0; offset < PLAN_STREAK_MAX_LOOKBACK_DAYS; offset += 1) {
    const date = addDays(anchor, -offset);
    const dateKey = toLocalDateKey(date);
    const scheduled = scheduleDayFor(schedule, history, date);
    if (!scheduled || scheduled.kind === 'rest') continue; // rest/open days never break or extend it

    const completed = isLinkedCompletion(sessions, dateKey);
    if (dateKey === todayKey && !completed) continue; // today hasn't "passed" yet
    if (!completed) break; // a missed scheduled day breaks the streak once it has passed
    streak += 1;
  }

  return streak;
}

export type WeekCompletion = { completed: number; due: number; percentage: number; days: WeekDayProgress[] };

/** Builds one week's linked-completion day statuses, Monday-anchored on `weekStart`. */
function buildWeekDays(
  schedule: ScheduledDay[],
  sessions: CompletedWorkoutSession[],
  weekStart: Date,
  now: Date,
  history: ScheduleHistoryEntry[],
): WeekDayProgress[] {
  const todayKey = toLocalDateKey(now);
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const dateKey = toLocalDateKey(date);
    const scheduled = scheduleDayFor(schedule, history, date);
    const completed = isLinkedCompletion(sessions, dateKey);
    const isFuture = dateKey > todayKey;
    const isToday = dateKey === todayKey;

    let status: WeekDayStatus;
    if (!scheduled || scheduled.kind === 'rest') status = 'rest';
    else if (completed) status = 'completed';
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
}

export function calculateCurrentWeekCompletion(
  schedule: ScheduledDay[],
  sessions: CompletedWorkoutSession[],
  now = new Date(),
  history: ScheduleHistoryEntry[] = [],
): WeekCompletion {
  const days = buildWeekDays(schedule, sessions, mondayFor(now), now, history);
  const dueDays = days.filter(day => day.status === 'completed' || day.status === 'missed' || day.status === 'today');
  const completed = dueDays.filter(day => day.status === 'completed').length;
  return {
    completed,
    due: dueDays.length,
    percentage: dueDays.length ? Math.round((completed / dueDays.length) * 100) : 0,
    days,
  };
}

/**
 * Consecutive prior weeks (not counting the current, still-open week) at >= 80% completion.
 * A week with no eligible scheduled sessions is neutral: it neither extends nor breaks the streak.
 */
export function calculateConsistencyStreak(
  schedule: ScheduledDay[],
  sessions: CompletedWorkoutSession[],
  now = new Date(),
  history: ScheduleHistoryEntry[] = [],
): number {
  let streak = 0;
  const currentMonday = mondayFor(now);

  for (let weekOffset = 1; weekOffset <= CONSISTENCY_MAX_WEEKS_LOOKBACK; weekOffset += 1) {
    const weekStart = addDays(currentMonday, -weekOffset * 7);
    const days = buildWeekDays(schedule, sessions, weekStart, now, history);
    // Eligible = scheduled workout days that have already occurred (excludes future/rest days).
    const eligible = days.filter(day => day.status === 'completed' || day.status === 'missed');
    if (eligible.length === 0) continue; // neutral week — does not break or extend
    const completed = eligible.filter(day => day.status === 'completed').length;
    const ratio = completed / eligible.length;
    if (ratio >= CONSISTENCY_THRESHOLD) streak += 1;
    else break;
  }

  return streak;
}

export type CelebrationKind = 'started' | 'incremented' | 'maintained' | 'one-off';

export type WorkoutCompletionCelebrationState = {
  kind: CelebrationKind;
  linkedToSchedule: boolean;
  planStreak: { previous: number; current: number; isMilestone: boolean };
  consistencyStreak: { previous: number; current: number; isMilestone: boolean };
  week: WeekCompletion;
};

/**
 * Compares streaks immediately before vs. immediately after this session, so the celebration
 * can say exactly what changed (and why nothing changed) instead of guessing.
 */
export function getWorkoutCompletionCelebrationState(
  schedule: ScheduledDay[],
  history: ScheduleHistoryEntry[],
  priorSessions: CompletedWorkoutSession[],
  justSavedSession: CompletedWorkoutSession,
  now = new Date(),
): WorkoutCompletionCelebrationState {
  const scheduledForThatDay = justSavedSession.scheduledDate
    ? scheduleVersionForDate(history, schedule, justSavedSession.scheduledDate)
      .find(entry => entry.dayIndex === fromLocalDateKey(justSavedSession.scheduledDate!).getDay())
    : undefined;
  const linkedToSchedule = Boolean(
    justSavedSession.review.completed
    && justSavedSession.scheduledDate
    && scheduledForThatDay?.kind === 'workout',
  );

  const sessionsAfter = [justSavedSession, ...priorSessions];
  const previousPlanStreak = calculatePlanStreak(schedule, priorSessions, now, history);
  const currentPlanStreak = calculatePlanStreak(schedule, sessionsAfter, now, history);
  const previousConsistencyStreak = calculateConsistencyStreak(schedule, priorSessions, now, history);
  const currentConsistencyStreak = calculateConsistencyStreak(schedule, sessionsAfter, now, history);
  const week = calculateCurrentWeekCompletion(schedule, sessionsAfter, now, history);

  const kind: CelebrationKind = !linkedToSchedule
    ? 'one-off'
    : currentPlanStreak > previousPlanStreak
      ? (previousPlanStreak === 0 ? 'started' : 'incremented')
      : 'maintained';

  return {
    kind,
    linkedToSchedule,
    planStreak: {
      previous: previousPlanStreak,
      current: currentPlanStreak,
      isMilestone: (PLAN_STREAK_MILESTONES as readonly number[]).includes(currentPlanStreak) && currentPlanStreak > previousPlanStreak,
    },
    consistencyStreak: {
      previous: previousConsistencyStreak,
      current: currentConsistencyStreak,
      isMilestone: (CONSISTENCY_STREAK_MILESTONES as readonly number[]).includes(currentConsistencyStreak) && currentConsistencyStreak > previousConsistencyStreak,
    },
    week,
  };
}

function fromLocalDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export { toLocalDateKey };
