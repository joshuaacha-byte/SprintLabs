// TEMPORARY AUDIT TOOLING — companion to PLAN_ENGINE_QA_REPORT.md and audit-plan-engine.ts.
// Regression suite for the MVP plan-engine corrections (priority messaging honesty, phase
// periodization disabled, 200m/400m long-sprint routing, strength selection driven by
// level + sprint-session purpose — explicitly NOT by onboarding equipment answers). Previously
// this file deliberately skipped asserting several behaviors because they were known-broken;
// those are now fixed and asserted below.
//
// Run: node --experimental-strip-types --loader ./scripts/alias-loader.mjs ./scripts/verify-plan-engine-audit-regressions.ts
import { starterWorkoutLibrary } from '../data/workout-library.ts';
import { sampleAthleteProfile } from '../data/domain-samples.ts';
import { buildDeterministicWeeklyPlan } from '../utils/plan-selector.ts';
import type { AthleteProfile, LibrarySeasonPhase, SeasonPhase } from '../types/index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`REGRESSION: ${message}`);
}

// utils/season-engine.ts's activeOverride() reads seasonPhaseOverride.phase as the older, narrower
// SeasonPhase union and maps 'championship' -> LibrarySeasonPhase 'taper'; this is the inverse so
// the test can request a specific LibrarySeasonPhase directly (see scripts/audit-plan-engine.ts).
const LIBRARY_PHASE_TO_OVERRIDE_PHASE: Record<LibrarySeasonPhase, SeasonPhase> = {
  'general-preparation': 'general-preparation',
  'specific-preparation': 'specific-preparation',
  'pre-competition': 'pre-competition',
  competition: 'competition',
  taper: 'championship',
  transition: 'transition',
};

function overrideFor(phase: LibrarySeasonPhase) {
  return { phase: LIBRARY_PHASE_TO_OVERRIDE_PHASE[phase], reason: 'Regression test: fixed phase.', setBy: 'prototype-editor' as const, expiresOn: '2099-12-31' };
}

function profileFor(overrides: Partial<AthleteProfile>): AthleteProfile {
  return {
    ...(sampleAthleteProfile as AthleteProfile),
    id: 'regression-profile',
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
    seasonPhaseOverride: overrideFor('general-preparation'),
    ...overrides,
  };
}

function plan(overrides: Partial<AthleteProfile>) {
  return buildDeterministicWeeklyPlan(profileFor(overrides), starterWorkoutLibrary);
}

function consecutiveHighPairs(result: Extract<ReturnType<typeof plan>, { status: 'ready' }>) {
  const byDay = new Map(result.suggestions.map(s => [s.dayIndex, s.loadClass]));
  const order = [1, 2, 3, 4, 5, 6, 0] as const;
  let pairs = 0;
  for (let i = 0; i < order.length; i++) {
    const cur = byDay.get(order[i]);
    const next = byDay.get(order[(i + 1) % order.length]);
    if (cur === 'high' && next === 'high') pairs++;
  }
  return pairs;
}

// 1. No valid onboarding combination returns no-match because of season phase. Every
// LibrarySeasonPhase, for track and for a representative non-track/non-football sport, must
// stay 'ready' — this is the direct regression test for the MVP's core guarantee.
const ALL_PHASES: LibrarySeasonPhase[] = ['general-preparation', 'specific-preparation', 'pre-competition', 'competition', 'taper', 'transition'];
for (const phase of ALL_PHASES) {
  const track = plan({ primarySport: 'track-and-field', sport: 'track-and-field', trainingDaysPerWeek: 4, seasonPhaseOverride: overrideFor(phase) });
  assert(track.status === 'ready', `Track 4-day plan must never return '${track.status}' due to season phase (phase=${phase}); MVP phase periodization is disabled.`);
  const soccer = plan({ primarySport: 'soccer', sport: 'soccer', trainingDaysPerWeek: 4, seasonPhaseOverride: overrideFor(phase) });
  assert(soccer.status === 'ready', `Soccer 4-day plan must never return '${soccer.status}' due to season phase (phase=${phase}); MVP phase periodization is disabled.`);
}
// A missing calendar (season.phase derives to 'needs-calendar') must not block generation either.
const noCalendar = plan({ primarySport: 'track-and-field', sport: 'track-and-field', trainingDaysPerWeek: 4, seasonPhaseOverride: null, seasonCalendar: { competitionStatus: 'unknown', priorityMeets: [] } });
assert(noCalendar.status === 'ready', `A missing season calendar must not block MVP generation, got '${noCalendar.status}'.`);

