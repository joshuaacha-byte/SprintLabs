import type { CompletedWorkoutSession, ScheduledDay, WeekdayIndex } from '@/types';
import { scheduleVersionForDate, sessionsForDate, toLocalDateKey } from '@/utils/progress';
import type { ScheduleHistoryEntry, WeekDayProgress, WeekDayStatus } from '@/utils/progress';
import { getSessionCoverage } from '@/utils/workout-session';

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

/** Streak milestones count consecutive *completed planned workouts* (Plan Streak increments),
 * not calendar days — a rest day preserves the streak without advancing it, so it never advances
 * a milestone either. */
export const PLAN_STREAK_MILESTONES = [7, 14, 30, 60, 100, 180, 365] as const;
/** 1 represents "first successful week" — consecutive weeks at/above the consistency threshold. */
export const CONSISTENCY_STREAK_MILESTONES = [1, 3, 5, 10, 25, 52] as const;
/** Lifetime distinct completed planned workouts (not streak-dependent — survives a broken streak). */
export const TRAINING_COUNT_MILESTONES = [1, 10, 25, 50, 100, 250] as const;

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

/**
 * The longest Plan Streak ever reached, scanning the same lookback window as the current streak.
 * Purely derived from schedule + completed-session history (like `calculatePlanStreak`) — never
 * persisted, so it can't drift from what actually happened and needs no migration.
 */
export function calculateLongestPlanStreak(
  schedule: ScheduledDay[],
  sessions: CompletedWorkoutSession[],
  now = new Date(),
  history: ScheduleHistoryEntry[] = [],
): number {
  const todayKey = toLocalDateKey(now);
  const anchor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const start = addDays(anchor, -(PLAN_STREAK_MAX_LOOKBACK_DAYS - 1));
  let running = 0;
  let longest = 0;

  for (let offset = 0; offset < PLAN_STREAK_MAX_LOOKBACK_DAYS; offset += 1) {
    const date = addDays(start, offset);
    const dateKey = toLocalDateKey(date);
    if (dateKey > todayKey) break; // never evaluate future days
    const scheduled = scheduleDayFor(schedule, history, date);
    if (!scheduled || scheduled.kind === 'rest') continue; // rest/open days never break or extend a run

    const completed = isLinkedCompletion(sessions, dateKey);
    if (dateKey === todayKey && !completed) continue; // today hasn't "passed" yet
    if (!completed) { running = 0; continue; } // a missed scheduled day ends this run, not the search
    running += 1;
    longest = Math.max(longest, running);
  }

  return longest;
}

/**
 * Lifetime count of distinct scheduled workout days successfully completed — the "planned
 * workouts completed" number training milestones are measured against. Deduped by date exactly
 * like the streak (two sessions saved for the same scheduled day only count once), and unbounded
 * by the streak's lookback window since a broken streak must not erase this history.
 */
export function countPlannedWorkoutsCompleted(
  schedule: ScheduledDay[],
  sessions: CompletedWorkoutSession[],
  history: ScheduleHistoryEntry[] = [],
): number {
  const linkedDateKeys = new Set(
    sessions
      .filter(session => session.review.completed && session.scheduledDate)
      .map(session => session.scheduledDate as string),
  );
  let count = 0;
  linkedDateKeys.forEach(dateKey => {
    const version = scheduleVersionForDate(history, schedule, dateKey);
    const scheduled = version.find(entry => entry.dayIndex === fromLocalDateKey(dateKey).getDay());
    if (scheduled?.kind === 'workout') count += 1;
  });
  return count;
}

export type PlanConsistency = { completed: number; required: number; percentage: number };

/**
 * Plan adherence over a rolling window ending "now": completed required planned sessions ÷
 * required planned sessions. Rest days are never in the denominator, and future scheduled days
 * (including today, until completed) are excluded rather than counted as missed.
 */
export function calculatePlanConsistency(
  schedule: ScheduledDay[],
  sessions: CompletedWorkoutSession[],
  now = new Date(),
  windowDays = 30,
  history: ScheduleHistoryEntry[] = [],
): PlanConsistency {
  const todayKey = toLocalDateKey(now);
  const anchor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  let required = 0;
  let completed = 0;

  for (let offset = 0; offset < windowDays; offset += 1) {
    const date = addDays(anchor, -offset);
    const dateKey = toLocalDateKey(date);
    const scheduled = scheduleDayFor(schedule, history, date);
    if (!scheduled || scheduled.kind === 'rest') continue;
    if (dateKey >= todayKey) continue; // today/future not yet "due"
    required += 1;
    if (isLinkedCompletion(sessions, dateKey)) completed += 1;
  }

  return { completed, required, percentage: required ? Math.round((completed / required) * 100) : 0 };
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
    const daySessions = sessionsForDate(sessions, dateKey);
    const completed = isLinkedCompletion(sessions, dateKey);
    // A session exists for the day but wasn't marked fully completed — the athlete ended early or
    // stopped short, rather than never training that day at all. Distinguishing this from a plain
    // miss is what lets Today/Progress/the completion celebration show "ended early" honestly
    // instead of silently presenting the day as untouched.
    const hasPartial = daySessions.length > 0 && !completed;
    const isFuture = dateKey > todayKey;
    const isToday = dateKey === todayKey;

    let status: WeekDayStatus;
    // Matches utils/progress.ts's buildWeeklyProgress exactly, so the workout-completion screen
    // and the Progress/Consistency screen can never disagree about what a rest day with an extra
    // session logged on it looks like.
    if (!scheduled || scheduled.kind === 'rest') status = daySessions.some(session => session.review.completed) ? 'extra' : 'rest';
    else if (completed) status = 'completed';
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
}

