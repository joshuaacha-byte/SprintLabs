import type {
  ActiveWorkoutSession,
  ActualExerciseResult,
  EquipmentType,
  Exercise,
  ExerciseCategory,
  ExerciseResult,
  FootwearType,
  ModificationReason,
  OneToFive,
  OneToTen,
  PainArea,
  PlannedExercise,
  PlannedWorkout,
  PostWorkoutReview,
  ReadinessCheck,
  RepCompletionStatus,
  ResultChangeReason,
  SeasonPhase,
  SprintEvent,
  SprintRepRecord,
  StartingMethod,
  TrainingLog,
  TrainingSurface,
  WeatherConditions,
  WindConditions,
  Workout,
  WorkoutCategory,
  WorkoutCompletionStatus,
  WorkoutSection,
  WorkoutSectionCategory,
  ZeroToTen,
} from '@/types';

export const LOCAL_ATHLETE_ID = 'local-athlete';

const sectionCategory = (title: string): WorkoutSectionCategory => {
  const normalized = title.toLowerCase();
  if (normalized.includes('warm')) return 'warm-up';
  if (normalized.includes('track')) return 'track';
  if (normalized.includes('plyo')) return 'plyometrics';
  if (normalized.includes('strength') || normalized.includes('lift')) return 'strength';
  if (normalized.includes('condition')) return 'conditioning';
  if (normalized.includes('cool')) return 'cooldown';
  if (normalized.includes('recover')) return 'recovery';
  return 'other';
};

const exerciseCategory = (sectionTitle: string, exercise: PlannedExercise): ExerciseCategory => {
  const name = exercise.name.toLowerCase();
  const section = sectionCategory(sectionTitle);
  if (section === 'warm-up') return name.includes('mobil') ? 'mobility' : 'sprint-drill';
  if (section === 'plyometrics') return 'plyometric';
  if (section === 'strength') return 'strength';
  if (section === 'conditioning') return 'conditioning';
  if (section === 'recovery') return 'recovery';
  if (section === 'cooldown') return 'cooldown';
  if (name.includes('tempo')) return 'tempo';
  if (name.includes('fly') || name.includes('maximum')) return 'maximum-velocity';
  if (name.includes('endurance') || (exercise.tracking.kind === 'track' && (exercise.tracking.distanceMeters ?? 0) >= 80)) return 'speed-endurance';
  if (exercise.tracking.kind === 'track') return 'acceleration';
  return 'other';
};

const inferWorkoutCategory = (plan: PlannedWorkout): WorkoutCategory => {
  const text = `${plan.title} ${plan.purpose}`.toLowerCase();
  if (text.includes('max') || text.includes('velocity')) return 'maximum-velocity';
  if (text.includes('speed endurance')) return 'speed-endurance';
  if (text.includes('special endurance')) return 'special-endurance';
  if (text.includes('acceleration')) return 'acceleration';
  if (text.includes('tempo')) return 'tempo';
  if (text.includes('recover') || text.includes('mobility')) return 'recovery';
  if (text.includes('strength')) return 'strength';
  if (text.includes('meet') || text.includes('competition')) return 'competition';
  return 'mixed';
};

const equipmentForExercise = (exercise: PlannedExercise): EquipmentType[] => {
  const text = `${exercise.name} ${exercise.detail ?? ''}`.toLowerCase();
  const equipment: EquipmentType[] = [];
  if (text.includes('block')) equipment.push('starting-blocks');
  if (text.includes('hurdle')) equipment.push('mini-hurdles');
  if (text.includes('band')) equipment.push('resistance-band');
  if (text.includes('sled')) equipment.push('sled');
  if (text.includes('medicine ball')) equipment.push('medicine-ball');
  if (text.includes('dumbbell')) equipment.push('dumbbells');
  if (text.includes('barbell') || text.includes('squat') || text.includes('deadlift') || text.includes('clean')) equipment.push('barbell', 'plates');
  return [...new Set(equipment)];
};

const surfacesForSection = (sectionTitle: string): TrainingSurface[] => {
  const category = sectionCategory(sectionTitle);
  if (category === 'track') return ['track', 'indoor-track'];
  if (category === 'strength') return ['weight-room'];
  if (category === 'conditioning') return ['grass', 'turf', 'gym-floor'];
  return [];
};