// 2. Every ready result has the requested number of days, across all onboarding-offered counts.
for (const trainingDaysPerWeek of [2, 3, 4, 5]) {
  const result = plan({ primarySport: 'track-and-field', sport: 'track-and-field', trainingDaysPerWeek });
  assert(result.status === 'ready', `${trainingDaysPerWeek}-day track plan must be ready, got ${result.status}.`);
  assert(result.suggestions.length === trainingDaysPerWeek, `${trainingDaysPerWeek}-day track plan scheduled ${result.status === 'ready' ? result.suggestions.length : 'n/a'} days.`);
}

// 3. No duplicate workout IDs within a week (primary or paired support), across every sport at 5
// days/advanced — the scenario most likely to reuse a strength record under the old hardcoded
// STR-01/STR-02 alternation.
for (const sport of ['track-and-field', 'football', 'soccer', 'basketball', 'baseball', 'general-athletic-performance'] as const) {
  const result = plan({ primarySport: sport, sport, trainingDaysPerWeek: 5, experienceLevel: 'advanced' });
  assert(result.status === 'ready', `${sport} 5-day advanced plan must be ready, got ${result.status}.`);
  const ids = result.suggestions.flatMap(s => [s.workoutId, ...s.supportWorkoutIds]);
  assert(new Set(ids).size === ids.length, `${sport} 5-day advanced plan contains a duplicate workout ID: ${ids.join(', ')}.`);
}

// 4. No consecutive high-intensity days, across every phase now that all of them stay 'ready'
// (this is the property the audit's original 390-run sweep already found held everywhere).
for (const phase of ALL_PHASES) {
  const result = plan({ primarySport: 'track-and-field', sport: 'track-and-field', trainingDaysPerWeek: 5, seasonPhaseOverride: overrideFor(phase) });
  assert(result.status === 'ready', `Track 5-day plan must be ready in ${phase}.`);
  assert(consecutiveHighPairs(result) === 0, `Track 5-day plan in ${phase} scheduled two 'high' load-class days back to back.`);
}

// 5. 200m must differ meaningfully from 100m at equal experience/day inputs, and must be able to
// select existing longer/curve-oriented long-sprint records (not just differ trivially).
{
  const track100 = plan({ primarySport: 'track-and-field', sport: 'track-and-field', primaryEvent: '100m', trainingDaysPerWeek: 4, experienceLevel: 'intermediate' });
  const track200 = plan({ primarySport: 'track-and-field', sport: 'track-and-field', primaryEvent: '200m', trainingDaysPerWeek: 4, experienceLevel: 'intermediate' });
  assert(track100.status === 'ready' && track200.status === 'ready', '100m and 200m 4-day plans must both be ready.');
  const ids100 = track100.status === 'ready' ? track100.suggestions.map(s => s.workoutId).join('|') : '';
  const ids200 = track200.status === 'ready' ? track200.suggestions.map(s => s.workoutId).join('|') : '';
  assert(ids100 !== ids200, `100m and 200m must not produce identical workout-ID signatures. Both got: ${ids100}`);
  assert(
    track200.status === 'ready' && track200.suggestions.map(s => s.workoutId).some(id => id === 'ACC-04' || id === 'TEM-02' || id === 'MAX-05' || id === 'SED-05'),
    '200m must be able to select an existing long-sprint/curve-oriented record (ACC-04/TEM-02/MAX-05/SED-05) via the long-sprint architecture branch.',
  );
  // Correct day count and high/low ordering remain intact for 200m specifically.
  assert(track200.status === 'ready' && track200.suggestions.length === 4, '200m 4-day plan must schedule exactly 4 days.');
  assert(track200.status === 'ready' && consecutiveHighPairs(track200) === 0, '200m 4-day plan must not schedule consecutive high-intensity days.');
}

// 6. Representative trained/advanced plans can select STR-04 and STR-05 — the two strength
// records the old hardcoded STR-01/STR-02 alternation made permanently unreachable.
{
  const advancedFiveDay = plan({ primarySport: 'track-and-field', sport: 'track-and-field', trainingDaysPerWeek: 5, experienceLevel: 'advanced' });
  assert(advancedFiveDay.status === 'ready', 'Advanced 5-day track plan must be ready.');
  const strengthIds = advancedFiveDay.status === 'ready' ? advancedFiveDay.suggestions.flatMap(s => s.supportWorkoutIds) : [];
  assert(strengthIds.includes('STR-04') || strengthIds.includes('STR-05'), `Advanced 5-day track plan must select STR-04 and/or STR-05 at least once. Got: ${strengthIds.join(', ')}`);
}

