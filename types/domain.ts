export type ISODateString = string;
export type ISODateTimeString = string;

export type SprintEvent =
  | '60m'
  | '100m'
  | '200m'
  | '300m'
  | '400m'
  | '60m-hurdles'
  | '100m-hurdles'
  | '110m-hurdles'
  | '400m-hurdles';

/** Track remains the complete first pathway; these values make the profile sport-aware. */
export type AthleteSport = 'track-and-field' | 'football' | 'soccer' | 'basketball' | 'baseball' | 'softball' | 'lacrosse' | 'rugby' | 'volleyball' | 'general-athletic-performance' | 'other';
export type SpeedGoal = 'first-step-quickness' | 'acceleration' | 'maximum-velocity' | 'multidirectional-speed' | 'repeated-sprint-ability' | 'speed-endurance' | 'explosive-power' | 'combine-testing' | 'track-race-performance' | 'general-speed-development';
export type CompetitionLevel = 'youth' | 'middle-school' | 'high-school' | 'club' | 'college' | 'recreational' | 'elite' | 'other';
export type TrainingContext = 'offseason' | 'preseason' | 'in-season' | 'postseason' | 'return-to-training' | 'general-development';
export type SpeedPathway = 'track-short-sprint' | 'track-long-sprint' | 'linear-acceleration' | 'maximum-velocity' | 'multidirectional-field-sport' | 'repeated-sprint-field-sport' | 'court-speed' | 'combine-preparation' | 'general-speed-development' | 'logging-only';
export type DistanceUnit = 'meters' | 'yards';
export type TimingMethod = 'hand-timed' | 'video-timed' | 'electronic-timing' | 'timing-gates' | 'unknown';
export type DirectionPattern = 'linear' | 'curved' | 'lateral' | 'multidirectional' | 'reactive';
export type PerformanceStartType = 'blocks' | 'three-point' | 'two-point' | 'standing' | 'sport-stance' | 'flying-start' | 'reactive-start' | 'unknown';
export type CurrentTeamTrainingLoad = 'low' | 'moderate' | 'high' | 'unknown';
export type TrainingPlanMode = 'build-my-plan' | 'log-coach-plan' | 'both';
export type SprintConsistency = 'not-currently-training' | 'occasional' | '1-2-times-weekly' | '3-plus-times-weekly';
export type TrainingDemand = 'team-practices' | 'games-or-meets' | 'weight-training' | 'another-sport' | 'heavy-school-schedule' | 'none';
export type MeetPriority = 'A' | 'B' | 'C';
export type CompetitionStatus = 'out-of-season' | 'preseason' | 'in-season' | 'postseason' | 'unknown';
export type RaceDevelopmentArea =
  | 'start-and-first-30'
  | 'transition-to-upright'
  | 'maximum-velocity'
  | 'curve-running'
  | 'speed-endurance'
  | 'race-distribution'
  | 'finish-under-fatigue'
  | 'unsure';

export type AgeRange =
  | 'under-14'
  | '14-15'
  | '16-17'
  | '18-22'
  | '23-34'
  | '35-plus';

export type CompetitionCategory =
  | 'youth'
  | 'high-school'
  | 'club'
  | 'collegiate'
  | 'open'
  | 'masters';

export type AthleteExperienceLevel =
  | 'beginner'
  | 'developing'
  | 'intermediate'
  | 'advanced'
  | 'elite';

export type SeasonPhase =
  | 'offseason'
  | 'general-preparation'
  | 'specific-preparation'
  | 'pre-competition'
  | 'competition'
  | 'championship'
  | 'transition';

export type WorkoutCategory =
  | 'acceleration'
  | 'maximum-velocity'
  | 'speed-endurance'
  | 'special-endurance'
  | 'tempo'
  | 'plyometrics'
  | 'strength'
  | 'recovery'
  | 'competition'
  | 'testing'
  | 'mixed';