const firstNumber = (value?: string) => {
  const number = Number(value?.match(/\d+/)?.[0]);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const oneToFive = (value?: number): OneToFive | null =>
  Number.isInteger(value) && (value ?? 0) >= 1 && (value ?? 0) <= 5 ? value as OneToFive : null;

const oneToTen = (value?: number): OneToTen | null =>
  Number.isInteger(value) && (value ?? 0) >= 1 && (value ?? 0) <= 10 ? value as OneToTen : null;

const zeroToTen = (value?: number): ZeroToTen | null =>
  Number.isInteger(value) && (value ?? -1) >= 0 && (value ?? -1) <= 10 ? value as ZeroToTen : null;

function plannedExerciseToDomain(sectionTitle: string, exercise: PlannedExercise): Exercise {
  const tracking = exercise.tracking;
  return {
    id: exercise.id,
    name: exercise.name,
    category: exerciseCategory(sectionTitle, exercise),
    description: exercise.detail ?? exercise.name,
    coachingCues: [],
    distanceMeters: tracking.kind === 'track' ? tracking.distanceMeters ?? null : null,
    durationSeconds: tracking.kind === 'completion' ? firstNumber(exercise.detail) : null,
    plannedSets: tracking.kind === 'strength' ? tracking.sets : tracking.kind === 'track' ? 1 : null,
    plannedReps: tracking.kind === 'track' ? tracking.reps : tracking.kind === 'strength' ? firstNumber(tracking.targetReps) : null,
    intensityPercent: tracking.kind === 'track' ? tracking.targetIntensity ?? null : null,
    restBetweenRepsSeconds: tracking.kind === 'track' ? tracking.restSeconds ?? null : null,
    restBetweenSetsSeconds: tracking.kind === 'strength' ? tracking.restSeconds ?? null : null,
    equipment: equipmentForExercise(exercise),
    surface: surfacesForSection(sectionTitle),
    optional: false,
    progressionId: null,
    regressionId: null,
  };
}

export function plannedWorkoutToDomainWorkout(plan: PlannedWorkout): Workout {
  const sections: WorkoutSection[] = plan.sections.map((section, index) => ({
    id: `${plan.id}:section:${index + 1}`,
    title: section.title,
    category: sectionCategory(section.title),
    order: index + 1,
    exercises: section.exercises.map(exercise => plannedExerciseToDomain(section.title, exercise)),
  }));
  const trackExercises = sections.flatMap(section => section.exercises).filter(exercise => exercise.distanceMeters);
  const totalSprintVolumeMeters = trackExercises.reduce((sum, exercise) =>
    sum + (exercise.distanceMeters ?? 0) * (exercise.plannedReps ?? 0), 0);
  const highIntensityVolumeMeters = trackExercises.reduce((sum, exercise) =>
    (exercise.intensityPercent ?? 0) >= 80
      ? sum + (exercise.distanceMeters ?? 0) * (exercise.plannedReps ?? 0)
      : sum, 0);
  const requiredEquipment = [...new Set(sections.flatMap(section => section.exercises.flatMap(exercise => exercise.equipment)))];
  const allowedSurfaces = [...new Set(sections.flatMap(section => section.exercises.flatMap(exercise => exercise.surface)))];
  const eventPathways: SprintEvent[] = ['100m', '200m', '400m'];
  const seasonPhases: SeasonPhase[] = ['general-preparation', 'specific-preparation', 'pre-competition', 'competition'];
  return {
    id: plan.id,
    name: plan.title,
    description: plan.purpose,
    purpose: plan.purpose,
    trainingCategory: inferWorkoutCategory(plan),
    eventPathways,
    athleteLevels: ['developing', 'intermediate', 'advanced'],
    seasonPhases,
    estimatedDurationMinutes: plan.durationMinutes,
    requiredEquipment,
    allowedSurfaces,
    totalSprintVolumeMeters,
    highIntensityVolumeMeters,
    sections,
    safetyNotes: [],
    sourceNotes: ['Converted from the editable SprintLab prototype workout snapshot.'],
    version: 1,
    approvalStatus: 'draft',
  };
}

const painAreaForLegacyLocation = (location?: string): PainArea => {
  switch (location) {
    case 'hamstring': return 'hamstring';
    case 'achilles-calf': return 'achilles';
    case 'shin': return 'shin';
    case 'groin-hip-flexor': return 'hip-flexor';
    case 'foot-ankle': return 'ankle';
    default: return 'other';
  }
};

function readinessToDomain(session: ActiveWorkoutSession, review: PostWorkoutReview): ReadinessCheck {
  const readiness = session.readinessSnapshot;
  const contextPain = session.trainingContext?.painAreas;
  const painAreas: ReadinessCheck['painAreas'] = contextPain?.length ? contextPain : readiness?.hasLocalizedIssue ? [{
    area: painAreaForLegacyLocation(readiness.location),
    severity: readiness.painSeverity ?? null,
    classification: readiness.sensation ?? 'not-recorded',
    side: 'not-recorded' as const,
    description: [readiness.otherLocationDetail, readiness.sensation, readiness.painNotes].filter(Boolean).join(' · '),
  }] : [];
  return {
    date: session.scheduledDate ?? readiness?.date ?? session.startedAt.slice(0, 10),
    sleepHours: readiness?.sleep ?? (review.sleep > 0 ? review.sleep : null),
    sleepQuality: oneToFive(readiness?.sleepQuality),
    energy: oneToTen(readiness?.neuralReadiness),
    focus: oneToFive(readiness?.focus),
    motivation: null,
    stress: null,
    fuelHydrated: readiness?.fuelHydrated ?? null,
    generalSoreness: zeroToTen(readiness?.soreness ?? review.soreness),
    hamstringSoreness: zeroToTen(review.hamstring),
    achillesSoreness: null,
    painAreas,
    warmupFeeling: 'not-recorded',
    notes: readiness?.painNotes ?? '',
  };
}

const resultChangeReason = (reason?: ResultChangeReason): ModificationReason | null => reason ?? null;

const repStatus = (status: 'pending' | 'completed' | 'skipped', feeling?: string): RepCompletionStatus => {
  if (feeling === 'stopped') return 'stopped';
  if (status === 'completed') return 'completed';
  if (status === 'skipped') return 'skipped';
  return 'not-recorded';
};

const windToDomain = (
  session: ActiveWorkoutSession,
  override?: { type: string; measuredWind?: number },
  legacyWind?: number,
): WindConditions => {
  const conditions = override ?? (legacyWind !== undefined ? { type: 'measured', measuredWind: legacyWind } : session.trackConditions);
  return {
    type: (conditions?.type ?? 'unknown') as WindConditions['type'],
    measuredMetersPerSecond: conditions?.measuredWind ?? null,
  };
};

function exerciseResultToDomain(
  session: ActiveWorkoutSession,
  result: ActualExerciseResult,
): ExerciseResult {
  const exercise = result.exerciseSnapshot ?? session.plannedWorkoutSnapshot.sections
    .flatMap(section => section.exercises)
    .find(item => item.id === result.exerciseId);
  const tracking = exercise?.tracking;
  const context = session.trainingContext;
  const surface: TrainingSurface = context?.surface ?? 'unknown';
  const startingMethod: StartingMethod = context?.startingMethod ?? 'unknown';
  const footwear: FootwearType = context?.footwear ?? 'unknown';
  const repTimes: SprintRepRecord[] = (result.trackReps ?? []).map(rep => ({
    repNumber: rep.repNumber,
    status: repStatus(rep.status, rep.feeling),
    timeSeconds: rep.timeSeconds ?? null,
    distanceMeters: rep.plannedDistanceMeters
      ?? (tracking?.kind === 'track' ? tracking.distanceMeters : undefined)
      ?? null,
    intensityTargetPercent: rep.intensityTargetPercent
      ?? (tracking?.kind === 'track' ? tracking.targetIntensity : undefined)
      ?? null,
    restBeforeRepSeconds: rep.plannedRestSeconds
      ?? (tracking?.kind === 'track' ? tracking.restSeconds : undefined)
      ?? null,
    surface,
    startingMethod,
    footwear,
    wind: windToDomain(session, rep.windOverride, rep.wind),
    testName: rep.testName,
    distanceUnit: rep.distanceUnit ?? 'meters',
    timingMethod: rep.timingMethod ?? 'unknown',
    startType: rep.startType ?? (startingMethod === 'blocks' ? 'blocks' : startingMethod === 'three-point' ? 'three-point' : startingMethod === 'standing' ? 'standing' : 'unknown'),
    directionPattern: rep.directionPattern ?? 'linear',
    notes: rep.notes,
  }));
  const completedTrackReps = repTimes.filter(rep => rep.status === 'completed');
  const completedStrengthSets = (result.strengthSets ?? []).filter(set => set.status === 'completed');
  const actualReps = result.trackingKind === 'track'
    ? completedTrackReps.length
    : completedStrengthSets.reduce((sum, set) => sum + (set.reps ?? 0), 0);
  return {
    exerciseId: result.exerciseId,
    completed: result.status === 'completed',
    actualSets: result.trackingKind === 'strength' ? completedStrengthSets.length : result.trackingKind === 'track' ? 1 : null,
    actualReps: result.trackingKind === 'completion' ? null : actualReps,
    repTimes,
    actualWeight: completedStrengthSets.map(set => set.load ?? 0).sort((first, second) => second - first)[0] || null,
    actualDistance: completedTrackReps.reduce((sum, rep) => sum + (rep.distanceMeters ?? 0), 0) || null,
    modificationReason: resultChangeReason(result.changeReason),
    notes: [result.changeReasonNote, result.notes].filter(Boolean).join(' · '),
  };
}

function completionStatus(session: ActiveWorkoutSession, review: PostWorkoutReview): WorkoutCompletionStatus {
  const hasModifications = session.actualResults.some(result =>
    result.changeReason
    || result.origin === 'added'
    || result.status === 'skipped'
  );
  if (review.completed) return hasModifications ? 'completed-with-modifications' : 'completed-as-planned';
  const hasCompletedWork = session.actualResults.some(result =>
    result.status === 'completed'
    || result.trackReps?.some(rep => rep.status === 'completed')
    || result.strengthSets?.some(set => set.status === 'completed')
  );
  return hasCompletedWork ? 'partial' : 'stopped';
}

export function buildStructuredTrainingLog(
  session: ActiveWorkoutSession,
  review: PostWorkoutReview,
  finishedAt: string,
  athleteId = LOCAL_ATHLETE_ID,
): TrainingLog {
  const plannedWorkout = plannedWorkoutToDomainWorkout(session.plannedWorkoutSnapshot);
  const context = session.trainingContext;
  const date = session.scheduledDate ?? session.startedAt.slice(0, 10);
  const weather: WeatherConditions = context?.weather ?? {
    type: 'unknown',
    temperatureCelsius: null,
    humidityPercent: null,
    notes: '',
  };
  return {
    id: `domain-log:${session.id}`,
    athleteId,
    scheduledWorkoutId: session.scheduledDate
      ? `scheduled:${athleteId}:${session.scheduledDate}:${session.plannedWorkoutSnapshot.id}`
      : null,
    workoutId: session.plannedWorkoutSnapshot.id,
    plannedWorkout,
    date,
    startedAt: session.startedAt,
    completedAt: finishedAt,
    completionStatus: completionStatus(session, review),
    sessionRpe: oneToTen(review.rpe),
    readiness: readinessToDomain(session, review),
    exerciseResults: session.actualResults.map(result => exerciseResultToDomain(session, result)),
    surface: context?.surface ?? 'unknown',
    weather,
    wind: windToDomain(session),
    footwear: context?.footwear ?? 'unknown',
    bodyWeight: review.bodyWeight ?? null,
    generalNotes: review.notes,
    createdAt: finishedAt,
    updatedAt: finishedAt,
  };
}

export function buildManualTrainingLog(
  review: PostWorkoutReview,
  finishedAt: string,
  athleteId = LOCAL_ATHLETE_ID,
  historyLogId?: string,
): TrainingLog {
  const id = historyLogId ?? `manual-log:${finishedAt}`;
  return {
    id,
    athleteId,
    scheduledWorkoutId: null,
    workoutId: 'manual-session',
    plannedWorkout: {
      id: 'manual-session',
      name: 'Unplanned session',
      description: 'A session entered manually after training.',
      purpose: 'Record training completed outside a scheduled workout.',
      trainingCategory: 'mixed',
      eventPathways: [],
      athleteLevels: [],
      seasonPhases: [],
      estimatedDurationMinutes: 0,
      requiredEquipment: [],
      allowedSurfaces: [],
      totalSprintVolumeMeters: 0,
      highIntensityVolumeMeters: 0,
      sections: [],
      safetyNotes: [],
      sourceNotes: ['Manual entry'],
      version: 1,
      approvalStatus: 'draft',
    },
    date: finishedAt.slice(0, 10),
    startedAt: finishedAt,
    completedAt: finishedAt,
    completionStatus: review.completed ? 'completed-as-planned' : 'partial',
    sessionRpe: oneToTen(review.rpe),
    readiness: {
      date: finishedAt.slice(0, 10),
      sleepHours: review.sleep > 0 ? review.sleep : null,
      sleepQuality: null,
      energy: null,
      focus: null,
      motivation: null,
      stress: null,
      fuelHydrated: null,
      generalSoreness: zeroToTen(review.soreness),
      hamstringSoreness: zeroToTen(review.hamstring),
      achillesSoreness: null,
      painAreas: [],
      warmupFeeling: 'not-recorded',
      notes: '',
    },
    exerciseResults: [],
    surface: 'unknown',
    weather: { type: 'unknown', temperatureCelsius: null, humidityPercent: null, notes: '' },
    wind: { type: 'unknown', measuredMetersPerSecond: null },
    footwear: 'unknown',
    bodyWeight: review.bodyWeight ?? null,
    generalNotes: review.notes,
    createdAt: finishedAt,
    updatedAt: finishedAt,
  };
}
