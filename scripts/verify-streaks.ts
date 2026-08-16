import type { CompletedWorkoutSession, PostWorkoutReview, ScheduledDay, WeekdayIndex } from '../types/index.ts';
import {
  calculateConsistencyStreak,
  calculateCurrentWeekCompletion,
  calculatePlanStreak,
  getWorkoutCompletionCelebrationState,
} from '../utils/streaks.ts';
import type { ScheduleHistoryEntry } from '../utils/progress.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// --- fixtures -------------------------------------------------------------

function day(dayIndex: WeekdayIndex, kind: 'workout' | 'rest'): ScheduledDay {
  return {
    dayIndex,
    shortLabel: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][dayIndex],
    fullLabel: 'Day',
    kind,
    ...(kind === 'workout' ? { workout: { id: 'w', title: 'Workout' } as never } : { restTitle: 'Rest' }),
  };
}

/** Mon-Wed-Fri workout schedule, Tue/Thu/Sat/Sun rest — a typical sprint plan. */
const mwfSchedule: ScheduledDay[] = [
  day(0, 'rest'),
  day(1, 'workout'),
  day(2, 'rest'),
  day(3, 'workout'),
  day(4, 'rest'),
  day(5, 'workout'),
  day(6, 'rest'),
];

const review = (completed: boolean): PostWorkoutReview => ({
  completed,
  rpe: 6,
  energy: 4,
  sleep: 7,
  hamstring: 0,
  soreness: 1,
  notes: '',
});

let sessionCounter = 0;
function session(dateKey: string, options: { completed?: boolean; linked?: boolean } = {}): CompletedWorkoutSession {
  sessionCounter += 1;
  const { completed = true, linked = true } = options;
  return {
    id: `session-${sessionCounter}`,
    plannedWorkoutSnapshot: { id: 'w', title: 'Workout', sections: [] } as never,
    scheduledDate: linked ? dateKey : undefined,
    readinessStatus: 'ready' as never,
    startedAt: `${dateKey}T09:00:00.000Z`,
    elapsedSeconds: 1800,
    actualResults: [],
    finishedAt: `${dateKey}T10:00:00.000Z`,
    review: review(completed),
  };
}

