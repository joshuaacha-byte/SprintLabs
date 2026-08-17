import type { CoachMoment, CoachMomentEventType } from '@/types/coach-moment';
import type { SprintSeries } from '@/utils/progress';
import type { CelebrationKind } from '@/utils/streaks';

// Coach Moments, first pass: local-first, deterministic, event-driven observations — no Gemini
// call happens just because a moment is detected or shown; only tapping a moment's optional
// "Ask Split" handoff ever sends a real request (see components/coach-moment-card.tsx). Every
// function here is pure — it takes already-computed data and returns a moment or null, never
// touches storage itself, mirroring this codebase's existing split between pure detection
// (utils/coach-triggers.ts) and live data-gathering (utils/coach-triggers-live.ts).

/**
 * A new personal best: this session's own fastest completed rep for some distance/exercise is
 * now that series' best AND actually improves on whatever the best was before this session.
 * Never fires for the first-ever result at a distance — that's a baseline, not an improvement.
 */
export function detectPRMoment(seriesBefore: SprintSeries[], seriesAfter: SprintSeries[], justSavedSessionId: string): CoachMoment | null {
  for (const series of seriesAfter) {
    const isThisSessionsBest = series.best.id.startsWith(`${justSavedSessionId}:`);
    if (!isThisSessionsBest) continue;
    const before = seriesBefore.find(item => item.key === series.key);
    if (!before || before.points.length === 0) continue; // no prior baseline to improve on
    const previousBest = before.best.timeSeconds;
    const improvement = previousBest - series.best.timeSeconds;
    if (improvement < 0.005) continue; // not a meaningful improvement (or a tie)
    return {
      id: `pr-recorded:${series.key}:${series.best.id}`,
      type: 'pr-recorded',
      severity: 'high',
      headline: 'NEW BEST',
      pr: {
        event: series.label,
        newTimeSeconds: series.best.timeSeconds,
        previousTimeSeconds: previousBest,
        improvementSeconds: improvement,
      },
      handoff: {
        displayText: 'Ask Split what this changes',
        promptOverride: `I just recorded a new personal best in the ${series.label}: ${series.best.timeSeconds}s, improved from a previous best of ${previousBest}s (a ${improvement.toFixed(2)}s improvement). What does this change for my training?`,
        surface: 'log',
      },
    };
  }
  return null;
}

/** An unusually demanding session — RPE 9+ on SprintLab's existing 1-10 scale, the same threshold
 * utils/coach-triggers.ts's high_rpe trigger uses for a single standout session. */
export function detectHighRpeMoment(rpe: number): CoachMoment | null {
  if (rpe < 9) return null;
  return {
    id: 'high-rpe',
    type: 'high-rpe',
    severity: 'medium',
    headline: 'That one hit harder than usual.',
    body: `Session RPE ${rpe}/10 — noted for your next few sessions.`,
    handoff: {
      displayText: 'Ask Split about this session',
      promptOverride: `Today's session RPE was ${rpe}/10, noticeably harder than my usual sessions. Should this change my upcoming training?`,
      surface: 'log',
    },
  };
}

export function detectFirstWorkoutMoment(priorSessionsCount: number): CoachMoment | null {
  if (priorSessionsCount > 0) return null;
  return {
    id: 'first-workout',
    type: 'first-workout',
    severity: 'medium',
    headline: 'First session logged.',
    body: 'This is the start of your training record — trends and milestones build from here.',
  };
}

/**
 * Reuses whatever utils/streaks.ts::getWorkoutCompletionCelebrationState already computed for the
 * celebration screen — this never re-derives streak/week numbers itself, only picks whether one
 * of them is worth a Coach Moment and how to phrase it.
 */
export function detectCelebrationMoment(state: {
  kind: CelebrationKind;
  planStreak: { previous: number; current: number; isMilestone: boolean };
  consistencyStreak: { previous: number; current: number; isMilestone: boolean };
  week: { completed: number; due: number };
  coverage?: { completed: number; planned: number };
}): CoachMoment | null {
  if (state.kind === 'ended-early') {
    if (!state.coverage || state.coverage.completed === 0) return null; // nothing meaningful happened — no moment
    return {
      id: 'workout-ended-early',
      type: 'workout-ended-early',
      severity: 'low',
      headline: 'Logged exactly as it happened.',
      body: `${state.coverage.completed} of ${state.coverage.planned} planned exercises completed — that still counts toward your record.`,
    };
  }
  if (state.consistencyStreak.isMilestone) {
    return {
      id: `consistency-milestone:${state.consistencyStreak.current}`,
      type: 'consistency-milestone',
      severity: 'medium',
      headline: state.consistencyStreak.current === 1 ? 'First consistent week locked in.' : `${state.consistencyStreak.current} weeks locked in.`,
      handoff: {
        displayText: 'Ask Split what this changes',
        promptOverride: `I just hit a ${state.consistencyStreak.current}-week consistency streak (at least 80% of planned sessions completed each week). What does that change for my training going forward?`,
        surface: 'log',
      },
    };
  }
  if (state.week.due > 0 && state.week.completed === state.week.due) {
    return {
      id: `weekly-target-completed:${state.week.completed}`,
      type: 'weekly-target-completed',
      severity: 'medium',
      headline: `Nice work. ${state.week.completed}/${state.week.due} planned sessions completed this week.`,
    };
  }
  if (state.planStreak.isMilestone) {
    return {
      id: `plan-streak-milestone:${state.planStreak.current}`,
      type: 'plan-streak-milestone',
      severity: 'medium',
      headline: `${state.planStreak.current} sessions in a row.`,
    };
  }
  return null;
}

// Most-meaningful-first — a PR always wins (it's the rarest, highest-signal event), a fresh
// consistency milestone next, then the plainer "you did what you planned" acknowledgments, then
// a hard-session note, and an honest early-exit note last. Showing more than one at once would
// turn this into the "popup machine" the feature is explicitly meant to avoid.
const PRIORITY_ORDER: CoachMomentEventType[] = [
  'pr-recorded',
  'consistency-milestone',
  'weekly-target-completed',
  'plan-streak-milestone',
  'first-workout',
  'high-rpe',
  'workout-ended-early',
  'workout-completed',
];

export function selectPrimaryCoachMoment(candidates: (CoachMoment | null | undefined)[]): CoachMoment | null {
  const present = candidates.filter((moment): moment is CoachMoment => Boolean(moment));
  if (!present.length) return null;
  return [...present].sort((first, second) => PRIORITY_ORDER.indexOf(first.type) - PRIORITY_ORDER.indexOf(second.type))[0];
}
