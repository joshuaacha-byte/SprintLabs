import type { SprintSeries } from '@/utils/progress';
import { isPerfectWeek, type WeekCompletion } from '@/utils/streaks';

/**
 * SprintLab's milestone/achievement catalog — a small, named, centrally-defined set (not an
 * auto-generated list of every Nth threshold) so each one can carry its own title, description,
 * and icon. Every unlock state below is derived from real stored athlete data (workout history,
 * plan consistency, recorded sprint results) — nothing here is a manually-toggled badge.
 *
 * Extending this later (event-time achievements, volume achievements, seasonal/competition
 * accomplishments) means adding another entry to `buildMilestoneCollection`'s returned array; the
 * shape and the UI that renders it (app/(tabs)/progress.tsx) don't need to change.
 */
export type MilestoneCategory = 'training' | 'consistency' | 'performance';

export type Milestone = {
  id: string;
  category: MilestoneCategory;
  title: string;
  description: string;
  icon: string; // MaterialIcons glyph name, kept as a plain string to avoid importing the icon font types here
  unlocked: boolean;
  /** Present only where partial progress is meaningful to show (e.g. "7 / 10 sessions"). */
  progress?: { current: number; target: number };
};

export type MilestoneInputs = {
  /** Lifetime distinct completed planned workouts — utils/streaks.ts::countPlannedWorkoutsCompleted. */
  trainingCount: number;
  /** Consecutive weeks at/above the consistency threshold — utils/streaks.ts::calculateConsistencyStreak. */
  consistencyStreak: number;
  /** The current week's live completion, for the Perfect Week check. */
  currentWeek: WeekCompletion;
  /** Recorded timed-sprint results — utils/progress.ts::buildSprintSeries, built from lifetime sessions. */
  sprintSeries: SprintSeries[];
};

const TRAINING_MILESTONES: { threshold: number; title: string; description: string }[] = [
  { threshold: 1, title: 'FIRST REP', description: 'Complete your first SprintLab workout.' },
  { threshold: 10, title: 'TEN DOWN', description: 'Complete 10 workouts.' },
  { threshold: 25, title: '25 SESSIONS', description: 'Complete 25 workouts.' },
  { threshold: 50, title: '50 SESSIONS', description: 'Complete 50 workouts.' },
  { threshold: 100, title: '100 SESSIONS', description: 'Complete 100 workouts.' },
];

const CONSISTENCY_WEEKS_TARGET = 4;

export function buildMilestoneCollection(input: MilestoneInputs): Milestone[] {
  const training: Milestone[] = TRAINING_MILESTONES.map(({ threshold, title, description }) => ({
    id: `training:${threshold}`,
    category: 'training',
    title,
    description,
    icon: 'check-circle',
    unlocked: input.trainingCount >= threshold,
    progress: { current: Math.min(input.trainingCount, threshold), target: threshold },
  }));

  const lockedIn: Milestone = {
    id: 'consistency:locked-in',
    category: 'consistency',
    title: 'LOCKED IN',
    description: `Complete ${CONSISTENCY_WEEKS_TARGET} consistent training weeks.`,
    icon: 'verified',
    unlocked: input.consistencyStreak >= CONSISTENCY_WEEKS_TARGET,
    progress: { current: Math.min(input.consistencyStreak, CONSISTENCY_WEEKS_TARGET), target: CONSISTENCY_WEEKS_TARGET },
  };

  const perfectWeek: Milestone = {
    id: 'consistency:perfect-week',
    category: 'consistency',
    title: 'PERFECT WEEK',
    description: 'Complete every planned workout in a training week.',
    icon: 'event-available',
    unlocked: isPerfectWeek(input.currentWeek),
    // A week either is or isn't perfect yet — no meaningful partial state to show.
  };

  // "A personal best has been recorded" and "the most recent recorded effort for some distance is
  // also the best-ever recorded effort for it" reuse the exact same timed-sprint history
  // (buildSprintSeries) app/(tabs)/history.tsx already trusts for its own "recently improved"
  // indicator — no separate PR-history log needed, and nothing here can be satisfied by simply
  // typing a faster number into onboarding.
  const hasRecordedResult = input.sprintSeries.length > 0;
  const hasRecentBest = input.sprintSeries.some(series => series.points.length >= 2 && series.latest.id === series.best.id);

  const firstPr: Milestone = {
    id: 'performance:first-pr',
    category: 'performance',
    title: 'FIRST PR',
    description: 'Record your first personal best.',
    icon: 'bolt',
    unlocked: hasRecordedResult,
  };

  const breakthrough: Milestone = {
    id: 'performance:breakthrough',
    category: 'performance',
    title: 'BREAKTHROUGH',
    description: 'Improve an existing event personal best.',
    icon: 'trending-up',
    unlocked: hasRecentBest,
  };

  return [...training, lockedIn, perfectWeek, firstPr, breakthrough];
}