export type ExpandedWorkoutCategory = WorkoutCategory
  | 'multidirectional-acceleration'
  | 'deceleration'
  | 'change-of-direction'
  | 'reactive-agility'
  | 'repeated-sprint-ability'
  | 'resisted-sprinting'
  | 'assisted-sprint-exposure'
  | 'combine-preparation'
  | 'field-conditioning'
  | 'court-speed'
  | 'explosive-power'
  | 'sport-practice-recovery'
  | 'game-day-preparation';

export type WorkoutSectionCategory =
  | 'warm-up'
  | 'track'
  | 'plyometrics'
  | 'strength'
  | 'conditioning'
  | 'cooldown'
  | 'recovery'
  | 'other';

export type WorkoutStatus =
  | 'scheduled'
  | 'in-progress'
  | 'completed'
  | 'partial'
  | 'skipped'
  | 'cancelled'
  | 'rescheduled';

export type WorkoutCompletionStatus =
  | 'completed-as-planned'
  | 'completed-with-modifications'
  | 'partial'
  | 'stopped'
  | 'skipped';

export type ApprovalStatus = 'draft' | 'in-review' | 'approved' | 'retired';

export type TrainingSurface =
  | 'track'
  | 'indoor-track'
  | 'grass'
  | 'turf'
  | 'hill'
  | 'road'
  | 'gym-floor'
  | 'weight-room'
  | 'sand'
  | 'pool'
  | 'other'
  | 'unknown';

export type EquipmentType =
  | 'starting-blocks'
  | 'cones'
  | 'mini-hurdles'
  | 'full-hurdles'
  | 'resistance-band'
  | 'sled'
  | 'medicine-ball'
  | 'plyo-box'
  | 'barbell'
  | 'plates'
  | 'dumbbells'
  | 'kettlebell'
  | 'squat-rack'
  | 'bench'
  | 'timing-gates'
  | 'stopwatch'
  | 'bike'
  | 'pool'
  | 'none'
  | 'other';

export type PainArea =
  | 'hamstring'
  | 'achilles'
  | 'calf'
  | 'shin'
  | 'groin'
  | 'hip-flexor'
  | 'hip'
  | 'quadriceps'
  | 'knee'
  | 'foot'
  | 'ankle'
  | 'lower-back'
  | 'other';

export type TrainingConcernArea =
  | 'hamstring'
  | 'knee'
  | 'achilles-or-ankle'
  | 'back'
  | 'shoulder'
  | 'other';

export type TrainingConcernStatus = 'currently-limiting' | 'recently-cleared' | 'monitoring';

export type TimeAwayDuration = 'under-2-weeks' | '2-6-weeks' | '6-12-weeks' | '3-plus-months';

export interface TrainingConcernDetail {
  area: TrainingConcernArea;
  status: TrainingConcernStatus;
}

export type TrainingDay =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type AccessLevel = 'none' | 'occasional' | 'regular';
export type CoachInvolvement = 'none' | 'occasional-guidance' | 'remote' | 'team-coach' | 'private-coach';
export type SkillExperience = 'none' | 'beginner' | 'intermediate' | 'advanced';
export type PrimaryGoal = 'improve-time' | 'build-speed' | 'prepare-for-season' | 'prepare-for-meet' | 'stay-healthy' | 'return-to-training' | 'log-training';
export type StartingMethod = 'blocks' | 'three-point' | 'standing' | 'rolling' | 'flying' | 'push-up' | 'other' | 'unknown';
export type FootwearType = 'spikes' | 'trainers' | 'flats' | 'barefoot' | 'lifting-shoes' | 'other' | 'unknown';
export type ModificationReason =
  | 'tightness-or-pain'
  | 'fatigue'
  | 'coach-adjustment'
  | 'weather'
  | 'equipment-or-space'
  | 'time-or-schedule'
  | 'performance'
  | 'other';
