import type { AthleteSport, DirectionPattern, DistanceUnit, SpeedGoal, SpeedPathway, TrainingContext } from './domain';

export type LibraryApprovalStatus = 'approved' | 'draft' | 'archived';

export type LibraryWorkoutCategory =
  | 'acceleration'
  | 'maximum-velocity'
  | 'starts'
  | 'speed-endurance'
  | 'special-endurance'
  | 'tempo-recovery'
  | 'strength'
  | 'plyometrics'
  | 'core-bodyweight'
  | 'testing'
  | 'meet-preparation'
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

export type EventPathway = 'short-sprint-100-200' | 'long-sprint-200-400' | 'shared';
export type EventTag = '60m' | '100m' | '200m' | '400m';
export type LibraryAthleteLevel = 'foundation' | 'developing' | 'trained' | 'advanced';
export type LibrarySeasonPhase = 'general-preparation' | 'specific-preparation' | 'pre-competition' | 'competition' | 'taper' | 'transition';
export type LibrarySurface = 'track' | 'track-curve' | 'turf' | 'level-grass' | 'hill' | 'gym' | 'pool' | 'indoor' | 'home';
export type IntensityBasis = 'percent-max-velocity' | 'percent-best-time' | 'rpe' | 'technical';
export type MetabolicDemand = 'low' | 'moderate' | 'high' | 'very-high';

export type RecoveryPrescription = {
  afterRepSeconds?: number;
  afterSetSeconds?: number;
  rangeSeconds?: [number, number];
  description: string;
};

export type IntensityPrescription = {
  basis: IntensityBasis;
  min?: number;
  max?: number;
  description: string;
};

export type LibraryWorkoutItem = {
  id: string;
  name: string;
  sets?: number;
  reps?: number;
  distanceMeters?: number;
  fastZoneMeters?: number;
  durationSeconds?: number;
  intensity?: IntensityPrescription;
  recovery?: RecoveryPrescription;
  coachingCues: string[];
  notes?: string;
  countsTowardSprintVolume: boolean;
  countsTowardHighIntensityVolume: boolean;
};

export type LibraryWorkoutSection = {
  id: string;
  label: string;
  items: LibraryWorkoutItem[];
  notes?: string;
};

export type SurfaceRequirement = {
  required: LibrarySurface[];
  preferred: LibrarySurface[];
  prohibited: LibrarySurface[];
  notes: string;
};

export type WorkoutMetrics = {
  totalSprintVolumeMeters: number;
  highIntensitySprintVolumeMeters: number;
  estimatedDurationMinutes: [number, number];
  highCns: boolean;
  metabolicDemand: MetabolicDemand;
};

export type LibraryWorkout = {
  id: string;
  slug: string;
  name: string;
  purpose: string;
  intendedAthlete: string;
  primaryCategory: LibraryWorkoutCategory;
  secondaryCategories: LibraryWorkoutCategory[];
  eventPathways: EventPathway[];
  eventTags: EventTag[];
  athleteLevels: LibraryAthleteLevel[];
  seasonPhases: LibrarySeasonPhase[];
  specialistProfiles: ('acceleration-limited' | 'max-velocity-limited' | 'speed-endurance-limited' | 'special-endurance-limited' | 'balanced' | 'unclassified')[];
  equipmentRequired: string[];
  equipmentOptional: string[];
  surface: SurfaceRequirement;
  sections: {
    warmup: LibraryWorkoutSection;
    sprintWork: LibraryWorkoutSection;
    plyometrics: LibraryWorkoutSection;
    strength: LibraryWorkoutSection;
    coreBodyweight: LibraryWorkoutSection;
    cooldown: LibraryWorkoutSection;
  };
  intensitySummary: string;
  recoverySummary: string;
  metrics: WorkoutMetrics;
  coachingCues: string[];
  modifications: string[];
  safetyNotes: string[];
  sourceNotes: { sourceId: string; note: string }[];
  familyId: string;
  progressionLevel: number;
  regressionWorkoutId?: string;
  progressionWorkoutId?: string;
  version: number;
  approvalStatus: LibraryApprovalStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  /** Sport-aware metadata is additive; existing track library records remain valid. */
  sports?: AthleteSport[];
  speedGoals?: SpeedGoal[];
  speedPathways?: SpeedPathway[];
  trainingContexts?: TrainingContext[];
  distanceUnit?: DistanceUnit;
  testType?: string | null;
  directionPattern?: DirectionPattern;
};

export type WorkoutLibraryState = {
  schemaVersion: 1;
  seededVersion: number;
  workouts: LibraryWorkout[];
};

export type WorkoutLibraryFilters = {
  query: string;
  category: LibraryWorkoutCategory | 'all';
  athleteLevel: LibraryAthleteLevel | 'all';
  seasonPhase: LibrarySeasonPhase | 'all';
  pathway: EventPathway | 'all';
  eventTag: EventTag | 'all';
  equipment: string | 'all';
  surface: LibrarySurface | 'all';
  status: LibraryApprovalStatus | 'all';
  duration: 'all' | 'under-45' | '45-60' | '61-75' | 'over-75';
  sort: 'relevance' | 'name' | 'duration' | 'recently-updated' | 'progression';
  sport?: AthleteSport | 'all';
  speedGoal?: SpeedGoal | 'all';
  speedPathway?: SpeedPathway | 'all';
  trainingContext?: TrainingContext | 'all';
};
