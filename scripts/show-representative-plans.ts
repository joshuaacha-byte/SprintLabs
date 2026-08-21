// TEMPORARY AUDIT TOOLING — prints complete generated weeks for 5 representative athletes by
// calling the real production buildDeterministicWeeklyPlan() + starterWorkoutLibrary directly.
// Read-only; does not modify plan-generation behavior. See PLAN_ENGINE_QA_REPORT.md.
//
// Run: node --experimental-strip-types --loader ./scripts/alias-loader.mjs ./scripts/show-representative-plans.ts
import { starterWorkoutLibrary } from '../data/workout-library.ts';
import { sampleAthleteProfile } from '../data/domain-samples.ts';
import { buildDeterministicWeeklyPlan } from '../utils/plan-selector.ts';
import type { AthleteProfile } from '../types/index.ts';

const workoutById = new Map(starterWorkoutLibrary.map(w => [w.id, w]));

function profileFor(overrides: Partial<AthleteProfile>): AthleteProfile {
  return {
    ...(sampleAthleteProfile as AthleteProfile),
    id: 'representative-profile',
    availableTrainingDays: [],
    exactTrainingDaysPreference: undefined,
    preferredRestDay: 'sunday',
    preferredRestDayAnswered: true,
    sportPracticeDays: [],
    otherSportDays: [],
    gameOrCompetitionDays: [],
    busySchoolDays: [],
    currentPain: false,
    raceDevelopmentAreas: [],
    speedGoals: [],
    trainingPlanMode: 'build-my-plan',
    trainingPlanModeAnswered: true,
    loggingOnlyMode: false,
    seasonPhaseOverride: {
      phase: 'general-preparation',
      reason: 'Representative plan printout.',
      setBy: 'prototype-editor',
      expiresOn: '2099-12-31',
    },
    ...overrides,
  };
}

function show(title: string, profile: AthleteProfile) {
  const result = buildDeterministicWeeklyPlan(profile, starterWorkoutLibrary);
  console.log(`\n${'='.repeat(90)}\n${title}\n${'='.repeat(90)}`);
  if (result.status !== 'ready') {
    console.log(`STATUS: ${result.status} — ${result.message}`);
    return;
  }
  console.log(`Summary: ${result.summary}`);
  result.suggestions.forEach(s => {
    const primary = workoutById.get(s.workoutId);
    console.log(`\n${s.weeklyRole} — ${primary?.name ?? s.workoutId} [${s.workoutId}]`);
    console.log(`  Category: ${primary?.primaryCategory} | Load class: ${s.loadClass}`);
    if (s.supportWorkoutIds.length) {
      s.supportWorkoutIds.forEach(id => {
        const support = workoutById.get(id);
        console.log(`  Strength pairing: ${support?.name ?? id} [${id}] — ${support?.purpose ?? ''}`);
      });
    } else {
      console.log('  Strength pairing: none');
    }
    console.log(`  Why: ${s.whyThisFits.join(' | ')}`);
  });
}

show('1. Foundation 100m athlete, 3 days', profileFor({
  primarySport: 'track-and-field', sport: 'track-and-field', primaryEvent: '100m',
  experienceLevel: 'beginner', trainingDaysPerWeek: 3,
}));

show('2. Developing 200m athlete, 4 days', profileFor({
  primarySport: 'track-and-field', sport: 'track-and-field', primaryEvent: '200m',
  experienceLevel: 'developing', trainingDaysPerWeek: 4,
}));

show('3. Advanced 100m athlete, 5 days', profileFor({
  primarySport: 'track-and-field', sport: 'track-and-field', primaryEvent: '100m',
  experienceLevel: 'advanced', trainingDaysPerWeek: 5,
}));

show('4. Advanced 200m athlete, 4 days', profileFor({
  primarySport: 'track-and-field', sport: 'track-and-field', primaryEvent: '200m',
  experienceLevel: 'advanced', trainingDaysPerWeek: 4,
}));

show('5. Basketball athlete, general-speed pathway, 4 days', profileFor({
  primarySport: 'basketball', sport: 'basketball', experienceLevel: 'intermediate', trainingDaysPerWeek: 4,
}));
