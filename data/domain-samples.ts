import type {
  AthleteProfile,
  Exercise,
  ExerciseResult,
  ReadinessCheck,
  ScheduledWorkout,
  TrainingLog,
  WeeklyPlan,
  Workout,
  WorkoutSection,
} from '@/types';

export const sampleAthleteProfile = {
  id: 'athlete-joshua-sample',
  name: 'Joshua',
  ageRange: '16-17',
  competitionCategory: 'high-school',
  primaryEvent: '100m',
  secondaryEvents: ['200m', '400m'],
  personalBests: [
    { event: '100m', timeSeconds: 11.42, date: '2026-05-16', windMetersPerSecond: 1.1, indoor: false },
    { event: '200m', timeSeconds: 23.18, date: '2026-05-30', windMetersPerSecond: 0.4, indoor: false },
  ],
  experienceLevel: 'intermediate',
  seasonPhase: 'specific-preparation',
  trainingDaysPerWeek: 5,
  availableTrainingDays: ['monday', 'tuesday', 'wednesday', 'friday', 'saturday'],
  preferredRestDay: 'sunday',
  usualSessionDurationMinutes: 75,
  trackAccess: 'regular',
  grassAccess: 'regular',
  hillAccess: 'occasional',
  indoorAccess: 'none',
  startingBlocksAccess: 'regular',
  weightRoomAccess: 'regular',
  homeEquipment: ['resistance-band', 'medicine-ball', 'dumbbells'],
  coachInvolvement: 'team-coach',
  liftingExperience: 'intermediate',
  blockStartExperience: 'intermediate',
  primaryGoal: 'improve-time',
  nextMeetDate: '2026-08-08',
  championshipDate: '2026-10-24',
  loggingOnlyMode: false,
  sport: 'track-and-field',
  speedGoals: ['acceleration', 'maximum-velocity', 'speed-endurance'],
  competitionLevel: 'high-school',
  trainingContext: 'preseason',
  sportPracticeDays: [],
  gameOrCompetitionDays: [],
  currentTeamTrainingLoad: 'unknown',
  courtAccess: 'none',
  sledAccess: 'occasional',
  timingGatesAccess: 'occasional',
  conesAccess: 'regular',
  trackProfile: { primaryEvent: '100m', secondaryEvents: ['200m', '400m'], personalBests: [{ event: '100m', timeSeconds: 11.42 }], blockStartExperience: 'intermediate', nextMeetDate: '2026-08-08', championshipDate: '2026-10-24' },
  createdAt: '2026-07-24T16:00:00.000Z',
  updatedAt: '2026-07-24T16:00:00.000Z',
} satisfies AthleteProfile;

export const sampleFootballAthleteProfile = {
  ...sampleAthleteProfile, id: 'athlete-football-sample', name: 'Jordan', primaryEvent: '100m', secondaryEvents: [], personalBests: [], sport: 'football', sportPosition: 'Wide receiver', speedGoals: ['acceleration', 'maximum-velocity', 'combine-testing'], competitionLevel: 'high-school', trainingContext: 'offseason', sportPracticeDays: ['monday', 'wednesday'], gameOrCompetitionDays: [], currentTeamTrainingLoad: 'moderate', footballProfile: { position: 'Wide receiver', fortyYardDashTime: 4.72, tenYardSplit: 1.64, combineDate: '2026-09-12' }, trackProfile: undefined,
} satisfies AthleteProfile;

export const sampleSoccerAthleteProfile = {
  ...sampleAthleteProfile, id: 'athlete-soccer-sample', name: 'Maya', personalBests: [], sport: 'soccer', sportPosition: 'Midfielder', speedGoals: ['acceleration', 'multidirectional-speed', 'repeated-sprint-ability'], competitionLevel: 'club', trainingContext: 'in-season', sportPracticeDays: ['tuesday', 'thursday'], gameOrCompetitionDays: ['saturday'], currentTeamTrainingLoad: 'high', soccerProfile: { position: 'Midfielder', tenMeterTime: 1.89, twentyMeterTime: 3.21, matchDaysPerWeek: 1 }, trackProfile: undefined,
} satisfies AthleteProfile;

