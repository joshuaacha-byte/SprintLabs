import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  sampleAthleteProfile,
  sampleFootballAthleteProfile,
  sampleGeneralAthleteProfile,
} from '../../../data/domain-samples.ts';
import { starterWorkoutLibrary } from '../../../data/workout-library.ts';
import type {
  AthleteExperienceLevel,
  AthleteProfile,
  TrainingDay,
} from '../../../types/index.ts';
import { buildDeterministicWeeklyPlan } from '../../../utils/plan-selector.ts';
import {
  isRecommendationEligible,
  validateWorkoutForApproval,
} from '../../../utils/workout-library.ts';

const threeDays: TrainingDay[] = ['monday', 'wednesday', 'friday'];
const fiveDays: TrainingDay[] = ['monday', 'tuesday', 'wednesday', 'friday', 'saturday'];

const generalPreparationOverride = {
  phase: 'general-preparation' as const,
  reason: 'V3 implementation audit',
  setBy: 'prototype-editor' as const,
  expiresOn: '2099-12-31',
};

const competitionOverride = {
  phase: 'competition' as const,
  reason: 'V3 implementation audit',
  setBy: 'prototype-editor' as const,
  expiresOn: '2099-12-31',
};

function common(
  base: AthleteProfile,
  id: string,
  experienceLevel: AthleteExperienceLevel,
  days: TrainingDay[],
): AthleteProfile {
  return {
    ...base,
    id,
    experienceLevel,
    trainingDaysPerWeek: days.length,
    availableTrainingDays: days,
    exactTrainingDaysPreference: true,
    preferredRestDay: 'sunday',
    preferredRestDayAnswered: true,
    sportPracticeDays: [],
    gameOrCompetitionDays: [],
    otherSportDays: [],
    busySchoolDays: [],
    currentPain: false,
    returningAfterTimeOff: false,
    trainingContext: 'offseason',
    seasonPhaseOverride: generalPreparationOverride,
    loggingOnlyMode: false,
    trainingPlanMode: 'build-my-plan',
    trainingPlanModeAnswered: true,
  };
}

function trackProfile(
  pathway: '60m/100m' | '200m/400m',
  experienceLevel: AthleteExperienceLevel,
  days: TrainingDay[],
) {
  const short = pathway === '60m/100m';
  return {
    ...common(
      sampleAthleteProfile,
      `audit-${pathway}-${experienceLevel}-${days.length}`,
      experienceLevel,
      days,
    ),
    sport: 'track-and-field',
    primarySport: 'track-and-field',
    sports: ['track-and-field'],
    primaryEvent: short ? '100m' : '400m',
    secondaryEvents: short ? ['60m'] : ['200m'],
    trackProfile: {
      primaryEvent: short ? '100m' : '400m',
      secondaryEvents: short ? ['60m'] : ['200m'],
      personalBests: [],
      blockStartExperience: 'beginner',
      nextMeetDate: null,
      championshipDate: null,
    },
  } satisfies AthleteProfile;
}

function footballProfile(experienceLevel: AthleteExperienceLevel, days: TrainingDay[]) {
  return {
    ...common(
      sampleFootballAthleteProfile,
      `audit-football-${experienceLevel}-${days.length}`,
      experienceLevel,
      days,
    ),
    sport: 'football',
    primarySport: 'football',
    sports: ['football'],
    footballProfile: {
      ...sampleFootballAthleteProfile.footballProfile,
      combineDate: undefined,
    },
  } satisfies AthleteProfile;
}

function generalProfile(experienceLevel: AthleteExperienceLevel, days: TrainingDay[]) {
  return {
    ...common(
      sampleGeneralAthleteProfile,
      `audit-general-${experienceLevel}-${days.length}`,
      experienceLevel,
      days,
    ),
    sport: 'general-athletic-performance',
    primarySport: 'general-athletic-performance',
    sports: ['general-athletic-performance'],
  } satisfies AthleteProfile;
}

const pathwayBuilders: Record<
  '60m/100m' | '200m/400m' | 'Football/40-Yard' | 'General Speed',
  (level: AthleteExperienceLevel, days: TrainingDay[]) => AthleteProfile
> = {
  '60m/100m': (level: AthleteExperienceLevel, days: TrainingDay[]) =>
    trackProfile('60m/100m', level, days),
  '200m/400m': (level: AthleteExperienceLevel, days: TrainingDay[]) =>
    trackProfile('200m/400m', level, days),
  'Football/40-Yard': footballProfile,
  'General Speed': generalProfile,
};

type PathwayName = keyof typeof pathwayBuilders;

type Scenario = {
  name: string;
  pathway: PathwayName;
  level: AthleteExperienceLevel;
  days: TrainingDay[];
  readiness?: 'normal' | 'reduced';
  context?: 'general-preparation' | 'competition';
  mutate?: (profile: AthleteProfile) => AthleteProfile;
};

const scenarios: Scenario[] = [];