export type WarmupFeeling = 'poor' | 'heavy' | 'average' | 'good' | 'excellent' | 'better' | 'same' | 'worse' | 'not-recorded';
export type RepCompletionStatus = 'completed' | 'skipped' | 'stopped' | 'not-recorded';
export type WindType = 'indoor' | 'no-gauge' | 'still' | 'headwind' | 'tailwind' | 'measured' | 'unknown';
export type WeatherType = 'clear' | 'cloudy' | 'rain' | 'snow' | 'hot' | 'cold' | 'humid' | 'windy' | 'indoor' | 'unknown';

export type OneToFive = 1 | 2 | 3 | 4 | 5;
export type OneToTen = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type ZeroToTen = 0 | OneToTen;
export type PainSeverity = ZeroToTen;
export type PainClassification =
  | 'minor-tightness'
  | 'lingering-niggle'
  | 'severe-acute'
  | 'not-recorded';

export type PersonalBest = {
  event: SprintEvent;
  timeSeconds: number;
  date?: ISODateString;
  windMetersPerSecond?: number;
  indoor?: boolean;
};

export type PerformanceTest = {
  name: string;
  distance: number | null;
  distanceUnit: DistanceUnit;
  bestTimeSeconds: number | null;
  timingMethod?: TimingMethod;
  surface?: TrainingSurface;
  notes?: string;
};

export type TrackProfile = { primaryEvent: SprintEvent; secondaryEvents: SprintEvent[]; personalBests: PersonalBest[]; blockStartExperience: SkillExperience; nextMeetDate: ISODateString | null; championshipDate: ISODateString | null };
export type FootballProfile = {
  /** Legacy fields remain optional so previously saved profiles still load. */
  position?: string;
  /** What the athlete is training speed for; shapes whether 40-yard testing questions appear. */
  trainingFocus?: 'forty-yard' | 'game-speed' | 'both';
  baselineStatus?: 'known' | 'untested';
  fortyYardDashTime?: number;
  fortyYardTimingMethod?: TimingMethod;
  targetFortyYardDashTime?: number;
  tenYardSplit?: number;
  twentyYardSplit?: number;
  proAgilityTime?: number;
  flyingTenTime?: number;
  verticalJump?: number;
  broadJump?: number;
  combineDate?: ISODateString | null;
};
export type SoccerProfile = { position?: string; tenMeterTime?: number; twentyMeterTime?: number; thirtyMeterTime?: number; repeatedSprintTest?: string; matchDaysPerWeek?: number };
export type BasketballProfile = { position?: string; courtSprintTime?: number; threeQuarterCourtSprintTime?: number; laneAgilityTime?: number; verticalJump?: number; approachJump?: number };
export type BaseballSoftballProfile = { position?: string; homeToFirstTime?: number; tenYardTime?: number; sixtyYardDashTime?: number };
export type VolleyballProfile = { position?: string; verticalJump?: number; approachJump?: number };
export type GeneralSpeedProfile = { testName?: string; preferredTestDistance?: number; distanceUnit?: DistanceUnit; bestTestTime?: number; testSurface?: TrainingSurface };

export type PriorityMeet = {
  id: string;
  name: string;
  date: ISODateString;
  priority: MeetPriority;
  events: SprintEvent[];
  estimated?: boolean;
};

export type SeasonCalendar = {
  competitionStatus: CompetitionStatus;
  trainingBlockStartDate?: ISODateString | null;
  seasonStartDate?: ISODateString | null;
  seasonEndDate?: ISODateString | null;
  firstMeetDate?: ISODateString | null;
  championshipDate?: ISODateString | null;
  priorityMeets: PriorityMeet[];
  datesConfirmedAt?: ISODateTimeString | null;
};

export type SeasonPhaseOverride = {
  phase: SeasonPhase;
  reason: string;
  setBy: 'coach' | 'prototype-editor';
  expiresOn?: ISODateString | null;
};

export type TargetPerformance = {
  event: SprintEvent;
  timeSeconds: number;
  targetDate?: ISODateString | null;
};