export const sampleBasketballAthleteProfile = {
  ...sampleAthleteProfile, id: 'athlete-basketball-sample', name: 'Avery', personalBests: [], sport: 'basketball', sportPosition: 'Guard', speedGoals: ['acceleration', 'multidirectional-speed', 'explosive-power'], competitionLevel: 'high-school', trainingContext: 'preseason', courtAccess: 'regular', basketballProfile: { position: 'Guard', threeQuarterCourtSprintTime: 3.31, laneAgilityTime: 11.4, verticalJump: 68 }, trackProfile: undefined,
} satisfies AthleteProfile;

export const sampleGeneralAthleteProfile = {
  ...sampleAthleteProfile, id: 'athlete-general-sample', name: 'Sam', personalBests: [], sport: 'general-athletic-performance', speedGoals: ['general-speed-development'], competitionLevel: 'recreational', trainingContext: 'general-development', primaryPerformanceTest: { name: '20-yard speed test', distance: 20, distanceUnit: 'yards', bestTimeSeconds: 3.08, timingMethod: 'video-timed', surface: 'turf' }, generalSpeedProfile: { preferredTestDistance: 20, distanceUnit: 'yards', bestTestTime: 3.08, testSurface: 'turf' }, trackProfile: undefined,
} satisfies AthleteProfile;

export const sampleExercise = {
  id: 'exercise-30m-block-start',
  name: '30m Block Starts',
  category: 'acceleration',
  description: 'Accelerate from starting blocks through 30 meters with full recovery.',
  coachingCues: ['Push long through the first steps', 'Keep the head neutral', 'Rise gradually'],
  distanceMeters: 30,
  durationSeconds: null,
  plannedSets: 1,
  plannedReps: 4,
  intensityPercent: 95,
  restBetweenRepsSeconds: 180,
  restBetweenSetsSeconds: null,
  equipment: ['starting-blocks', 'cones'],
  surface: ['track'],
  optional: false,
  progressionId: 'exercise-40m-block-start',
  regressionId: 'exercise-20m-three-point-start',
} satisfies Exercise;

export const sampleWorkoutSection = {
  id: 'section-track-acceleration',
  title: 'Track',
  category: 'track',
  order: 2,
  exercises: [sampleExercise],
} satisfies WorkoutSection;

export const sampleWorkout = {
  id: 'workout-acceleration-lower-sample',
  name: 'Acceleration + Lower Body',
  description: 'A high-quality acceleration session paired with lower-body strength.',
  purpose: 'Improve early acceleration mechanics and force production.',
  trainingCategory: 'acceleration',
  eventPathways: ['100m', '200m', '400m'],
  athleteLevels: ['developing', 'intermediate', 'advanced'],
  seasonPhases: ['general-preparation', 'specific-preparation', 'pre-competition'],
  estimatedDurationMinutes: 80,
  requiredEquipment: ['starting-blocks', 'cones', 'barbell', 'plates'],
  allowedSurfaces: ['track', 'indoor-track'],
  totalSprintVolumeMeters: 120,
  highIntensityVolumeMeters: 120,
  sections: [sampleWorkoutSection],
  safetyNotes: ['Stop maximal sprinting if mechanics change because of pain or hesitation.'],
  sourceNotes: ['Sample template for domain-model validation; not an individualized prescription.'],
  version: 1,
  approvalStatus: 'draft',
} satisfies Workout;

export const sampleScheduledWorkout = {
  id: 'scheduled-2026-07-24-acceleration',
  workoutId: sampleWorkout.id,
  date: '2026-07-24',
  athleteId: sampleAthleteProfile.id,
  status: 'completed',
  plannedStartTime: '16:30',
  modifications: [
    {
      id: 'modification-1',
      reason: 'fatigue',
      description: 'Reduced the final rep intensity target after warm-up feedback.',
      createdAt: '2026-07-24T23:25:00.000Z',
    },
  ],
  completionPercentage: 100,
} satisfies ScheduledWorkout;

