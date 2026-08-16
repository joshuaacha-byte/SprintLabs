import type { CompletedWorkoutSession } from '@/types';
import { sessionDateKey } from '@/utils/progress';

export type TrainingInsight = {
  observation: string;
  evidence: string;
  confidence: string;
  action?: string;
};

type SessionFade = {
  date: string;
  rpe?: number;
  fadeSeconds: number;
};

function plannedExercise(session: CompletedWorkoutSession, exerciseId: string) {
  const result = session.actualResults.find(item => item.exerciseId === exerciseId);
  return result?.exerciseSnapshot ?? session.plannedWorkoutSnapshot.sections
    .flatMap(section => section.exercises)
    .find(exercise => exercise.id === exerciseId);
}

/**
 * Compares the first and last completed rep of each track exercise per session, grouped by
 * distance + exercise name, so a real fatigue/pacing pattern can be surfaced honestly instead
 * of guessed. Requires at least 3 comparable sessions; otherwise reports what is missing rather
 * than fabricating a pattern.
 */
export function buildTrainingInsight(sessions: CompletedWorkoutSession[]): TrainingInsight | null {
  const groups = new Map<string, { label: string; entries: SessionFade[] }>();

  const ordered = [...sessions].sort((first, second) => sessionDateKey(first).localeCompare(sessionDateKey(second)));
  for (const session of ordered) {
    for (const result of session.actualResults) {
      if (result.trackingKind !== 'track') continue;
      const exercise = plannedExercise(session, result.exerciseId);
      if (!exercise || exercise.tracking.kind !== 'track' || !exercise.tracking.distanceMeters) continue;
      const completedReps = (result.trackReps ?? [])
        .filter(rep => rep.status === 'completed' && typeof rep.timeSeconds === 'number' && rep.timeSeconds > 0)
        .sort((first, second) => first.repNumber - second.repNumber);
      if (completedReps.length < 2) continue;
      const first = completedReps[0].timeSeconds!;
      const last = completedReps[completedReps.length - 1].timeSeconds!;
      const key = `${exercise.tracking.distanceMeters}:${exercise.name}`;
      const label = `${exercise.tracking.distanceMeters}m ${exercise.name}`;
      const entry = { date: sessionDateKey(session), rpe: session.review.rpe, fadeSeconds: last - first };
      const group = groups.get(key);
      if (group) group.entries.push(entry);
      else groups.set(key, { label, entries: [entry] });
    }
  }

  const candidate = [...groups.values()]
    .filter(group => group.entries.length >= 3)
    .sort((first, second) => second.entries.length - first.entries.length)[0];

  if (!candidate) {
    return {
      observation: 'Not enough comparable sessions yet to spot a real pattern.',
      evidence: 'This needs at least 3 sessions with the same multi-rep sprint exercise, each with more than one completed timed rep.',
      confidence: 'Keep logging rep times during Workout Mode — this fills in automatically.',
    };
  }

  const recent = candidate.entries.slice(-3);
  const allFading = recent.every(entry => entry.fadeSeconds > 0);
  const averageFade = recent.reduce((sum, entry) => sum + entry.fadeSeconds, 0) / recent.length;
  const rpeValues = recent.map(entry => entry.rpe).filter((value): value is number => typeof value === 'number' && value > 0);
  const averageRpe = rpeValues.length ? rpeValues.reduce((sum, value) => sum + value, 0) / rpeValues.length : undefined;

  if (allFading && averageFade >= 0.1) {
    return {
      observation: `Your final rep has been slower than your first rep in each of your last 3 ${candidate.label} sessions.`,
      evidence: `Average fade of ${averageFade.toFixed(2)}s from first rep to last rep${averageRpe ? `, at an average session RPE of ${averageRpe.toFixed(1)}/10` : ''}.`,
      confidence: 'Based on your last 3 comparable sessions — a small sample, worth watching rather than acting on immediately.',
      action: 'If the same fade shows up next session too, consider ending one rep earlier or adding rest between reps.',
    };
  }

  return {
    observation: `Your ${candidate.label} reps have held up well across your last 3 sessions.`,
    evidence: `First-rep to last-rep times stayed within ${Math.max(...recent.map(entry => Math.abs(entry.fadeSeconds))).toFixed(2)}s of each other.`,
    confidence: 'Based on your last 3 comparable sessions.',
  };
}
