import type {
  FootwearType,
  PainSeverity,
  PainReport,
  SprintEvent,
  StartingMethod,
  TrainingLog as DomainTrainingLog,
  TrainingSurface,
  WeatherConditions,
  WorkoutCategory,
} from './domain';

export type ExerciseTracking =
  | { kind: 'completion' }
  | {
      kind: 'track';
      reps: number;
      distanceMeters?: number;
      targetIntensity?: number;
      restSeconds?: number;
    }
  | {
      kind: 'strength';
      sets: number;
      targetReps: string;
      targetLoad?: number;
      restSeconds?: number;
    };

export type PlannedExercise = {
  id: string;
  name: string;
  detail?: string;
  /** A workout-time prescription override without mutating the original plan. */
  prescriptionOverride?: string;
  /** The single most useful coaching cue for this exercise, when authored. */
  cue?: string;
  tracking: ExerciseTracking;
};

export type PlannedWorkoutSection = {
  title: string;
  exercises: PlannedExercise[];
};

export type PlannedWorkout = {
  id: string;
  title: string;
  purpose: string;
  durationMinutes: number;
  category?: WorkoutCategory;
  eventTags?: SprintEvent[];
  sections: PlannedWorkoutSection[];
};

export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type ScheduledDay = {
  dayIndex: WeekdayIndex;
  shortLabel: string;
  fullLabel: string;
  kind: 'workout' | 'rest';
  workout?: PlannedWorkout;
  restTitle?: string;
  restNote?: string;
};

export type ReadinessLevel = 'green' | 'yellow' | 'red';

export type ReadinessSensation =
  | 'minor-tightness'
  | 'lingering-niggle'
  | 'severe-acute';

export type ReadinessLocation =
  | 'hamstring'
  | 'achilles-calf'
  | 'shin'
  | 'groin-hip-flexor'
  | 'foot-ankle'
  | 'other';

export type ReadinessFuelStatus = 'normal' | 'fasted-usual' | 'underfueled';
export type WarmupReassessment = 'better' | 'same' | 'worse';

export type ReadinessDecision = {
  date: string;
  status: 'completed' | 'skipped';
  sleep?: number;
  sleepQuality?: number;
  neuralReadiness?: number;
  focus?: number;
  foodStatus?: ReadinessFuelStatus;
  hydrated?: boolean;
  fuelHydrated?: boolean;
  hasLocalizedIssue?: boolean;
  sensation?: ReadinessSensation;
  location?: ReadinessLocation;
  otherLocationDetail?: string;
  painSeverity?: PainSeverity;
  hesitatesAtMaxEffort?: boolean;
  readinessLevel?: ReadinessLevel;
  readinessReasons?: string[];
  readinessGuidance?: string;
  warmupReassessment?: WarmupReassessment;
  maximalSprintRestricted?: boolean;
  // Legacy prototype fields remain optional so existing local records still load.
  energy?: number;
  hamstring?: number;
  soreness?: number;
  painNotes: string;
};

export type ResultStatus = 'pending' | 'completed' | 'skipped';

export type TrackConditionType =
  | 'indoor'
  | 'no-gauge'
  | 'still'
  | 'headwind'
  | 'tailwind'
  | 'measured';

export type TrackConditions = {
  type: TrackConditionType;
  measuredWind?: number;
};

export type RepFeeling = 'smooth' | 'flat' | 'tight' | 'stopped';

export type ResultChangeReason =
  | 'tightness-or-pain'
  | 'fatigue'
  | 'coach-adjustment'
  | 'weather'
  | 'equipment-or-space'
  | 'time-or-schedule'
  | 'other';

export type TrackRepResult = {
  repNumber: number;
  status: ResultStatus;
  plannedDistanceMeters?: number;
  intensityTargetPercent?: number;
  plannedRestSeconds?: number;
  timeSeconds?: number;
  feeling?: RepFeeling;
  windOverride?: TrackConditions;
  // Legacy numeric wind values remain optional so earlier sessions still load.
  wind?: number;
  testName?: string;
  distanceUnit?: import('./domain').DistanceUnit;
  timingMethod?: import('./domain').TimingMethod;
  startType?: import('./domain').PerformanceStartType;
  directionPattern?: import('./domain').DirectionPattern;
  notes?: string;
};

export type StrengthSetResult = {
  setNumber: number;
  status: ResultStatus;
  load?: number;
  reps?: number;
};

export type ActualExerciseResult = {
  exerciseId: string;
  sectionTitle: string;
  trackingKind: ExerciseTracking['kind'];
  origin?: 'planned' | 'added';
  exerciseSnapshot?: PlannedExercise;
  status: ResultStatus;
  changeReason?: ResultChangeReason;
  changeReasonNote?: string;
  notes: string;
  trackReps?: TrackRepResult[];
  strengthSets?: StrengthSetResult[];
  quickCompletionSnapshot?: {
    status: ResultStatus;
    trackRepStatuses?: ResultStatus[];
    strengthSetStatuses?: ResultStatus[];
  };
};

export type SessionTrainingContext = {
  surface: TrainingSurface;
  startingMethod: StartingMethod;
  footwear: FootwearType;
  weather: WeatherConditions;
  painAreas: PainReport[];
};

