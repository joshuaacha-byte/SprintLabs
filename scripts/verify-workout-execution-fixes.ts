// Regression checks for the workout-execution/scheduling fixes: the rest-day vs.
// externally-blocked-day distinction restDay() makes in utils/plan-selector.ts. Pure-logic checks
// only (no AsyncStorage-backed persistence — this repo's existing scripts/verify-*.ts convention
// doesn't run against a mocked native module, so session persistence/resume/timer-restoration
// were verified by code-path tracing instead; see the written report).
//
// The rest timer itself is deliberately NOT covered here — it is a manual, athlete-initiated
// duration picker (30s/60s/90s/2min/3min/5min) with no connection to workout-library data, plan
// generation, or exercise completion, so there is nothing plan-engine-side to regression-test.
//
// Run: node --experimental-strip-types --loader ./scripts/alias-loader.mjs ./scripts/verify-workout-execution-fixes.ts
import { starterWorkoutLibrary } from '../data/workout-library.ts';
import { sampleAthleteProfile } from '../data/domain-samples.ts';
import { buildDeterministicWeeklyPlan } from '../utils/plan-selector.ts';
import { OPEN_DAY_RESTTITLE } from '../data/workouts.ts';
import type { AthleteProfile } from '../types/index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`REGRESSION: ${message}`);
}

// restDay() classification: a day skipped purely because it's beyond the athlete's chosen
// weekly frequency must read as an intentional 'Rest day' (restTitle !== OPEN_DAY_RESTTITLE, so
// Today's isIntentionalRestDay() treats it as planned recovery) — never the "something else is
// happening" framing reserved for days genuinely blocked by practice/games/another sport.
function profileFor(overrides: Partial<AthleteProfile>): AthleteProfile {
  return {
    ...(sampleAthleteProfile as AthleteProfile),
    id: 'workout-exec-regression',
    trainingDaysPerWeek: 3,
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
    primarySport: 'track-and-field',
    sport: 'track-and-field',
    seasonPhaseOverride: {
      phase: 'general-preparation',
      reason: 'Regression test.',
      setBy: 'prototype-editor',
      expiresOn: '2099-12-31',
    },
    ...overrides,
  };
}

{
  // 3 training days/week, no team practice, no other-sport days — the 4 non-training days should
  // all be plain intentional rest days, none of them the "external commitment" framing.
  const plan = buildDeterministicWeeklyPlan(profileFor({}), starterWorkoutLibrary);
  assert(plan.status === 'ready', `3-day plan must be ready, got ${plan.status}.`);
  if (plan.status === 'ready') {
    const trainingDays = plan.schedule.filter(day => day.kind === 'workout');
    const restDays = plan.schedule.filter(day => day.kind === 'rest');
    assert(trainingDays.length === 3, `Expected exactly 3 training days, got ${trainingDays.length}.`);
    assert(restDays.length === 4, `Expected exactly 4 rest days, got ${restDays.length}.`);
    assert(
      restDays.every(day => day.restTitle === 'Rest day'),
      `All 4 non-training days for a plain 3-day/week athlete must read 'Rest day', got: ${restDays.map(d => d.restTitle).join(', ')}`,
    );
    assert(restDays.every(day => day.restTitle !== OPEN_DAY_RESTTITLE), 'A plan-driven rest day must never use the OPEN_DAY_RESTTITLE marker (that would make Today treat it as unscheduled/ambiguous instead of intentional rest).');
  }
}

{
  // Same 3-day/week athlete, but with Tuesday/Thursday team practice — those two specific days
  // must keep the "external commitment already happens here" framing, while the athlete's
  // genuinely free non-training days still read as plain intentional rest.
  const plan = buildDeterministicWeeklyPlan(profileFor({ sportPracticeDays: ['tuesday', 'thursday'] }), starterWorkoutLibrary);
  assert(plan.status === 'ready', `3-day plan with practice days must be ready, got ${plan.status}.`);
  if (plan.status === 'ready') {
    const tuesday = plan.schedule.find(day => day.dayIndex === 2);
    const thursday = plan.schedule.find(day => day.dayIndex === 4);
    assert(tuesday?.kind === 'rest' && tuesday.restTitle === OPEN_DAY_RESTTITLE, `Tuesday (team practice) must keep the external-commitment framing, got kind=${tuesday?.kind} restTitle=${tuesday?.restTitle}.`);
    assert(thursday?.kind === 'rest' && thursday.restTitle === OPEN_DAY_RESTTITLE, `Thursday (team practice) must keep the external-commitment framing, got kind=${thursday?.kind} restTitle=${thursday?.restTitle}.`);
    const otherRestDays = plan.schedule.filter(day => day.kind === 'rest' && day.dayIndex !== 2 && day.dayIndex !== 4);
    assert(otherRestDays.every(day => day.restTitle === 'Rest day'), `Non-practice, non-training days must still read 'Rest day', got: ${otherRestDays.map(d => `${d.dayIndex}:${d.restTitle}`).join(', ')}`);
  }
}

console.log('All workout-execution regression checks passed.');