export function calculateCurrentWeekCompletion(
  schedule: ScheduledDay[],
  sessions: CompletedWorkoutSession[],
  now = new Date(),
  history: ScheduleHistoryEntry[] = [],
): WeekCompletion {
  const days = buildWeekDays(schedule, sessions, mondayFor(now), now, history);
  const dueDays = days.filter(day => day.status === 'completed' || day.status === 'partial' || day.status === 'missed' || day.status === 'today');
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
    // A partial/ended-early day is eligible but not completed — it counts against the ratio the
    // same way a missed day would, rather than being silently dropped from the denominator.
    const eligible = days.filter(day => day.status === 'completed' || day.status === 'partial' || day.status === 'missed');
    if (eligible.length === 0) continue; // neutral week — does not break or extend
    const completed = eligible.filter(day => day.status === 'completed').length;
    const ratio = completed / eligible.length;
    if (ratio >= CONSISTENCY_THRESHOLD) streak += 1;
    else break;
  }

  return streak;
}

// 'ended-early' is a session linked to a real scheduled workout day that the athlete didn't mark
// fully completed — it never collapses into 'one-off' (which would misrepresent it as an
// unplanned extra session) or silently borrow 'maintained''s "nothing changed" framing.
export type CelebrationKind = 'started' | 'incremented' | 'maintained' | 'one-off' | 'ended-early';

export type WorkoutCompletionCelebrationState = {
  kind: CelebrationKind;
  linkedToSchedule: boolean;
  planStreak: { previous: number; current: number; isMilestone: boolean };
  longestPlanStreak: number;
  consistencyStreak: { previous: number; current: number; isMilestone: boolean };
  trainingCount: { previous: number; current: number; isMilestone: boolean };
  week: WeekCompletion;
  /** Only meaningful when kind === 'ended-early' — how much of the planned session was actually done. */
  coverage?: { completed: number; planned: number };
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
  // Deliberately does NOT require review.completed — a partially-completed or ended-early session
  // is still "linked" to today's real scheduled workout; only a session with no scheduledDate (or
  // one that lands on a rest/open day) is a genuine one-off. Whether it counts toward the Plan
  // Streak is decided separately, by isLinkedCompletion (requires review.completed === true).
  const linkedToSchedule = Boolean(justSavedSession.scheduledDate && scheduledForThatDay?.kind === 'workout');

  const sessionsAfter = [justSavedSession, ...priorSessions];
  const previousPlanStreak = calculatePlanStreak(schedule, priorSessions, now, history);
  const currentPlanStreak = calculatePlanStreak(schedule, sessionsAfter, now, history);
  const previousConsistencyStreak = calculateConsistencyStreak(schedule, priorSessions, now, history);
  const currentConsistencyStreak = calculateConsistencyStreak(schedule, sessionsAfter, now, history);
  const previousTrainingCount = countPlannedWorkoutsCompleted(schedule, priorSessions, history);
  const currentTrainingCount = countPlannedWorkoutsCompleted(schedule, sessionsAfter, history);
  const longestPlanStreak = calculateLongestPlanStreak(schedule, sessionsAfter, now, history);
  const week = calculateCurrentWeekCompletion(schedule, sessionsAfter, now, history);

  const kind: CelebrationKind = !linkedToSchedule
    ? 'one-off'
    : !justSavedSession.review.completed
      ? 'ended-early'
      : currentPlanStreak > previousPlanStreak
        ? (previousPlanStreak === 0 ? 'started' : 'incremented')
        : 'maintained';

  return {
    kind,
    linkedToSchedule,
    coverage: kind === 'ended-early' ? getSessionCoverage(justSavedSession) : undefined,
    planStreak: {
      previous: previousPlanStreak,
      current: currentPlanStreak,
      isMilestone: (PLAN_STREAK_MILESTONES as readonly number[]).includes(currentPlanStreak) && currentPlanStreak > previousPlanStreak,
    },
    longestPlanStreak,
    consistencyStreak: {
      previous: previousConsistencyStreak,
      current: currentConsistencyStreak,
      isMilestone: (CONSISTENCY_STREAK_MILESTONES as readonly number[]).includes(currentConsistencyStreak) && currentConsistencyStreak > previousConsistencyStreak,
    },
    trainingCount: {
      previous: previousTrainingCount,
      current: currentTrainingCount,
      isMilestone: (TRAINING_COUNT_MILESTONES as readonly number[]).includes(currentTrainingCount) && currentTrainingCount > previousTrainingCount,
    },
    week,
  };
}

/** A "perfect" week: every eligible planned session for the current week is complete (and at
 * least one was due) — a consistency milestone distinct from the weekly streak's 80% threshold. */
export function isPerfectWeek(week: WeekCompletion): boolean {
  return week.due > 0 && week.completed === week.due;
}

function fromLocalDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export { toLocalDateKey };
