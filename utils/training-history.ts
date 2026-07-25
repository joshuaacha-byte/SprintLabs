import type {
  Exercise,
  ExerciseResult,
  PlannedExercise,
  PlannedWorkout,
  SprintEvent,
  TrainingLog,
  WorkoutCategory,
  WorkoutCompletionStatus,
} from '@/types';

export type HistoryFilters = {
  dateFrom: string;
  dateTo: string;
  category: WorkoutCategory | 'all';
  completionStatus: WorkoutCompletionStatus | 'all';
  pathway: SprintEvent | 'all';
  query: string;
};

export const defaultHistoryFilters: HistoryFilters = {
  dateFrom: '',
  dateTo: '',
  category: 'all',
  completionStatus: 'all',
  pathway: 'all',
  query: '',
};

export const workoutCategoryLabels: Record<WorkoutCategory, string> = {
  acceleration: 'Acceleration',
  'maximum-velocity': 'Maximum velocity',
  'speed-endurance': 'Speed endurance',
  'special-endurance': 'Special endurance',
  tempo: 'Tempo',
  plyometrics: 'Plyometrics',
  strength: 'Strength',
  recovery: 'Recovery',
  competition: 'Competition',
  testing: 'Testing',
  mixed: 'Mixed',
};

export const completionStatusLabels: Record<WorkoutCompletionStatus, string> = {
  'completed-as-planned': 'Completed as planned',
  'completed-with-modifications': 'Completed with changes',
  partial: 'Partial',
  stopped: 'Stopped',
  skipped: 'Skipped',
};

export function historyDate(log: TrainingLog) {
  return log.completedAt ?? log.date ?? log.createdAt;
}

export function filterTrainingLogs(logs: TrainingLog[], filters: HistoryFilters) {
  const query = filters.query.trim().toLowerCase();
  return logs
    .filter(log => !filters.dateFrom || log.date >= filters.dateFrom)
    .filter(log => !filters.dateTo || log.date <= filters.dateTo)
    .filter(log => filters.category === 'all' || log.plannedWorkout.trainingCategory === filters.category)
    .filter(log => filters.completionStatus === 'all' || log.completionStatus === filters.completionStatus)
    .filter(log => filters.pathway === 'all' || log.plannedWorkout.eventPathways.includes(filters.pathway))
    .filter(log => !query || [log.plannedWorkout.name, log.generalNotes, log.readiness.notes]
      .filter(Boolean)
      .some(value => value.toLowerCase().includes(query)))
    .sort((first, second) => historyDate(second).localeCompare(historyDate(first)));
}

export function keySprintResult(log: TrainingLog) {
  const reps = log.exerciseResults.flatMap(result => result.repTimes)
    .filter(rep => rep.status === 'completed' && typeof rep.timeSeconds === 'number');
  if (!reps.length) return null;
  const best = [...reps].sort((first, second) => (first.timeSeconds ?? Infinity) - (second.timeSeconds ?? Infinity))[0];
  return `${best.timeSeconds!.toFixed(2)}s${best.distanceMeters ? ` · ${best.distanceMeters}m` : ''}`;
}

export function sorenessIndicator(log: TrainingLog) {
  const values = [
    log.readiness.generalSoreness,
    log.readiness.hamstringSoreness,
    log.readiness.achillesSoreness,
    ...log.readiness.painAreas.map(pain => pain.severity),
  ].filter((value): value is Exclude<typeof value, null> => typeof value === 'number');
  const value = values.length ? Math.max(...values) : null;
  if (value === null) return { label: 'Not recorded', level: 'unknown' as const };
  if (value >= 7) return { label: `${value}/10 high`, level: 'high' as const };
  if (value >= 4) return { label: `${value}/10 moderate`, level: 'moderate' as const };
  return { label: `${value}/10 low`, level: 'low' as const };
}

export function exerciseResultFor(log: TrainingLog, exerciseId: string): ExerciseResult | undefined {
  return log.exerciseResults.find(result => result.exerciseId === exerciseId);
}

function exerciseDetail(exercise: Exercise) {
  if (exercise.distanceMeters) {
    const count = exercise.plannedReps ?? exercise.plannedSets;
    return `${count ? `${count} × ` : ''}${exercise.distanceMeters}m${exercise.intensityPercent ? ` at ${exercise.intensityPercent}%` : ''}`;
  }
  if (exercise.plannedSets || exercise.plannedReps) return `${exercise.plannedSets ?? ''}${exercise.plannedSets && exercise.plannedReps ? ' × ' : ''}${exercise.plannedReps ?? ''}`;
  return exercise.description;
}

export function workoutToPlannedSnapshot(log: TrainingLog): PlannedWorkout {
  return {
    id: `duplicate:${log.workoutId}:${Date.now()}`,
    title: `${log.plannedWorkout.name} (copy)`,
    purpose: log.plannedWorkout.purpose,
    durationMinutes: log.plannedWorkout.estimatedDurationMinutes,
    sections: log.plannedWorkout.sections.map(section => ({
      title: section.title,
      exercises: section.exercises.map((exercise): PlannedExercise => ({
        id: `copy:${exercise.id}:${Date.now()}`,
        name: exercise.name,
        detail: exerciseDetail(exercise),
        tracking: exercise.category === 'strength'
          ? { kind: 'strength', sets: exercise.plannedSets ?? 1, targetReps: String(exercise.plannedReps ?? '—'), restSeconds: exercise.restBetweenSetsSeconds ?? undefined }
          : exercise.distanceMeters
            ? { kind: 'track', reps: exercise.plannedReps ?? exercise.plannedSets ?? 1, distanceMeters: exercise.distanceMeters, targetIntensity: exercise.intensityPercent ?? undefined, restSeconds: exercise.restBetweenRepsSeconds ?? undefined }
            : { kind: 'completion' },
      })),
    })),
  };
}

export function readableDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