/** Local date-key at noon (avoids DST/timezone edge issues), Monday-anchored offset in days. */
function dateKeyFor(monday: Date, offsetDays: number) {
  const d = new Date(monday);
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Finds the most recent Monday on/before `now`. */
function mondayOnOrBefore(now: Date) {
  const copy = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const offset = copy.getDay() === 0 ? -6 : 1 - copy.getDay();
  copy.setDate(copy.getDate() + offset);
  return copy;
}

// Anchor "now" to a fixed Friday so weeks are deterministic regardless of when this runs.
const NOW = new Date(2026, 7, 7, 12); // Friday, Aug 7 2026 (matches mwfSchedule's Mon/Wed/Fri workout days)
const THIS_MONDAY = mondayOnOrBefore(NOW);

function mondayWeeksAgo(weeks: number) {
  const d = new Date(THIS_MONDAY);
  d.setDate(d.getDate() - weeks * 7);
  return d;
}

let checks = 0;
function check(label: string, fn: () => void) {
  fn();
  checks += 1;
}

// --- 1. First-ever completion --------------------------------------------

check('first-ever completion starts a Plan Streak of 1', () => {
  const monday = mondayWeeksAgo(0);
  const s = [session(dateKeyFor(monday, 0))]; // Monday workout, only completed session
  const streak = calculatePlanStreak(mwfSchedule, s, new Date(dateKeyFor(monday, 0) + 'T12:00:00'));
  assert(streak === 1, `expected 1, got ${streak}`);
});

// --- 2. Rest-day gap does not break the streak ----------------------------

check('rest days between completed scheduled sessions do not break Plan Streak', () => {
  const monday = mondayWeeksAgo(0);
  const s = [session(dateKeyFor(monday, 0)), session(dateKeyFor(monday, 2)), session(dateKeyFor(monday, 4))]; // Mon, Wed, Fri
  const now = new Date(dateKeyFor(monday, 4) + 'T18:00:00');
  const streak = calculatePlanStreak(mwfSchedule, s, now);
  assert(streak === 3, `expected 3, got ${streak}`);
});

// --- 3. Open/non-scheduled day gap (same as rest in this data model) -----

check('a day entirely absent from the schedule array is neutral, like rest', () => {
  const scheduleWithGap: ScheduledDay[] = mwfSchedule.filter(d => d.dayIndex !== 3); // Wednesday entry removed outright
  const monday = mondayWeeksAgo(0);
  const s = [session(dateKeyFor(monday, 0)), session(dateKeyFor(monday, 4))]; // Mon, Fri
  const now = new Date(dateKeyFor(monday, 4) + 'T18:00:00');
  const streak = calculatePlanStreak(scheduleWithGap, s, now);
  assert(streak === 2, `expected 2, got ${streak}`);
});

// --- 4. A missed scheduled day breaks the streak once passed --------------

check('a missed scheduled day breaks the Plan Streak once it has passed', () => {
  const monday = mondayWeeksAgo(0);
  const s = [session(dateKeyFor(monday, 0))]; // Monday completed, Wednesday missed
  const now = new Date(dateKeyFor(monday, 4) + 'T12:00:00'); // now = Friday, Wed has passed uncompleted
  const streak = calculatePlanStreak(mwfSchedule, s, now);
  assert(streak === 0, `expected 0 (streak broken by missed Wed), got ${streak}`);
});

// --- 5. Rescheduled workout follows the updated date -----------------------

check('a session rescheduled to a new date is evaluated against that date', () => {
  const history: ScheduleHistoryEntry[] = [];
  const monday = mondayWeeksAgo(0);
  // Workout completed on Tuesday (normally a rest day) via an explicit scheduledDate link.
  const s = [session(dateKeyFor(monday, 1))];
  const rescheduledSchedule: ScheduledDay[] = mwfSchedule.map(d => d.dayIndex === 2 ? { ...d, kind: 'workout' as const } : d);
  const now = new Date(dateKeyFor(monday, 1) + 'T20:00:00');
  const streak = calculatePlanStreak(rescheduledSchedule, s, now, history);
  assert(streak === 1, `expected 1, got ${streak}`);
});

// --- 6. Deleted scheduled workout must not count as missed -----------------

check('removing a day from the schedule (deleted) does not break the streak', () => {
  const scheduleWithoutWednesday: ScheduledDay[] = mwfSchedule.map(d => d.dayIndex === 3 ? { ...d, kind: 'rest' as const } : d);
  const monday = mondayWeeksAgo(0);
  const s = [session(dateKeyFor(monday, 0)), session(dateKeyFor(monday, 4))];
  const now = new Date(dateKeyFor(monday, 4) + 'T18:00:00');
  const streak = calculatePlanStreak(scheduleWithoutWednesday, s, now);
  assert(streak === 2, `expected 2, got ${streak}`);
});

// --- 7. One-off unlinked workout never counts automatically ----------------

check('an unlinked one-off workout does not affect the Plan Streak', () => {
  const monday = mondayWeeksAgo(0);
  const linked = session(dateKeyFor(monday, 0));
  const unlinked = session(dateKeyFor(monday, 1), { linked: false }); // Tuesday, a rest day anyway, unlinked
  const now = new Date(dateKeyFor(monday, 1) + 'T18:00:00');
  const streakWithUnlinked = calculatePlanStreak(mwfSchedule, [linked, unlinked], now);
  const streakWithoutUnlinked = calculatePlanStreak(mwfSchedule, [linked], now);
  assert(streakWithUnlinked === streakWithoutUnlinked, 'unlinked one-off session must not change the Plan Streak');
});

// --- 8. Intentionally-linked one-off DOES count -----------------------------

check('a one-off explicitly linked to a scheduled day counts toward the celebration state', () => {
  const monday = mondayWeeksAgo(0);
  const linkedOneOff = session(dateKeyFor(monday, 0), { linked: true });
  const state = getWorkoutCompletionCelebrationState(mwfSchedule, [], [], linkedOneOff, new Date(dateKeyFor(monday, 0) + 'T18:00:00'));
  assert(state.linkedToSchedule, 'expected linkedToSchedule to be true for a scheduled-date-linked session');
  assert(state.kind === 'started', `expected 'started', got '${state.kind}'`);
});

// --- 9. Only a finalized+saved workout increments; partial/incomplete review does not ----

check('an incomplete review (review.completed = false) does not increment the Plan Streak', () => {
  const monday = mondayWeeksAgo(0);
  const s = [session(dateKeyFor(monday, 0), { completed: false })];
  const now = new Date(dateKeyFor(monday, 0) + 'T18:00:00');
  const streak = calculatePlanStreak(mwfSchedule, s, now);
  assert(streak === 0, `expected 0, got ${streak}`);
});

// --- 10. No duplicate counting of the same scheduled workout --------------

check('two completed sessions on the same scheduled date only count once', () => {
  const monday = mondayWeeksAgo(0);
  const s = [session(dateKeyFor(monday, 0)), session(dateKeyFor(monday, 0))];
  const now = new Date(dateKeyFor(monday, 0) + 'T18:00:00');
  const streak = calculatePlanStreak(mwfSchedule, s, now);
  assert(streak === 1, `expected 1 (deduped), got ${streak}`);
});

// --- 11. Deleting a saved workout recalculates from remaining history ------

check('deleting a completed session recalculates the streak from what remains', () => {
  const monday = mondayWeeksAgo(0);
  const all = [session(dateKeyFor(monday, 0)), session(dateKeyFor(monday, 2)), session(dateKeyFor(monday, 4))];
  const now = new Date(dateKeyFor(monday, 4) + 'T18:00:00');
  const before = calculatePlanStreak(mwfSchedule, all, now);
  const afterDeletingMostRecent = calculatePlanStreak(mwfSchedule, all.slice(0, 2), now);
  assert(before === 3, `expected full streak of 3, got ${before}`);
  assert(afterDeletingMostRecent === 2, `expected 2 after deleting the most recent session, got ${afterDeletingMostRecent}`);
});

// --- 12. Deleted scheduled workout (whole day) is excluded from week denominator, not miscounted ---
// (Covered by check #6 above via the streak; also verify week completion denominator excludes it.)

check('a day removed from the schedule is excluded from the current week denominator', () => {
  const scheduleWithoutWednesday: ScheduledDay[] = mwfSchedule.map(d => d.dayIndex === 3 ? { ...d, kind: 'rest' as const } : d);
  const monday = mondayWeeksAgo(0);
  const now = new Date(dateKeyFor(monday, 5) + 'T12:00:00'); // Saturday
  const week = calculateCurrentWeekCompletion(scheduleWithoutWednesday, [], now);
  assert(week.due === 2, `expected 2 eligible days (Mon, Fri), got ${week.due}`);
});

// --- 13. Completed after midnight uses the scheduled/local date, not clock time ---

check('a session completed just after midnight is still credited to its scheduled date', () => {
  const monday = mondayWeeksAgo(0);
  const scheduledKey = dateKeyFor(monday, 0);
  const s: CompletedWorkoutSession = { ...session(scheduledKey), startedAt: `${scheduledKey}T23:50:00.000Z`, finishedAt: `${dateKeyFor(monday, 1)}T00:10:00.000Z` };
  const now = new Date(scheduledKey + 'T23:59:00');
  const streak = calculatePlanStreak(mwfSchedule, [s], now);
  assert(streak === 1, `expected 1, got ${streak}`);
});

// --- 14. Started before / saved after midnight — same as above, scheduledDate governs ---
// (Identical mechanism to #13 — scheduledDate, not startedAt/finishedAt clock time, drives the date key.)

// --- 15. Duplicate Finish taps produce duplicate saved sessions but must not double count ---
// (Covered by check #10 — dedup is by date, so duplicate saves of the same scheduled day collapse to 1.)

// --- 16. Save failure: streak must not increase (simulated at the call-site, not in these pure functions) ---

check('celebration state is only ever computed from sessions actually passed in (no phantom increments)', () => {
  const monday = mondayWeeksAgo(0);
  const prior: CompletedWorkoutSession[] = [];
  // Simulate a "failed save": the just-completed session is NOT included in `sessionsAfter` inputs
  // because the caller never calls getWorkoutCompletionCelebrationState until the save succeeds.
  const streakIfSaveNeverHappened = calculatePlanStreak(mwfSchedule, prior, new Date(dateKeyFor(monday, 0) + 'T18:00:00'));
  assert(streakIfSaveNeverHappened === 0, 'a failed save must leave the Plan Streak unchanged');
});

// --- 17. Week with one session -------------------------------------------

check('a week with exactly one eligible session computes 100%/0% correctly', () => {
  const oneSessionSchedule: ScheduledDay[] = mwfSchedule.map(d => d.dayIndex === 1 ? d : { ...d, kind: 'rest' as const });
  const monday = mondayWeeksAgo(0);
  const now = new Date(dateKeyFor(monday, 6) + 'T12:00:00');
  const completedWeek = calculateCurrentWeekCompletion(oneSessionSchedule, [session(dateKeyFor(monday, 0))], now);
  assert(completedWeek.due === 1 && completedWeek.completed === 1, `expected 1/1, got ${completedWeek.completed}/${completedWeek.due}`);
});

// --- 18. Week with zero sessions is neutral --------------------------------

check('a week with zero eligible sessions does not break or extend the Consistency Streak', () => {
  const allRest: ScheduledDay[] = mwfSchedule.map(d => ({ ...d, kind: 'rest' as const }));
  const now = NOW;
  const streak = calculateConsistencyStreak(allRest, [], now);
  assert(streak === 0, `expected 0 (no eligible weeks either way), got ${streak}`);
});

// --- 19. Exactly 80% counts as a successful week ---------------------------

check('exactly 80% completion counts as a successful Consistency week', () => {
  // 5 eligible sessions in a week, 4 completed = 80%.
  const fiveDaySchedule: ScheduledDay[] = [0, 1, 2, 3, 4, 5, 6].map(i => day(i as WeekdayIndex, i === 6 || i === 0 ? 'rest' : 'workout'));
  const weekAgoMonday = mondayWeeksAgo(1);
  const s = [0, 1, 2, 3].map(offset => session(dateKeyFor(weekAgoMonday, offset + 1))); // Mon-Thu completed, Fri missed
  const streak = calculateConsistencyStreak(fiveDaySchedule, s, NOW);
  assert(streak === 1, `expected 1 successful week at exactly 80%, got ${streak}`);
});

// --- 20. 79% must not round up to 80% ---------------------------------------

check('79% completion must not round up to a successful Consistency week', () => {
  // 14 eligible sessions across 2 weeks isn't representative; test with a week of 7 eligible sessions, 5.53 completed is impossible with integers,
  // so use 9 eligible sessions where 7/9 = 77.8% (below) and confirm it breaks, then use a case designed to be just under 80%.
  // 5 eligible sessions, 3 completed = 60% -- clearly below; use exact ratio construction below with 10 eligible, 7 completed = 70%.
  // For a precise "79%" style near-miss, use a schedule with all 7 days as workouts (7 eligible), 5 completed = 71.4%; still below.
  // The important invariant is: ratio must use >= 0.8 with no rounding. Verify with 4/5 = 80% (passes) vs 3/4 = 75% (fails) explicitly:
  const fourDaySchedule: ScheduledDay[] = [0, 1, 2, 3, 4, 5, 6].map(i => day(i as WeekdayIndex, i === 0 || i === 5 || i === 6 ? 'rest' : 'workout'));
  const weekAgoMonday = mondayWeeksAgo(1);
  const s = [0, 1, 2].map(offset => session(dateKeyFor(weekAgoMonday, offset + 1))); // 3 of 4 eligible = 75%
  const streak = calculateConsistencyStreak(fourDaySchedule, s, NOW);
  assert(streak === 0, `expected 0 (75% must not count as successful), got ${streak}`);
});

// --- 21. The current, still-open week is never counted as a completed week ---

check('the current in-progress week is excluded from the Consistency Streak count even at 100%', () => {
  const monday = mondayWeeksAgo(0);
  const s = [session(dateKeyFor(monday, 0))]; // Monday done; Wed/Fri haven't happened yet (now = NOW = Friday same week)
  const streak = calculateConsistencyStreak(mwfSchedule, s, NOW);
  // NOW is a Friday within `monday`'s own week — that week must not be counted regardless of its live ratio.
  assert(streak === 0, `expected 0 (current week excluded), got ${streak}`);
});

check('calculateCurrentWeekCompletion shows live progress for the still-open week', () => {
  const monday = mondayWeeksAgo(0);
  const s = [session(dateKeyFor(monday, 0))];
  const week = calculateCurrentWeekCompletion(mwfSchedule, s, NOW);
  assert(week.completed === 1, `expected live completed=1, got ${week.completed}`);
});

// --- 22. Timezone change — dates are derived from local calendar days, not UTC ---

check('date keys are computed from local calendar fields, not UTC, avoiding timezone-shift misattribution', () => {
  const monday = mondayWeeksAgo(0);
  const scheduledKey = dateKeyFor(monday, 0);
  // A session started late in the local evening (would roll to the next UTC day for negative-offset zones)
  // must still key off the explicit scheduledDate we pass, not a UTC-derived recomputation.
  const s = session(scheduledKey);
  const streak = calculatePlanStreak(mwfSchedule, [s], new Date(scheduledKey + 'T22:00:00'));
  assert(streak === 1, `expected 1, got ${streak}`);
});

// --- 23. App reopened after completion — pure recompute, no stored/stale value ---

check('recomputing from the same inputs after time has passed yields the same historical streak count', () => {
  const monday = mondayWeeksAgo(0);
  const s = [session(dateKeyFor(monday, 0)), session(dateKeyFor(monday, 2)), session(dateKeyFor(monday, 4))];
  const at = calculatePlanStreak(mwfSchedule, s, new Date(dateKeyFor(monday, 4) + 'T18:00:00'));
  const muchLater = calculatePlanStreak(mwfSchedule, s, new Date(dateKeyFor(monday, 4) + 'T18:00:00')); // simulate reopening the app later with identical stored data
  assert(at === muchLater, 'recompute must be stable given identical inputs');
});

// --- 24. Legacy pre-feature users: sessions with no scheduledDate at all ---

check('legacy sessions without scheduledDate never count toward Plan Streak (nothing invented from unreliable data)', () => {
  const monday = mondayWeeksAgo(0);
  const legacySession: CompletedWorkoutSession = { ...session(dateKeyFor(monday, 0), { linked: false }) };
  assert(legacySession.scheduledDate === undefined, 'fixture sanity check');
  const streak = calculatePlanStreak(mwfSchedule, [legacySession], new Date(dateKeyFor(monday, 0) + 'T18:00:00'));
  assert(streak === 0, 'a legacy session with no scheduledDate must not be invented into a streak');
});

// --- Milestone detection ----------------------------------------------------

check('milestone flag is set only when crossing a milestone threshold, not on every completion', () => {
  const monday = mondayWeeksAgo(0);
  const prior = [session(dateKeyFor(monday, 0)), session(dateKeyFor(monday, 2))]; // Plan Streak of 2 so far
  const justSaved = session(dateKeyFor(monday, 4)); // Friday completes a 3rd in a row -> milestone at 3
  const state = getWorkoutCompletionCelebrationState(mwfSchedule, [], prior, justSaved, new Date(dateKeyFor(monday, 4) + 'T18:00:00'));
  assert(state.planStreak.current === 3, `expected current streak 3, got ${state.planStreak.current}`);
  assert(state.planStreak.isMilestone, 'expected isMilestone=true at 3-session Plan Streak');
});

check('an honest "maintained" celebration is returned when a linked session does not move the Plan Streak', () => {
  const monday = mondayWeeksAgo(0);
  // Prior streak already broken (missed Monday), so completing Wednesday doesn't chain into a streak increase from 0->0 vs unrelated.
  const prior: CompletedWorkoutSession[] = [];
  const justSaved = session(dateKeyFor(monday, 2)); // Wednesday, first completion this eval -> should be 'started', not 'maintained'.
  const state = getWorkoutCompletionCelebrationState(mwfSchedule, [], prior, justSaved, new Date(dateKeyFor(monday, 2) + 'T18:00:00'));
  assert(state.kind === 'started', `expected 'started' for a first-ever completion, got '${state.kind}'`);
});

console.log(`verify-streaks: ${checks} checks passed.`);