export const sampleReadinessCheck = {
  date: '2026-07-24',
  sleepHours: 7.5,
  sleepQuality: 4,
  energy: 7,
  focus: 4,
  motivation: 5,
  stress: 2,
  fuelHydrated: true,
  generalSoreness: 2,
  hamstringSoreness: 1,
  achillesSoreness: 0,
  painAreas: [
    {
      area: 'hamstring',
      severity: 1,
      classification: 'minor-tightness',
      side: 'left',
      description: 'Mild normal soreness that did not change warm-up mechanics.',
    },
  ],
  warmupFeeling: 'good',
  notes: 'Felt sharper after the progressive buildups.',
} satisfies ReadinessCheck;

export const sampleExerciseResult = {
  exerciseId: sampleExercise.id,
  completed: true,
  actualSets: 1,
  actualReps: 4,
  repTimes: [
    {
      repNumber: 1,
      status: 'completed',
      timeSeconds: 4.21,
      distanceMeters: 30,
      intensityTargetPercent: 95,
      restBeforeRepSeconds: 180,
      surface: 'track',
      startingMethod: 'blocks',
      footwear: 'spikes',
      wind: { type: 'measured', measuredMetersPerSecond: -0.4 },
    },
    {
      repNumber: 2,
      status: 'completed',
      timeSeconds: 4.17,
      distanceMeters: 30,
      intensityTargetPercent: 95,
      restBeforeRepSeconds: 180,
      surface: 'track',
      startingMethod: 'blocks',
      footwear: 'spikes',
      wind: { type: 'measured', measuredMetersPerSecond: -0.4 },
    },
  ],
  actualWeight: null,
  actualDistance: 120,
  modificationReason: 'fatigue',
  notes: 'Kept the final two starts smooth rather than forcing them.',
} satisfies ExerciseResult;

export const sampleTrainingLog = {
  id: 'training-log-2026-07-24',
  athleteId: sampleAthleteProfile.id,
  scheduledWorkoutId: sampleScheduledWorkout.id,
  workoutId: sampleWorkout.id,
  plannedWorkout: sampleWorkout,
  date: '2026-07-24',
  startedAt: '2026-07-24T23:30:00.000Z',
  completedAt: '2026-07-25T00:48:00.000Z',
  completionStatus: 'completed-with-modifications',
  sessionRpe: 7,
  readiness: sampleReadinessCheck,
  exerciseResults: [sampleExerciseResult],
  surface: 'track',
  weather: {
    type: 'clear',
    temperatureCelsius: 24,
    humidityPercent: 45,
    notes: 'Dry track.',
  },
  wind: { type: 'measured', measuredMetersPerSecond: -0.4 },
  footwear: 'spikes',
  bodyWeight: 72.4,
  generalNotes: 'Acceleration quality stayed consistent across the session.',
  createdAt: '2026-07-25T00:50:00.000Z',
  updatedAt: '2026-07-25T00:50:00.000Z',
} satisfies TrainingLog;

export const sampleWeeklyPlan = {
  id: 'weekly-plan-2026-07-20',
  athleteId: sampleAthleteProfile.id,
  weekStartDate: '2026-07-20',
  pathway: '100m',
  seasonPhase: 'specific-preparation',
  scheduledWorkouts: [sampleScheduledWorkout],
  notes: 'Prioritize quality acceleration and keep Sunday as the planned rest day.',
} satisfies WeeklyPlan;

export const sampleDomainData = {
  athleteProfile: sampleAthleteProfile,
  exercise: sampleExercise,
  workoutSection: sampleWorkoutSection,
  workout: sampleWorkout,
  scheduledWorkout: sampleScheduledWorkout,
  exerciseResult: sampleExerciseResult,
  readinessCheck: sampleReadinessCheck,
  trainingLog: sampleTrainingLog,
  weeklyPlan: sampleWeeklyPlan,
  footballAthleteProfile: sampleFootballAthleteProfile,
  soccerAthleteProfile: sampleSoccerAthleteProfile,
  basketballAthleteProfile: sampleBasketballAthleteProfile,
  generalAthleteProfile: sampleGeneralAthleteProfile,
};