export type ActiveWorkoutSession = {
  id: string;
  plannedWorkoutSnapshot: PlannedWorkout;
  scheduledDate?: string;
  scheduledDayIndex?: WeekdayIndex;
  readinessStatus: ReadinessDecision['status'];
  readinessSnapshot?: ReadinessDecision;
  startedAt: string;
  // The session can be previewed before its execution clock begins.
  executionStartedAt?: string;
  elapsedSeconds: number;
  trackConditions?: TrackConditions;
  // Required for new records; optional here so completed prototype records still load.
  trainingContext?: SessionTrainingContext;
  actualResults: ActualExerciseResult[];
};

export type PostWorkoutReview = {
  completed: boolean;
  rpe: number;
  energy: number;
  sleep: number;
  hamstring: number;
  soreness: number;
  bodyWeight?: number;
  notes: string;
};

export type CompletedWorkoutSession = ActiveWorkoutSession & {
  finishedAt: string;
  review: PostWorkoutReview;
  // New records include the full domain log; optional for saved prototype records.
  structuredLog?: DomainTrainingLog;
};

export type TrainingLogSummary = {
  id: string;
  sessionId?: string;
  date: string;
  completed: boolean;
  rpe: number;
  energy: number;
  sleep: number;
  hamstring: number;
  soreness: number;
  sprintTime?: number;
  bodyWeight?: number;
  notes: string;
  workoutTitle?: string;
  exercisesCompleted?: number;
  exercisesPlanned?: number;
};

export type FutureWorkoutOverride = {
  id: string;
  date: string;
  /** Defaults to 'workout' so existing stored records (which never set this) still load correctly. */
  kind?: 'workout' | 'rest';
  /** Required when kind is 'workout'; absent for a 'rest' override. */
  workout?: PlannedWorkout;
  restTitle?: string;
  restNote?: string;
  sourceTrainingLogId?: string;
};

export type PendingWorkoutLaunch = {
  workout: PlannedWorkout;
  source: 'library' | 'custom' | 'plan';
  createdAt: string;
  scheduledDate?: string;
  scheduledDayIndex?: WeekdayIndex;
};

export type {
  AccessLevel,
  AgeRange,
  AthleteSport,
  AthleteExperienceLevel,
  AthleteOnboardingDraft,
  AthleteProfile,
  BaseballSoftballProfile,
  BasketballProfile,
  ClassificationResult,
  ApprovalStatus,
  CoachInvolvement,
  CompetitionCategory,
  CompetitionLevel,
  CompetitionStatus,
  CurrentTeamTrainingLoad,
  DirectionPattern,
  DistanceUnit,
  EquipmentType,
  Exercise,
  ExerciseCategory,
  ExerciseResult,
  ExpandedWorkoutCategory,
  FootballProfile,
  FootwearType,
  ISODateString,
  ISODateTimeString,
  GeneralSpeedProfile,
  ModificationReason,
  OneToFive,
  OneToTen,
  PainArea,
  PainClassification,
  PainReport,
  PainSeverity,
  PersonalBest,
  MeetPriority,
  PriorityMeet,
  PrimaryGoal,
  RaceDevelopmentArea,
  PerformanceStartType,
  PerformanceTest,
  ReadinessCheck,
  RepCompletionStatus,
  ScheduledWorkout,
  SeasonPhase,
  SeasonCalendar,
  SeasonPhaseOverride,
  SkillExperience,
  SoccerProfile,
  SpeedGoal,
  SpeedPathway,
  SportScheduleConstraints,
  SprintEvent,
  SprintRepRecord,
  StartingMethod,
  TrainingDay,
  TrainingDemand,
  TrainingPlanMode,
  TrainingContext,
  TrainingConcernArea,
  TrainingConcernDetail,
  TrainingConcernStatus,
  TimeAwayDuration,
  TrainingLog,
  TrainingSurface,
  WarmupFeeling,
  WeatherConditions,
  WeatherType,
  WeeklyPlan,
  WindConditions,
  WindType,
  Workout,
  WorkoutCategory,
  WorkoutCompletionStatus,
  WorkoutModification,
  WorkoutSection,
  WorkoutSectionCategory,
  WorkoutStatus,
  ZeroToTen,
  TimingMethod,
  TargetPerformance,
  TrackProfile,
  SprintConsistency,
} from './domain';

export type {
  EventPathway,
  EventTag,
  IntensityBasis,
  IntensityPrescription,
  LibraryApprovalStatus,
  LibraryAthleteLevel,
  LibrarySeasonPhase,
  LibrarySurface,
  LibraryWorkout,
  LibraryWorkoutCategory,
  LibraryWorkoutItem,
  LibraryWorkoutSection,
  MetabolicDemand,
  RecoveryPrescription,
  SurfaceRequirement,
  WorkoutLibraryFilters,
  WorkoutLibraryState,
  WorkoutMetrics,
} from './workout-library';

export type {
  PrehabArea,
  PrehabContext,
  PrehabEvaluation,
  PrehabGate,
  PrehabRecommendationCard,
  SavedPrehabChoice,
} from './prehab';

export type {
  CoachResponsePayload,
  PlanChangeConfidence,
  PlanChangeProposal,
  PlanChangeType,
} from './ai-plan-change';
export { COACH_RESPONSE_JSON_SCHEMA, PLAN_CHANGE_TYPES } from './ai-plan-change';
