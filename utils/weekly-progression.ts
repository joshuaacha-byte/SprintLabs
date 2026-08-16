import type { CompletedWorkoutSession, LibraryWorkout } from '@/types';
import {
  removeSuggestedWorkout,
  replaceSuggestedWorkout,
  type WeeklyPlanSuggestion,
} from '@/utils/plan-selector';

export type WeeklyProgressionProposal = {
  kind: 'baseline' | 'hold' | 'reduce' | 'progress-one';
  title: string;
  explanation: string;
  evidence: string[];
};

export function buildWeeklyProgressionProposal(
  sessions: CompletedWorkoutSession[],
  now = new Date(),
): WeeklyProgressionProposal {
  const cutoff = now.getTime() - 14 * 86_400_000;
  const recent = sessions.filter(session => new Date(session.finishedAt).getTime() >= cutoff);
  if (!recent.length) {
    return {
      kind: 'baseline',
      title: 'Start with the reviewed baseline week',
      explanation: 'There is not enough completed training yet to justify an automatic adjustment.',
      evidence: ['No completed sessions in the last 14 days', 'The first week stays editable before saving'],
    };
  }
  const completionRate = recent.filter(session => session.review.completed).length / recent.length;
  const averageRpe = recent.reduce((sum, session) => sum + (session.review.rpe || 0), 0) / recent.length;
  const averageSoreness = recent.reduce((sum, session) => sum + (session.review.soreness || 0), 0) / recent.length;
  const redReadiness = recent.some(session => session.readinessSnapshot?.readinessLevel === 'red');
  const evidence = [
    `${Math.round(completionRate * 100)}% session completion`,
    `Average RPE ${averageRpe.toFixed(1)}`,
    `Average soreness ${averageSoreness.toFixed(1)}`,
  ];

  if (redReadiness || averageSoreness >= 7 || completionRate < 0.6) {
    return {
      kind: 'reduce',
      title: 'Propose one less high-output exposure',
      explanation: 'Recent completion, soreness, or readiness does not support adding stress. Accepting removes one high-output day from this preview only.',
      evidence: [...evidence, redReadiness ? 'A recent readiness check reached red' : 'Recovery or completion crossed the reduction rule'],
    };
  }
  if (recent.length >= 3 && completionRate >= 0.8 && averageRpe <= 8 && averageSoreness <= 5) {
    return {
      kind: 'progress-one',
      title: 'Eligible for one reviewed progression',
      explanation: 'Only one session may advance, and only when its authored library record names an Approved next progression.',
      evidence,
    };
  }
  return {
    kind: 'hold',
    title: 'Hold the current weekly dose',
    explanation: 'The recent data supports consistency, not a volume or intensity increase.',
    evidence,
  };
}

export function applyWeeklyProgressionProposal(
  plan: Extract<WeeklyPlanSuggestion, { status: 'ready' }>,
  proposal: WeeklyProgressionProposal,
  workouts: LibraryWorkout[],
) {
  if (proposal.kind === 'reduce') {
    const removable = [...plan.suggestions].reverse().find(item => item.loadClass === 'high');
    return removable ? removeSuggestedWorkout(plan, removable.dayIndex) : plan;
  }
  if (proposal.kind === 'progress-one') {
    for (const suggestion of plan.suggestions) {
      const current = workouts.find(workout => workout.id === suggestion.workoutId);
      const progressionId = current?.progressionWorkoutId;
      if (progressionId && workouts.some(workout => workout.id === progressionId && workout.approvalStatus === 'approved')) {
        return replaceSuggestedWorkout(plan, suggestion.dayIndex, progressionId, workouts);
      }
    }
  }
  return plan;
}