export type AthleteProfile = {
  id: string;
  name: string;
  ageRange: AgeRange;
  competitionCategory: CompetitionCategory;
  primaryEvent: SprintEvent;
  secondaryEvents: SprintEvent[];
  personalBests: PersonalBest[];
  experienceLevel: AthleteExperienceLevel;
  seasonPhase: SeasonPhase;
  trainingDaysPerWeek: number;
  availableTrainingDays: TrainingDay[];
  /** Whether the athlete wants SprintLab restricted to the exact weekdays above. */
  exactTrainingDaysPreference?: boolean;
  preferredRestDay: TrainingDay;
  /** Keeps the legacy rest-day value readable without treating it as a new athlete's choice. */
  preferredRestDayAnswered?: boolean;
  usualSessionDurationMinutes: number;
  trackAccess: AccessLevel;
  grassAccess: AccessLevel;
  hillAccess: AccessLevel;
  indoorAccess: AccessLevel;
  startingBlocksAccess: AccessLevel;
  weightRoomAccess: AccessLevel;
  homeEquipment: EquipmentType[];
  coachInvolvement: CoachInvolvement;
  liftingExperience: SkillExperience;
  blockStartExperience: SkillExperience;
  primaryGoal: PrimaryGoal;
  nextMeetDate: ISODateString | null;
  championshipDate: ISODateString | null;
  loggingOnlyMode: boolean;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  /** Optional at the persistence boundary so pre-expansion local track profiles remain readable. */
  sport?: AthleteSport;
  /** All sports this athlete currently trains for; `sport` remains the primary focus for compatibility. */
  sports?: AthleteSport[];
  primarySport?: AthleteSport;
  sportPosition?: string | null;
  speedGoals?: SpeedGoal[];
  competitionLevel?: CompetitionLevel;
  trainingContext?: TrainingContext;
  primaryPerformanceTest?: PerformanceTest | null;
  secondaryPerformanceTests?: PerformanceTest[];
  sportPracticeDays?: TrainingDay[];
  gameOrCompetitionDays?: (ISODateString | TrainingDay)[];
  gameScheduleVaries?: boolean;
  otherSportDays?: TrainingDay[];
  busySchoolDays?: TrainingDay[];
  /** True after the athlete has placed selected outside commitments on the week. */
  commitmentSchedulePlaced?: boolean;
  currentTeamTrainingLoad?: CurrentTeamTrainingLoad;
  courtAccess?: AccessLevel;
  sledAccess?: AccessLevel;
  timingGatesAccess?: AccessLevel;
  conesAccess?: AccessLevel;
  trackProfile?: TrackProfile;
  footballProfile?: FootballProfile;
  soccerProfile?: SoccerProfile;
  basketballProfile?: BasketballProfile;
  baseballSoftballProfile?: BaseballSoftballProfile;
  volleyballProfile?: VolleyballProfile;
  generalSpeedProfile?: GeneralSpeedProfile;
  trainingPlanMode?: TrainingPlanMode;
  /** True only after the athlete explicitly chooses how SprintLab should organize training. */
  trainingPlanModeAnswered?: boolean;
  otherSportParticipation?: string;
  recentSprintConsistency?: SprintConsistency;
  currentWorkouts?: string;
  currentPain?: boolean;
  cautionAreas?: PainArea[];
  coachRestrictions?: string;
  medicalRestrictions?: string;
  safetyAcknowledgedAt?: ISODateTimeString | null;
  targetEvent?: SprintEvent;
  followsCoachCreatedPlan?: boolean;
  /** Set only after the final commitment screen. Older local profiles remain valid. */
  onboardingComplete?: boolean;
  currentTrainingDemands?: TrainingDemand[];
  onboardingLimitations?: string[];
  /** Structured follow-ups for current physical concerns; these are context, not diagnoses. */
  trainingConcernDetails?: TrainingConcernDetail[];
  otherConcernArea?: string;
  returningAfterTimeOff?: boolean;
  timeAwayDuration?: TimeAwayDuration;
  /** Separates the initial selection screen from its relevant follow-up questions. */
  trainingConstraintsReviewed?: boolean;
  /** Optional context for a selected hamstring limitation; never treated as a diagnosis. */
  hamstringLimitationSeverity?: 'cautious' | 'mild-tightness' | 'moderate-discomfort' | 'returning-from-strain';
  /** Local onboarding gates distinguish an intentional answer from a migration default. */
  experienceAnswered?: boolean;
  sportProfileAnswered?: boolean;
  primarySportAnswered?: boolean;
  turfAccess?: AccessLevel;
  /** Local workout reminders. Time is stored in the athlete's current local timezone. */
  workoutReminderEnabled?: boolean;
  workoutReminderHour?: number;
  workoutReminderMinute?: number;
  /** Keeps a custom clock choice distinct from a preset that happens to use the same time. */
  workoutReminderCustomTime?: boolean;
  /** Distinguishes an unanswered onboarding step from an intentional "no reminders" choice. */
  workoutReminderAnswered?: boolean;
  /** Optional race-development answers used to rank, never invent, library sessions. */
  raceDevelopmentAreas?: RaceDevelopmentArea[];
  /** Athlete-entered performance targets. These are goals, not guarantees. */
  targetPerformances?: TargetPerformance[];
  /** Dates, meet priority, and competition status used by the deterministic season engine. */
  seasonCalendar?: SeasonCalendar;
  seasonPhaseOverride?: SeasonPhaseOverride | null;
};

