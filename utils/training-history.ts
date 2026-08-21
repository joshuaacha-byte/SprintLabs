import type {
  Exercise,
  ExerciseResult,
  LoggedSessionCategory,
  PlannedExercise,
  PlannedWorkout,
  SprintEvent,
  TrainingLog,
  WorkoutCategory,
  WorkoutCompletionStatus,
} from '@/types';

export const loggedSessionCategoryLabels: Record<LoggedSessionCategory, string> = {
  acceleration: 'Acceleration',
  'maximum-velocity': 'Max velocity',
  'speed-endurance': 'Speed endurance',
  'tempo-recovery': 'Tempo / recovery',
  'starts-technique': 'Starts / technique',
  strength: 'Strength',
  plyometrics: 'Plyometrics',
  competition: 'Competition',
  mixed: 'Mixed',
  other: 'Other',
};

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
  partial: 'Ended early',
  stopped: 'Abandoned',
  skipped: 'Skipped',
};

/** completionStatusLabels plus, for a partial/abandoned session, exactly how much of the planned
 * workout was actually done (e.g. "Ended early · 5 of 8 items completed") — so History never
 * shows a bare status word without the real coverage that explains it. */
export function completionStatusDisplay(log: TrainingLog): string {
  const label = completionStatusLabels[log.completionStatus];
  if (log.completionStatus !== 'partial' && log.completionStatus !== 'stopped') return label;
  const total = log.exerciseResults.length;
  if (!total) return label;
  const done = log.exerciseResults.filter(result => result.completed).length;
  return `${label} · ${done} of ${total} items completed`;
}

export function historyDate(log: TrainingLog) {
  return log.completedAt ?? log.date ?? log.createdAt;
}

/** One search haystack per log: name, category, every activity's name/setsOrReps/distance/result/
 * notes, the "what did you do" description, planned/actual exercise names and notes, and general/
 * readiness notes — covers "search by workout name, activity, and notes" against both manually
 * logged and in-app-completed sessions. */
function searchHaystack(log: TrainingLog): string {
  const parts = [
    log.plannedWorkout.name,
    loggedSessionCategoryLabels[log.manualDetails?.category as LoggedSessionCategory] ?? log.plannedWorkout.trainingCategory,
    log.manualDetails?.description,
    log.generalNotes,
    log.readiness.notes,
    ...(log.manualDetails?.activities.flatMap(activity => [activity.name, activity.setsOrReps, activity.distance, activity.result, activity.notes]) ?? []),
    ...log.plannedWorkout.sections.flatMap(section => section.exercises.map(exercise => exercise.name)),
    ...log.exerciseResults.map(result => result.notes),
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

export function filterTrainingLogs(logs: TrainingLog[], filters: HistoryFilters) {
  const query = filters.query.trim().toLowerCase();
  return logs
    .filter(log => !filters.dateFrom || log.date >= filters.dateFrom)
    .filter(log => !filters.dateTo || log.date <= filters.dateTo)
    .filter(log => filters.category === 'all' || log.plannedWorkout.trainingCategory === filters.category)
    .filter(log => filters.completionStatus === 'all' || log.completionStatus === filters.completionStatus)
    .filter(log => filters.pathway === 'all' || log.plannedWorkout.eventPathways.includes(filters.pathway))
    .filter(log => !query || searchHaystack(log).includes(query))
    .sort((first, second) => historyDate(second).localeCompare(historyDate(first)));
}

/** The single most useful recorded result for this session, or null when there genuinely isn't
 * one — callers must omit the metric entirely rather than show a placeholder. Tries, in order: a
 * timed sprint rep, a top strength load, then the first manually logged activity with a result. */
export function keySprintResult(log: TrainingLog): string | null {
  const reps = log.exerciseResults.flatMap(result => result.repTimes)
    .filter(rep => rep.status === 'completed' && typeof rep.timeSeconds === 'number');
  if (reps.length) {
    const best = [...reps].sort((first, second) => (first.timeSeconds ?? Infinity) - (second.timeSeconds ?? Infinity))[0];
    return `${best.timeSeconds!.toFixed(2)}s${best.distanceMeters ? ` · ${best.distanceMeters}m` : ''}`;
  }
  const topLoad = log.exerciseResults.map(result => result.actualWeight).filter((value): value is number => typeof value === 'number' && value > 0).sort((a, b) => b - a)[0];
  if (topLoad) return `${topLoad} top load`;
  const activityResult = log.manualDetails?.activities.find(activity => activity.result?.trim());
  if (activityResult) return `${activityResult.result} · ${activityResult.name}`;
  return null;
}

/** A short, real description of what the session was — the "short summary" a Logbook card and
 * detail view should show instead of just a category chip. */
export function sessionSummary(log: TrainingLog): string | null {
  if (log.manualDetails?.description) return log.manualDetails.description;
  if (log.plannedWorkout.description && log.plannedWorkout.description !== log.plannedWorkout.name) return log.plannedWorkout.description;
  const exerciseCount = log.plannedWorkout.sections.reduce((sum, section) => sum + section.exercises.length, 0);
  if (exerciseCount) return `${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'} across ${log.plannedWorkout.sections.length} section${log.plannedWorkout.sections.length === 1 ? '' : 's'}`;
  return null;
}

/** True once this log has any real recorded workout detail — planned exercises, manually logged
 * activities, or at minimum a manual description. False only for a bare/legacy record that should
 * show "Workout details not recorded" instead of an empty section. */
export function hasRecordedWorkoutDetails(log: TrainingLog): boolean {
  return Boolean(
    log.plannedWorkout.sections.some(section => section.exercises.length)
    || log.manualDetails?.description
    || log.manualDetails?.activities.length,
  );
}

export function sorenessIndicator(log: TrainingLog) {
  const values = [
    log.readiness.generalSoreness,
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
    category: log.plannedWorkout.trainingCategory,
    eventTags: [...log.plannedWorkout.eventPathways],
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