for (const pathway of Object.keys(pathwayBuilders) as PathwayName[]) {
  scenarios.push(
    {
      name: `Beginner ${pathway} — 3 days`,
      pathway,
      level: 'beginner',
      days: threeDays,
    },
    {
      name: `Beginner ${pathway} — 5 days`,
      pathway,
      level: 'beginner',
      days: fiveDays,
    },
    {
      name: `Trained ${pathway} — 3 days`,
      pathway,
      level: 'intermediate',
      days: threeDays,
    },
    {
      name: `Trained ${pathway} — 5 days`,
      pathway,
      level: 'intermediate',
      days: fiveDays,
    },
    {
      name: `Advanced ${pathway} — 5 days`,
      pathway,
      level: 'advanced',
      days: fiveDays,
    },
    {
      name: `Reduced-readiness advanced ${pathway} — 5 days`,
      pathway,
      level: 'advanced',
      days: fiveDays,
      readiness: 'reduced',
      mutate: profile => ({
        ...profile,
        currentPain: true,
        onboardingLimitations: ['hamstring-sensitivity'],
      }),
    },
  );
}

scenarios.push(
  {
    name: 'Competition 60m/100m — 3 days',
    pathway: '60m/100m',
    level: 'intermediate',
    days: threeDays,
    context: 'competition',
    mutate: profile => ({
      ...profile,
      seasonPhaseOverride: competitionOverride,
    }),
  },
  {
    name: 'Competition 200m/400m — 3 days',
    pathway: '200m/400m',
    level: 'intermediate',
    days: threeDays,
    context: 'competition',
    mutate: profile => ({
      ...profile,
      seasonPhaseOverride: competitionOverride,
    }),
  },
  {
    name: 'In-season Football with Tue/Thu practices and Sat game',
    pathway: 'Football/40-Yard',
    level: 'intermediate',
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
    context: 'competition',
    mutate: profile => ({
      ...profile,
      seasonPhaseOverride: competitionOverride,
      trainingContext: 'in-season',
      sportPracticeDays: ['tuesday', 'thursday'],
      gameOrCompetitionDays: ['saturday'],
    }),
  },
  {
    name: 'In-season General Speed with Tue/Thu practices and Sat game',
    pathway: 'General Speed',
    level: 'intermediate',
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
    context: 'competition',
    mutate: profile => ({
      ...profile,
      seasonPhaseOverride: competitionOverride,
      trainingContext: 'in-season',
      sportPracticeDays: ['tuesday', 'thursday'],
      gameOrCompetitionDays: ['saturday'],
    }),
  },
);

function compactItem(item: {
  id: string;
  name: string;
  sets?: number;
  reps?: number;
  distanceMeters?: number;
  fastZoneMeters?: number;
  durationSeconds?: number;
  intensity?: unknown;
  recovery?: unknown;
  coachingCues: string[];
  notes?: string;
  countsTowardSprintVolume: boolean;
  countsTowardHighIntensityVolume: boolean;
}) {
  return { ...item };
}

const inventory = starterWorkoutLibrary.map(workout => ({
  ...workout,
  recommendationEligible: isRecommendationEligible(workout),
  approvalErrors: validateWorkoutForApproval(workout),
  sections: Object.fromEntries(
    Object.entries(workout.sections).map(([key, section]) => [
      key,
      { ...section, items: section.items.map(compactItem) },
    ]),
  ),
}));

const outputs = scenarios.map(scenario => {
  let profile = pathwayBuilders[scenario.pathway](scenario.level, scenario.days);
  if (scenario.mutate) profile = scenario.mutate(profile);
  const result = buildDeterministicWeeklyPlan(profile, starterWorkoutLibrary);
  return {
    scenario: {
      name: scenario.name,
      pathway: scenario.pathway,
      level: scenario.level,
      days: scenario.days,
      readiness: scenario.readiness ?? 'normal',
      context: scenario.context ?? 'general-preparation',
    },
    profileInputs: {
      primaryEvent: profile.primaryEvent,
      sport: profile.primarySport ?? profile.sport,
      trainingDaysPerWeek: profile.trainingDaysPerWeek,
      availableTrainingDays: profile.availableTrainingDays,
      preferredRestDay: profile.preferredRestDay,
      practiceDays: profile.sportPracticeDays,
      competitionDays: profile.gameOrCompetitionDays,
      currentPain: profile.currentPain,
      trainingContext: profile.trainingContext,
      seasonPhaseOverride: profile.seasonPhaseOverride,
    },
    result,
  };
});

const output = {
  generatedAt: new Date().toISOString(),
  librarySummary: {
    total: inventory.length,
    approved: inventory.filter(workout => workout.approvalStatus === 'approved').length,
    eligible: inventory.filter(workout => workout.recommendationEligible).length,
    draft: inventory.filter(workout => workout.approvalStatus === 'draft').length,
    archived: inventory.filter(workout => workout.approvalStatus === 'archived').length,
    approvedWithValidationErrors: inventory.filter(
      workout => workout.approvalStatus === 'approved' && workout.approvalErrors.length,
    ).map(workout => ({ id: workout.id, errors: workout.approvalErrors })),
  },
  inventory,
  scenarios: outputs,
};

writeFileSync(
  resolve(process.cwd(), 'docs/v3/build/v3-audit-data.json'),
  `${JSON.stringify(output, null, 2)}\n`,
);

console.log(`Wrote ${outputs.length} scenarios and ${inventory.length} library records.`);