export type AthleteOnboardingDraft = {
  version: 1;
  currentStep: number;
  profile: AthleteProfile;
  completed: boolean;
  updatedAt: ISODateTimeString;
};

export type ExerciseCategory =
  | 'mobility'
  | 'sprint-drill'
  | 'acceleration'
  | 'maximum-velocity'
  | 'speed-endurance'
  | 'tempo'
  | 'plyometric'
  | 'strength'
  | 'conditioning'
  | 'recovery'
  | 'cooldown'
  | 'other';

export type Exercise = {
  id: string;
  name: string;
  category: ExerciseCategory;
  description: string;
  coachingCues: string[];
  distanceMeters: number | null;
  durationSeconds: number | null;
  plannedSets: number | null;
  plannedReps: number | null;
  intensityPercent: number | null;
  restBetweenRepsSeconds: number | null;
  restBetweenSetsSeconds: number | null;
  equipment: EquipmentType[];
  surface: TrainingSurface[];
  optional: boolean;
  progressionId: string | null;
  regressionId: string | null;
};

export type WorkoutSection = {
  id: string;
  title: string;
  category: WorkoutSectionCategory;
  order: number;
  exercises: Exercise[];
};

export type Workout = {
  id: string;
  name: string;
  description: string;
  purpose: string;
  trainingCategory: WorkoutCategory;
  eventPathways: SprintEvent[];
  athleteLevels: AthleteExperienceLevel[];
  seasonPhases: SeasonPhase[];
  estimatedDurationMinutes: number;
  requiredEquipment: EquipmentType[];
  allowedSurfaces: TrainingSurface[];
  totalSprintVolumeMeters: number;
  highIntensityVolumeMeters: number;
  sections: WorkoutSection[];
  safetyNotes: string[];
  sourceNotes: string[];
  version: number;
  approvalStatus: ApprovalStatus;
  sports?: AthleteSport[];
  speedPathways?: SpeedPathway[];
  transferGoals?: ('acceleration' | 'top-speed' | 'change-of-direction' | 'repeated-sprint' | 'power' | 'test-preparation' | 'track-performance')[];
  competitionContexts?: ('track-meet' | 'football-combine' | 'team-practice' | 'regular-season-game' | 'tournament' | 'general-training')[];
  distanceUnit?: DistanceUnit;
  testType?: string | null;
  directionPattern?: DirectionPattern;
};

export type WorkoutModification = {
  id: string;
  reason: ModificationReason;
  description: string;
  createdAt: ISODateTimeString;
};

