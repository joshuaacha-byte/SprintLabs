import {
  ActiveWorkoutSession,
  ActualExerciseResult,
  ExerciseTracking,
  PainArea,
  PlannedExercise,
  PlannedWorkout,
  ReadinessDecision,
  ResultStatus,
  SessionTrainingContext,
  WeekdayIndex,
} from '@/types';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const firstNumber = (value?: string) => Number(value?.match(/\d+/)?.[0] ?? 0);

export function inferTracking(sectionTitle: string, detail?: string): ExerciseTracking {
  if (sectionTitle === 'Track') {
    const distance = Number(detail?.match(/(\d+)\s*m/i)?.[1] ?? 0) || undefined;
    const restMinutes = Number(detail?.match(/(\d+)\s*min/i)?.[1] ?? 0) || undefined;
    const intensity = Number(detail?.match(/(\d+)\s*%/)?.[1] ?? 0) || undefined;
    return {
      kind: 'track',
      reps: Math.max(1, firstNumber(detail) || 1),
      distanceMeters: distance,
      targetIntensity: intensity,
      restSeconds: restMinutes ? restMinutes * 60 : undefined,
    };
  }

  if (sectionTitle === 'Strength') {
    const match = detail?.match(/(\d+)\s*[×x]\s*([^·]+)/i);
    return {
      kind: 'strength',
      sets: Math.max(1, Number(match?.[1] ?? 1)),
      targetReps: match?.[2]?.trim() || '—',
    };
  }

  return { kind: 'completion' };
}

function normalizeExercise(sectionTitle: string, raw: Partial<PlannedExercise> & { id: string; name: string }): PlannedExercise {
  return {
    id: raw.id,
    name: raw.name,
    detail: raw.detail,
    tracking: raw.tracking ?? inferTracking(sectionTitle, raw.detail),
  };
}

