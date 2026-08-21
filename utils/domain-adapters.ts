import type {
  ActiveWorkoutSession,
  ActualExerciseResult,
  EquipmentType,
  Exercise,
  ExerciseCategory,
  ExerciseResult,
  FootwearType,
  LoggedActivity,
  LoggedSessionCategory,
  ManualWorkoutDetails,
  ModificationReason,
  OneToFive,
  OneToTen,
  PainArea,
  PainReport,
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

/** The 10 session types offered on Log Session's manual "Workout details" form, mapped onto the
 * existing (library-wide) WorkoutCategory enum so filtering/labels elsewhere keep working
 * unchanged. Lossy only where WorkoutCategory has no matching concept (starts/technique work is
 * filed under acceleration; "Other" under mixed) — the athlete's exact chosen category is still
 * preserved verbatim on `TrainingLog.manualDetails.category` for accurate re-display.
 */
export const sessionCategoryToWorkoutCategory: Record<LoggedSessionCategory, WorkoutCategory> = {
  acceleration: 'acceleration',
  'maximum-velocity': 'maximum-velocity',
  'speed-endurance': 'speed-endurance',
  'tempo-recovery': 'tempo',
  'starts-technique': 'acceleration',
  strength: 'strength',
  plyometrics: 'plyometrics',
  competition: 'competition',
  mixed: 'mixed',
  other: 'mixed',
};

/** The inverse, for prefilling the manual "session type" chip from a scheduled workout's own
 * category when the athlete links a manual entry to it. */
export const workoutCategoryToSessionCategory: Record<WorkoutCategory, LoggedSessionCategory> = {
  acceleration: 'acceleration',
  'maximum-velocity': 'maximum-velocity',
  'speed-endurance': 'speed-endurance',
  'special-endurance': 'speed-endurance',
  tempo: 'tempo-recovery',
  plyometrics: 'plyometrics',
  strength: 'strength',
  recovery: 'tempo-recovery',
  competition: 'competition',
  testing: 'other',
  mixed: 'mixed',
};

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
  const eventPathways: SprintEvent[] = plan.eventTags?.length
    ? [...plan.eventTags]
    : ['100m', '200m', '400m'];
  const seasonPhases: SeasonPhase[] = ['general-preparation', 'specific-preparation', 'pre-competition', 'competition'];
  return {
    id: plan.id,
    name: plan.title,
    description: plan.purpose,
    purpose: plan.purpose,
    trainingCategory: plan.category ?? inferWorkoutCategory(plan),
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

/** A post-session "anything bothering you?" report, kept distinct from readiness's pre-session
 * pain report by its description prefix — both live in the same painAreas array (the existing
 * PainReport shape already fits this without a new field) rather than a second, parallel list. */
function postSessionPainReport(review: PostWorkoutReview): PainReport | null {
  if (!review.painArea) return null;
  return {
    area: review.painArea,
    severity: null,
    classification: 'not-recorded',
    side: 'not-recorded',
    description: ['Reported after this session.', review.monitorPain ? 'Athlete asked to monitor this.' : null].filter(Boolean).join(' '),
  };
}

function readinessToDomain(session: ActiveWorkoutSession, review: PostWorkoutReview): ReadinessCheck {
  const readiness = session.readinessSnapshot;
  const contextPain = session.trainingContext?.painAreas;
  const preSessionPainAreas: ReadinessCheck['painAreas'] = contextPain?.length ? contextPain : readiness?.hasLocalizedIssue ? [{
    area: painAreaForLegacyLocation(readiness.location),
    severity: null,
    classification: readiness.sensation ?? 'not-recorded',
    side: 'not-recorded' as const,
    description: [readiness.otherLocationDetail, readiness.sensation, readiness.painNotes].filter(Boolean).join(' · '),
  }] : [];
  const postSession = postSessionPainReport(review);
  const painAreas = postSession ? [...preSessionPainAreas, postSession] : preSessionPainAreas;
  return {
    date: session.scheduledDate ?? readiness?.date ?? session.startedAt.slice(0, 10),
    sleepHours: readiness?.sleep ?? (review.sleep > 0 ? review.sleep : null),
    sleepQuality: oneToFive(readiness?.sleepQuality),
    energy: oneToTen(readiness?.neuralReadiness),
    focus: oneToFive(readiness?.focus),
    motivation: null,
    stress: null,
    fuelHydrated: readiness?.hydrated !== undefined || readiness?.foodStatus !== undefined
      ? readiness?.hydrated === true && readiness?.foodStatus !== 'underfueled'
      : readiness?.fuelHydrated ?? null,
    generalSoreness: zeroToTen(readiness?.soreness ?? review.soreness),
    // Derived from painAreas, never a hardcoded question — only set when the athlete actually
    // reported that specific area today. See ReadinessCheck's doc comment.
    hamstringSoreness: painAreas.find(pain => pain.area === 'hamstring')?.severity ?? null,
    achillesSoreness: painAreas.find(pain => pain.area === 'achilles')?.severity ?? null,
    painAreas,
    warmupFeeling: readiness?.warmupReassessment === 'better'
      ? 'better'
      : readiness?.warmupReassessment === 'same'
        ? 'same'
        : readiness?.warmupReassessment === 'worse'
          ? 'worse'
          : 'not-recorded',
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
    // Body weight isn't asked in the post-workout review — TrainingLog.bodyWeight is edited
    // directly on the History detail screen (app/history-detail.tsx) after the fact.
    bodyWeight: null,
    generalNotes: review.notes,
    createdAt: finishedAt,
    updatedAt: finishedAt,
  };
}

export type ManualSessionInput = {
  date: string; // ISO date the workout happened, athlete-editable, defaults to today in the UI
  name: string;
  category: LoggedSessionCategory;
  description: string;
  durationMinutes?: number;
  activities: LoggedActivity[];
  /** Set only when the athlete deliberately linked this entry to a real scheduled day (see
   * app/log.tsx's "Use today's plan" flow) — never inferred, so an unplanned session can never be
   * silently treated as matching a plan it wasn't actually linked to. */
  linkedScheduledDate?: string;
};

export function buildManualTrainingLog(
  input: ManualSessionInput,
  review: PostWorkoutReview,
  finishedAt: string,
  athleteId = LOCAL_ATHLETE_ID,
  historyLogId?: string,
): TrainingLog {
  const id = historyLogId ?? `manual-log:${finishedAt}`;
  const manualDetails: ManualWorkoutDetails = {
    category: input.category,
    description: input.description,
    durationMinutes: input.durationMinutes,
    activities: input.activities,
  };
  // Without a linked scheduled day there is no plan to be "completed as scheduled" against — the
  // session either happened (this record exists) or it doesn't; there's no partial-vs-planned
  // distinction to make. Only a linked entry can be genuinely partial/modified relative to a plan.
  const completionStatus: WorkoutCompletionStatus = !input.linkedScheduledDate
    ? 'completed-as-planned'
    : review.completed
      ? 'completed-as-planned'
      : 'partial';
  return {
    id,
    athleteId,
    scheduledWorkoutId: input.linkedScheduledDate ? `scheduled:${athleteId}:${input.linkedScheduledDate}` : null,
    workoutId: 'manual-session',
    plannedWorkout: {
      id: 'manual-session',
      name: input.name,
      description: input.description,
      purpose: input.description,
      trainingCategory: sessionCategoryToWorkoutCategory[input.category],
      eventPathways: [],
      athleteLevels: [],
      seasonPhases: [],
      estimatedDurationMinutes: input.durationMinutes ?? 0,
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
    date: input.date || finishedAt.slice(0, 10),
    startedAt: finishedAt,
    completedAt: finishedAt,
    completionStatus,
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
      hamstringSoreness: null,
      achillesSoreness: null,
      painAreas: postSessionPainReport(review) ? [postSessionPainReport(review)!] : [],
      warmupFeeling: 'not-recorded',
      notes: '',
    },
    exerciseResults: [],
    surface: 'unknown',
    weather: { type: 'unknown', temperatureCelsius: null, humidityPercent: null, notes: '' },
    wind: { type: 'unknown', measuredMetersPerSecond: null },
    footwear: 'unknown',
    // Body weight isn't asked in the post-workout review — TrainingLog.bodyWeight is edited
    // directly on the History detail screen (app/history-detail.tsx) after the fact.
    bodyWeight: null,
    generalNotes: review.notes,
    createdAt: finishedAt,
    updatedAt: finishedAt,
    manualDetails,
  };
}