export type ScheduledWorkout = {
  id: string;
  workoutId: string;
  date: ISODateString;
  athleteId: string;
  status: WorkoutStatus;
  plannedStartTime: string | null;
  modifications: WorkoutModification[];
  completionPercentage: number;
};

export type WindConditions = {
  type: WindType;
  measuredMetersPerSecond: number | null;
};

export type WeatherConditions = {
  type: WeatherType;
  temperatureCelsius: number | null;
  humidityPercent: number | null;
  notes: string;
};

export type SprintRepRecord = {
  repNumber: number;
  status: RepCompletionStatus;
  timeSeconds: number | null;
  distanceMeters: number | null;
  intensityTargetPercent: number | null;
  restBeforeRepSeconds: number | null;
  surface: TrainingSurface;
  startingMethod: StartingMethod;
  footwear: FootwearType;
  wind: WindConditions;
  testName?: string;
  distanceUnit?: DistanceUnit;
  timingMethod?: TimingMethod;
  startType?: PerformanceStartType;
  directionPattern?: DirectionPattern;
  notes?: string;
};

export type ExerciseResult = {
  exerciseId: string;
  completed: boolean;
  actualSets: number | null;
  actualReps: number | null;
  repTimes: SprintRepRecord[];
  actualWeight: number | null;
  actualDistance: number | null;
  modificationReason: ModificationReason | null;
  notes: string;
};

export type PainReport = {
  area: PainArea;
  severity: PainSeverity | null;
  classification: PainClassification;
  side: 'left' | 'right' | 'bilateral' | 'not-recorded';
  description: string;
};

export type ReadinessCheck = {
  date: ISODateString;
  sleepHours: number | null;
  sleepQuality: OneToFive | null;
  energy: OneToTen | null;
  focus: OneToFive | null;
  motivation: OneToFive | null;
  stress: OneToFive | null;
  fuelHydrated: boolean | null;
  generalSoreness: ZeroToTen | null;
  hamstringSoreness: ZeroToTen | null;
  achillesSoreness: ZeroToTen | null;
  painAreas: PainReport[];
  warmupFeeling: WarmupFeeling;
  notes: string;
};

export type TrainingLog = {
  id: string;
  athleteId: string;
  scheduledWorkoutId: string | null;
  workoutId: string;
  plannedWorkout: Workout;
  date: ISODateString;
  startedAt: ISODateTimeString;
  completedAt: ISODateTimeString | null;
  completionStatus: WorkoutCompletionStatus;
  sessionRpe: OneToTen | null;
  readiness: ReadinessCheck;
  exerciseResults: ExerciseResult[];
  surface: TrainingSurface;
  weather: WeatherConditions;
  wind: WindConditions;
  footwear: FootwearType;
  bodyWeight: number | null;
  generalNotes: string;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
};

export type WeeklyPlan = {
  id: string;
  athleteId: string;
  weekStartDate: ISODateString;
  pathway: SprintEvent;
  seasonPhase: SeasonPhase;
  scheduledWorkouts: ScheduledWorkout[];
  notes: string;
  speedPathway?: SpeedPathway;
  trainingContext?: TrainingContext;
};

export type SportScheduleConstraints = {
  sportPracticeDays: TrainingDay[];
  gameOrCompetitionDays: (ISODateString | TrainingDay)[];
  currentTeamTrainingLoad: CurrentTeamTrainingLoad;
};

export type ClassificationResult = {
  sport: AthleteSport;
  speedPathway: SpeedPathway;
  speedGoal: SpeedGoal[];
  competitionLevel: CompetitionLevel;
  trainingContext: TrainingContext;
  sportScheduleConstraints: SportScheduleConstraints;
  eligibleWorkoutCategories: ExpandedWorkoutCategory[];
  ineligibleWorkoutTags: string[];
  classificationReasons: string[];
  warnings: string[];
  missingInformation: string[];
  trackEventPathway?: SprintEvent[];
};