function normalizeDuration(raw: Record<string, unknown>): number {
  if (typeof raw.durationMinutes === 'number') return raw.durationMinutes;
  const values = String(raw.duration ?? '').match(/\d+/g)?.map(Number) ?? [];
  if (!values.length) return 60;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function normalizePlannedWorkout(raw: unknown, fallback: PlannedWorkout): PlannedWorkout {
  if (!raw || typeof raw !== 'object') return clone(fallback);
  const candidate = raw as Record<string, any>;
  if (!Array.isArray(candidate.sections)) return clone(fallback);
  return {
    id: String(candidate.id ?? fallback.id),
    title: String(candidate.title ?? fallback.title),
    purpose: String(candidate.purpose ?? fallback.purpose),
    durationMinutes: normalizeDuration(candidate),
    sections: candidate.sections.map((section: any) => ({
      title: String(section.title),
      exercises: Array.isArray(section.exercises)
        ? section.exercises.map((exercise: any) => normalizeExercise(String(section.title), exercise))
        : [],
    })),
  };
}

export function createExerciseResult(
  sectionTitle: string,
  exercise: PlannedExercise,
  origin: 'planned' | 'added' = 'planned',
): ActualExerciseResult {
  const shared = {
    exerciseId: exercise.id,
    sectionTitle,
    origin,
    exerciseSnapshot: clone(exercise),
    status: 'pending' as ResultStatus,
    notes: '',
  };

  if (exercise.tracking.kind === 'track') {
    const tracking = exercise.tracking;
    return {
      ...shared,
      trackingKind: 'track',
      trackReps: Array.from({ length: tracking.reps }, (_, index) => ({
        repNumber: index + 1,
        status: 'pending' as ResultStatus,
        plannedDistanceMeters: tracking.distanceMeters,
        intensityTargetPercent: tracking.targetIntensity,
        plannedRestSeconds: tracking.restSeconds,
      })),
    };
  }

  if (exercise.tracking.kind === 'strength') {
    return {
      ...shared,
      trackingKind: 'strength',
      strengthSets: Array.from({ length: exercise.tracking.sets }, (_, index) => ({
        setNumber: index + 1,
        status: 'pending' as ResultStatus,
      })),
    };
  }

  return {
    ...shared,
    trackingKind: 'completion',
  };
}

function readinessLocationToPainArea(readiness: ReadinessDecision): PainArea {
  switch (readiness.location) {
    case 'hamstring': return 'hamstring';
    case 'achilles-calf': return 'achilles';
    case 'shin': return 'shin';
    case 'groin-hip-flexor': return 'hip-flexor';
    case 'foot-ankle': return 'ankle';
    default: return 'other';
  }
}

function createTrainingContext(readiness: ReadinessDecision): SessionTrainingContext {
  const severity = typeof readiness.painSeverity === 'number'
    && readiness.painSeverity >= 0
    && readiness.painSeverity <= 10
    ? readiness.painSeverity as SessionTrainingContext['painAreas'][number]['severity']
    : null;
  const description = [
    readiness.otherLocationDetail,
    readiness.sensation,
    readiness.painNotes,
  ].filter(Boolean).join(' · ');
  return {
    surface: 'unknown',
    startingMethod: 'unknown',
    footwear: 'unknown',
    weather: {
      type: 'unknown',
      temperatureCelsius: null,
      humidityPercent: null,
      notes: '',
    },
    painAreas: readiness.hasLocalizedIssue ? [{
      area: readinessLocationToPainArea(readiness),
      severity,
      classification: readiness.sensation ?? 'not-recorded',
      side: 'not-recorded',
      description,
    }] : [],
  };
}

export function createActiveSession(
  plan: PlannedWorkout,
  readiness: ReadinessDecision,
  scheduleContext?: { scheduledDate: string; scheduledDayIndex: WeekdayIndex },
): ActiveWorkoutSession {
  const snapshot = clone(plan);
  return {
    id: `session-${Date.now()}`,
    plannedWorkoutSnapshot: snapshot,
    scheduledDate: scheduleContext?.scheduledDate,
    scheduledDayIndex: scheduleContext?.scheduledDayIndex,
    readinessStatus: readiness.status,
    readinessSnapshot: clone(readiness),
    startedAt: new Date().toISOString(),
    elapsedSeconds: 0,
    trainingContext: createTrainingContext(readiness),
    actualResults: snapshot.sections.flatMap(section =>
      section.exercises.map(exercise => createExerciseResult(section.title, exercise)),
    ),
  };
}

export function deriveExerciseStatus(result: ActualExerciseResult): ResultStatus {
  const units = result.trackReps ?? result.strengthSets;
  if (!units) return result.status;
  const completed = units.filter(unit => unit.status === 'completed').length;
  const skipped = units.filter(unit => unit.status === 'skipped').length;
  if (completed === units.length) return 'completed';
  if (skipped === units.length) return 'skipped';
  return 'pending';
}

export function withDerivedStatuses(session: ActiveWorkoutSession): ActiveWorkoutSession {
  return {
    ...session,
    actualResults: session.actualResults.map(result => ({
      ...result,
      status: deriveExerciseStatus(result),
    })),
  };
}

export function getSessionCoverage(session: ActiveWorkoutSession) {
  const planned = session.actualResults.length;
  const completed = session.actualResults.filter(result => deriveExerciseStatus(result) === 'completed').length;
  const partial = session.actualResults.filter(result => {
    const units = result.trackReps ?? result.strengthSets;
    return units?.some(unit => unit.status === 'completed') && deriveExerciseStatus(result) === 'pending';
  }).length;
  return { planned, completed, partial };
}

export function findPlannedExercise(session: ActiveWorkoutSession, exerciseId: string) {
  const result = session.actualResults.find(item => item.exerciseId === exerciseId);
  return result?.exerciseSnapshot ?? session.plannedWorkoutSnapshot.sections
    .flatMap(section => section.exercises)
    .find(exercise => exercise.id === exerciseId);
}