// 7. Equipment availability must NOT change the generated base plan. Two profiles identical
// except for weight-room/home-equipment answers must produce the byte-identical plan — STR-03
// remains an approved record (still eligible, still selectable via duplicate-avoidance fallback
// once STR-04/01 are already used elsewhere) but is never auto-selected based on equipment.
{
  const noEquipment = plan({
    primarySport: 'track-and-field', sport: 'track-and-field', trainingDaysPerWeek: 4, experienceLevel: 'advanced',
    weightRoomAccess: 'none', homeEquipment: ['none'],
  });
  const fullEquipment = plan({
    primarySport: 'track-and-field', sport: 'track-and-field', trainingDaysPerWeek: 4, experienceLevel: 'advanced',
    weightRoomAccess: 'regular', homeEquipment: ['dumbbells', 'resistance-band', 'kettlebell'],
  });
  assert(noEquipment.status === 'ready' && fullEquipment.status === 'ready', 'Both equipment-variant plans must be ready.');
  assert(
    noEquipment.status === 'ready' && fullEquipment.status === 'ready'
    && noEquipment.suggestions.map(s => s.workoutId).join('|') === fullEquipment.suggestions.map(s => s.workoutId).join('|')
    && noEquipment.suggestions.flatMap(s => s.supportWorkoutIds).join('|') === fullEquipment.suggestions.flatMap(s => s.supportWorkoutIds).join('|'),
    'A no-equipment profile and a fully-equipped profile must produce the identical base plan — equipment must not customize base-plan generation.',
  );
  const strengthIds = noEquipment.status === 'ready' ? noEquipment.suggestions.flatMap(s => s.supportWorkoutIds) : [];
  assert(strengthIds.every(id => id.startsWith('STR-')), `Advanced track strength pairings must come from the STR-* family regardless of equipment, got: ${strengthIds.join(', ')}`);
}

// 8. Priority values remain stored correctly even though they intentionally do not restructure
// the MVP plan — buildDeterministicWeeklyPlan must not read, mutate, or drop them, and two
// profiles differing only in priorities must produce the identical plan (proving they're inert
// to generation, per PLAN_ENGINE_QA_REPORT.md Critical #1, while still round-tripping on the
// profile object itself).
{
  const withPriorityA = profileFor({
    primarySport: 'track-and-field', sport: 'track-and-field', trainingDaysPerWeek: 4,
    raceDevelopmentAreas: ['start-and-first-30'], speedGoals: ['acceleration', 'first-step-quickness'],
  });
  const withPriorityB = profileFor({
    primarySport: 'track-and-field', sport: 'track-and-field', trainingDaysPerWeek: 4,
    raceDevelopmentAreas: ['speed-endurance'], speedGoals: ['speed-endurance'],
  });
  assert(withPriorityA.raceDevelopmentAreas?.join(',') === 'start-and-first-30', 'Priority A profile must store its raceDevelopmentAreas untouched.');
  assert(withPriorityA.speedGoals?.join(',') === 'acceleration,first-step-quickness', 'Priority A profile must store its speedGoals untouched.');
  const resultA = buildDeterministicWeeklyPlan(withPriorityA, starterWorkoutLibrary);
  const resultB = buildDeterministicWeeklyPlan(withPriorityB, starterWorkoutLibrary);
  assert(resultA.status === 'ready' && resultB.status === 'ready', 'Both priority-variant plans must be ready.');
  // The stored fields on the input profile are untouched by generation (same reference, same values).
  assert(withPriorityA.raceDevelopmentAreas?.join(',') === 'start-and-first-30', 'Priority fields must not be mutated by buildDeterministicWeeklyPlan.');
  assert(
    resultA.status === 'ready' && resultB.status === 'ready'
    && resultA.suggestions.map(s => s.workoutId).join('|') === resultB.suggestions.map(s => s.workoutId).join('|'),
    'Two profiles differing only in stored priorities must produce the identical MVP plan — priorities are saved but do not restructure generation.',
  );
}

console.log('All plan-engine audit regression checks passed.');
