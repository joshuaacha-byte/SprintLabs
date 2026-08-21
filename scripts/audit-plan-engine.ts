// TEMPORARY AUDIT TOOLING — see PLAN_ENGINE_QA_REPORT.md.
// Calls the actual production deterministic plan selector (utils/plan-selector.ts) with the
// actual production workout library (data/workout-library.ts) across every valid onboarding
// combination reachable through app/profile.tsx. Does not reimplement or approximate selection
// logic. Read-only: never touches AsyncStorage, never mutates plan-generation source.
//
// Run: node --experimental-strip-types --loader ./scripts/alias-loader.mjs ./scripts/audit-plan-engine.ts
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { starterWorkoutLibrary } from '../data/workout-library.ts';
import { weekdayLabels } from '../data/workouts.ts';
import { sampleAthleteProfile } from '../data/domain-samples.ts';
import { buildDeterministicWeeklyPlan, type SuggestedPlanDay, type WeeklyPlanSuggestion } from '../utils/plan-selector.ts';
import { isRecommendationEligible } from '../utils/workout-library.ts';
import type { AthleteProfile, AthleteExperienceLevel, AthleteSport, LibrarySeasonPhase, LibraryWorkout, RaceDevelopmentArea, SeasonPhase, SpeedGoal, SprintEvent, WeekdayIndex } from '../types/index.ts';

// utils/season-engine.ts's activeOverride() reads AthleteProfile.seasonPhaseOverride.phase as the
// (older, narrower) SeasonPhase union, then maps it onto the LibrarySeasonPhase the plan selector
// actually uses — 'championship' maps to 'taper', 'offseason' maps to 'general-preparation'.
// This is the inverse mapping so the harness can request a specific LibrarySeasonPhase directly.
const LIBRARY_PHASE_TO_OVERRIDE_PHASE: Record<LibrarySeasonPhase, SeasonPhase> = {
  'general-preparation': 'general-preparation',
  'specific-preparation': 'specific-preparation',
  'pre-competition': 'pre-competition',
  competition: 'competition',
  taper: 'championship',
  transition: 'transition',
};

// ---------------------------------------------------------------------------------------------
// 1. Onboarding option catalogue — copied 1:1 from app/profile.tsx's actual UI arrays, not
//    invented, not from earlier discussion. Any type-union member NOT listed here is a value the
//    onboarding UI never actually produces and is reported separately as unreachable.
// ---------------------------------------------------------------------------------------------

// app/profile.tsx: sports[] (the sport-selection screen). 'baseball' is the single stored value
// for the UI's "Baseball / softball" combined option — 'softball' itself is never producible.
const ONBOARDING_SPORTS: AthleteSport[] = [
  'track-and-field', 'football', 'soccer', 'basketball', 'baseball', 'general-athletic-performance', 'other',
];
const UNREACHABLE_SPORTS: AthleteSport[] = ['softball'];

// app/profile.tsx: events[] (the track event-selection screen, track-and-field only).
const ONBOARDING_TRACK_EVENTS: SprintEvent[] = ['60m', '100m', '200m', '400m'];

// app/profile.tsx: ExperienceStep options[]. 'elite' exists on the AthleteExperienceLevel type
// but the onboarding UI never offers it.
const ONBOARDING_EXPERIENCE_LEVELS: AthleteExperienceLevel[] = ['beginner', 'developing', 'intermediate', 'advanced'];
const UNREACHABLE_EXPERIENCE_LEVELS: AthleteExperienceLevel[] = ['elite'];

// app/profile.tsx: FrequencyStep options[].
const ONBOARDING_DAY_COUNTS = [2, 3, 4, 5] as const;

// app/profile.tsx: raceAreas[] (track-only "Where do you lose your races?" screen). Up to 2,
// except 'unsure' which is exclusive of everything else.
const RACE_AREAS: { value: RaceDevelopmentArea; goals: SpeedGoal[] }[] = [
  { value: 'start-and-first-30', goals: ['acceleration', 'first-step-quickness'] },
  { value: 'transition-to-upright', goals: ['acceleration', 'maximum-velocity'] },
  { value: 'maximum-velocity', goals: ['maximum-velocity'] },
  { value: 'curve-running', goals: ['track-race-performance'] },
  { value: 'speed-endurance', goals: ['speed-endurance'] },
  { value: 'race-distribution', goals: ['track-race-performance'] },
  { value: 'finish-under-fatigue', goals: ['speed-endurance'] },
  { value: 'unsure', goals: ['track-race-performance'] },
];

// app/profile.tsx: SPORT_GOAL_ORDER / DEFAULT_GOAL_ORDER (the non-track "What do you want to
// improve most?" screen). Up to 2, except 'general-speed-development' which is exclusive.
const SPORT_GOAL_ORDER: Partial<Record<AthleteSport, SpeedGoal[]>> = {
  football: ['first-step-quickness', 'acceleration', 'maximum-velocity', 'repeated-sprint-ability'],
  basketball: ['first-step-quickness', 'acceleration', 'repeated-sprint-ability', 'multidirectional-speed', 'explosive-power'],
  soccer: ['first-step-quickness', 'acceleration', 'repeated-sprint-ability', 'multidirectional-speed', 'explosive-power'],
  baseball: ['first-step-quickness', 'acceleration', 'maximum-velocity', 'explosive-power'],
};
const DEFAULT_GOAL_ORDER: SpeedGoal[] = ['first-step-quickness', 'acceleration', 'maximum-velocity', 'speed-endurance', 'general-speed-development'];
function speedGoalOptionsFor(sport: AthleteSport): SpeedGoal[] {
  return SPORT_GOAL_ORDER[sport] ?? DEFAULT_GOAL_ORDER;
}

const PHASES: LibrarySeasonPhase[] = ['general-preparation', 'specific-preparation', 'pre-competition', 'competition', 'taper', 'transition'];

// ---------------------------------------------------------------------------------------------
// 2. Combination generators
// ---------------------------------------------------------------------------------------------
function pairs<T>(values: T[]): [T, T][] {
  const out: [T, T][] = [];
  for (let i = 0; i < values.length; i++) for (let j = i + 1; j < values.length; j++) out.push([values[i], values[j]]);
  return out;
}

type PriorityCombo = { label: string; raceDevelopmentAreas?: RaceDevelopmentArea[]; speedGoals: SpeedGoal[] };

function trackPriorityCombos(): PriorityCombo[] {
  const nonUnsure = RACE_AREAS.filter(a => a.value !== 'unsure');
  const combos: PriorityCombo[] = RACE_AREAS.map(a => ({
    label: a.value,
    raceDevelopmentAreas: [a.value],
    speedGoals: [...new Set(a.goals)].slice(0, 3),
  }));
  pairs(nonUnsure).forEach(([a, b]) => combos.push({
    label: `${a.value}+${b.value}`,
    raceDevelopmentAreas: [a.value, b.value],
    speedGoals: [...new Set([...a.goals, ...b.goals])].slice(0, 3),
  }));
  return combos;
}

function nonTrackPriorityCombos(sport: AthleteSport): PriorityCombo[] {
  const options = speedGoalOptionsFor(sport);
  const specific = options.filter(g => g !== 'general-speed-development');
  const combos: PriorityCombo[] = specific.map(g => ({ label: g, speedGoals: [g] }));
  pairs(specific).forEach(([a, b]) => combos.push({ label: `${a}+${b}`, speedGoals: [a, b] }));
  if (options.includes('general-speed-development')) {
    combos.push({ label: 'general-speed-development', speedGoals: ['general-speed-development'] });
  }
  return combos;
}

// ---------------------------------------------------------------------------------------------
// 3. Profile construction — mirrors exactly what app/profile.tsx writes for each answer,
//    starting from the same production sample profile used by scripts/verify-plan-pathways.ts.
//    No days are blocked by practice/games/school so the requested day count is always reachable
//    unless the engine itself decides otherwise — isolating the plan engine as the variable.
// ---------------------------------------------------------------------------------------------
type ProfileInputs = {
  sport: AthleteSport;
  event?: SprintEvent;
  experienceLevel: AthleteExperienceLevel;
  trainingDaysPerWeek: number;
  phase: LibrarySeasonPhase;
  priority: PriorityCombo;
};

function buildProfile(inputs: ProfileInputs): AthleteProfile {
  const now = new Date().toISOString();
  const base: AthleteProfile = {
    ...(sampleAthleteProfile as AthleteProfile),
    id: 'audit-profile',
    primarySport: inputs.sport,
    sport: inputs.sport,
    sports: [inputs.sport],
    primarySportAnswered: true,
    primaryEvent: inputs.sport === 'track-and-field' ? (inputs.event ?? '100m') : (sampleAthleteProfile.primaryEvent as SprintEvent),
    secondaryEvents: [],
    experienceLevel: inputs.experienceLevel,
    experienceAnswered: true,
    trainingDaysPerWeek: inputs.trainingDaysPerWeek,
    availableTrainingDays: [],
    exactTrainingDaysPreference: undefined,
    preferredRestDay: 'sunday',
    preferredRestDayAnswered: true,
    sportPracticeDays: [],
    otherSportDays: [],
    gameOrCompetitionDays: [],
    busySchoolDays: [],
    currentPain: false,
    trainingContext: 'general-development',
    speedGoals: inputs.priority.speedGoals,
    raceDevelopmentAreas: inputs.priority.raceDevelopmentAreas ?? [],
    trainingPlanMode: 'build-my-plan',
    trainingPlanModeAnswered: true,
    loggingOnlyMode: false,
    seasonPhaseOverride: {
      phase: LIBRARY_PHASE_TO_OVERRIDE_PHASE[inputs.phase],
      reason: 'Plan-engine audit: fixed phase to isolate the variable under test.',
      setBy: 'prototype-editor',
      expiresOn: '2099-12-31',
    },
    updatedAt: now,
  };
  return base;
}

// ---------------------------------------------------------------------------------------------
// 4. Running one combination and extracting a comparable, machine-readable record
// ---------------------------------------------------------------------------------------------
type DayRecord = {
  dayIndex: WeekdayIndex;
  day: string;
  kind: 'workout' | 'rest';
  weeklyRole?: string;
  loadClass?: string;
  targetCategory?: string;
  workoutId?: string;
  workoutName?: string;
  actualCategory?: string;
  supportWorkoutIds?: string[];
  durationMinutes?: number;
};

type ComboResult = {
  comboId: string;
  dimension: 'core' | 'priority' | 'phase';
  inputs: ProfileInputs & { priorityLabel: string };
  storedValues: Record<string, unknown>;
  status: WeeklyPlanSuggestion['status'];
  message?: string;
  reasons?: string[];
  scheduledDayCount: number;
  highCount: number;
  lowCount: number;
  moderateCount: number;
  days: DayRecord[];
  duplicateWorkoutIds: string[];
  categoryFallbackDays: string[]; // days where the returned workout's own primaryCategory != the slot's requested targetCategory
  consecutiveHighPairs: number;
  totalWeeklyDurationMinutes: number;
  workoutIdSignature: string; // ordered list of workoutId(+support) per scheduled day, for equivalence clustering
  categorySignature: string; // ordered list of targetCategory per scheduled day
  alternativeWorkoutIds: string[]; // workouts shown as swap options, even if never the default pick
};

const workoutById = new Map<string, LibraryWorkout>(starterWorkoutLibrary.map(w => [w.id, w]));

function runCombo(comboId: string, dimension: ComboResult['dimension'], inputs: ProfileInputs): ComboResult {
  const profile = buildProfile(inputs);
  const result = buildDeterministicWeeklyPlan(profile, starterWorkoutLibrary);

  const storedValues = {
    primarySport: profile.primarySport,
    primaryEvent: profile.sport === 'track-and-field' ? profile.primaryEvent : undefined,
    experienceLevel: profile.experienceLevel,
    trainingDaysPerWeek: profile.trainingDaysPerWeek,
    seasonPhaseOverride: profile.seasonPhaseOverride?.phase,
    raceDevelopmentAreas: profile.raceDevelopmentAreas,
    speedGoals: profile.speedGoals,
  };

  if (result.status !== 'ready') {
    return {
      comboId,
      dimension,
      inputs: { ...inputs, priorityLabel: inputs.priority.label },
      storedValues,
      status: result.status,
      message: result.message,
      reasons: 'reasons' in result ? result.reasons : undefined,
      scheduledDayCount: 0,
      highCount: 0,
      lowCount: 0,
      moderateCount: 0,
      days: [],
      duplicateWorkoutIds: [],
      categoryFallbackDays: [],
      consecutiveHighPairs: 0,
      totalWeeklyDurationMinutes: 0,
      workoutIdSignature: '',
      categorySignature: '',
      alternativeWorkoutIds: [],
    };
  }

  const suggestionByDay = new Map(result.suggestions.map(s => [s.dayIndex, s]));
  const orderedDayIndexes: WeekdayIndex[] = [1, 2, 3, 4, 5, 6, 0] as WeekdayIndex[];
  const days: DayRecord[] = orderedDayIndexes.map(dayIndex => {
    const s = suggestionByDay.get(dayIndex);
    if (!s) return { dayIndex, day: weekdayLabels[dayIndex].full, kind: 'rest' };
    const workout = workoutById.get(s.workoutId);
    return {
      dayIndex,
      day: weekdayLabels[dayIndex].full,
      kind: 'workout',
      weeklyRole: s.weeklyRole,
      loadClass: s.loadClass,
      targetCategory: s.targetCategory,
      workoutId: s.workoutId,
      workoutName: workout?.name ?? s.plannedWorkout.title,
      actualCategory: workout?.primaryCategory,
      supportWorkoutIds: s.supportWorkoutIds,
      durationMinutes: s.plannedWorkout.durationMinutes,
    };
  });

  const workoutDays = days.filter(d => d.kind === 'workout');
  const allIds = workoutDays.flatMap(d => [d.workoutId!, ...(d.supportWorkoutIds ?? [])]);
  const seen = new Set<string>();
  const duplicateWorkoutIds: string[] = [];
  allIds.forEach(id => { if (seen.has(id)) duplicateWorkoutIds.push(id); seen.add(id); });

  const categoryFallbackDays = workoutDays
    .filter(d => d.actualCategory && d.targetCategory && d.actualCategory !== d.targetCategory)
    .map(d => `${d.day} (wanted ${d.targetCategory}, got ${d.actualCategory})`);

  let consecutiveHighPairs = 0;
  for (let i = 0; i < orderedDayIndexes.length; i++) {
    const cur = days[i];
    const next = days[(i + 1) % days.length];
    if (cur.kind === 'workout' && next.kind === 'workout' && cur.loadClass === 'high' && next.loadClass === 'high') consecutiveHighPairs++;
  }

  return {
    comboId,
    dimension,
    inputs: { ...inputs, priorityLabel: inputs.priority.label },
    storedValues,
    status: result.status,
    scheduledDayCount: workoutDays.length,
    highCount: workoutDays.filter(d => d.loadClass === 'high').length,
    lowCount: workoutDays.filter(d => d.loadClass === 'low').length,
    moderateCount: workoutDays.filter(d => d.loadClass === 'moderate').length,
    days,
    duplicateWorkoutIds,
    categoryFallbackDays,
    consecutiveHighPairs,
    totalWeeklyDurationMinutes: workoutDays.reduce((sum, d) => sum + (d.durationMinutes ?? 0), 0),
    workoutIdSignature: workoutDays.map(d => `${d.dayIndex}:${d.workoutId}${d.supportWorkoutIds?.length ? '+' + d.supportWorkoutIds.join('+') : ''}`).join('|'),
    categorySignature: workoutDays.map(d => `${d.dayIndex}:${d.targetCategory}(${d.loadClass})`).join('|'),
    alternativeWorkoutIds: [...new Set(result.suggestions.flatMap(s => s.alternatives.map(a => a.workoutId)))],
  };
}

// ---------------------------------------------------------------------------------------------
// 5. Build the full combination set
// ---------------------------------------------------------------------------------------------
const results: ComboResult[] = [];
const NONE_PRIORITY: PriorityCombo = { label: 'none-selected', speedGoals: [] };

// Matrix A — core: sport × (event for track) × experience × dayCount, phase fixed to
// general-preparation, priorities fixed to "none selected" so the core matrix isolates sport,
// event, experience, and day-count as the only variables.
for (const sport of ONBOARDING_SPORTS) {
  const events = sport === 'track-and-field' ? ONBOARDING_TRACK_EVENTS : [undefined];
  for (const event of events) {
    for (const experienceLevel of ONBOARDING_EXPERIENCE_LEVELS) {
      for (const trainingDaysPerWeek of ONBOARDING_DAY_COUNTS) {
        const comboId = `core:${sport}:${event ?? 'na'}:${experienceLevel}:${trainingDaysPerWeek}d`;
        results.push(runCombo(comboId, 'core', {
          sport, event, experienceLevel, trainingDaysPerWeek, phase: 'general-preparation', priority: NONE_PRIORITY,
        }));
      }
    }
  }
}

// Matrix B — priority sensitivity: for each sport (representative event/experience/days), sweep
// every valid priority combination the onboarding UI can actually produce for that sport.
const REP_EXPERIENCE: AthleteExperienceLevel = 'intermediate';
const REP_DAYS = 4;
for (const sport of ONBOARDING_SPORTS) {
  const priorityCombos = sport === 'track-and-field' ? trackPriorityCombos() : nonTrackPriorityCombos(sport);
  const events = sport === 'track-and-field' ? ONBOARDING_TRACK_EVENTS : [undefined];
  for (const event of events) {
    for (const priority of priorityCombos) {
      const comboId = `priority:${sport}:${event ?? 'na'}:${priority.label}`;
      results.push(runCombo(comboId, 'priority', {
        sport, event, experienceLevel: REP_EXPERIENCE, trainingDaysPerWeek: REP_DAYS, phase: 'general-preparation', priority,
      }));
    }
  }
}

// Matrix C — phase sensitivity: for each sport (representative event/experience/days, no
// priorities), sweep every LibrarySeasonPhase the deterministic season engine can select.
for (const sport of ONBOARDING_SPORTS) {
  const events = sport === 'track-and-field' ? ['100m' as SprintEvent] : [undefined];
  for (const event of events) {
    for (const phase of PHASES) {
      const comboId = `phase:${sport}:${event ?? 'na'}:${phase}`;
      results.push(runCombo(comboId, 'phase', {
        sport, event, experienceLevel: REP_EXPERIENCE, trainingDaysPerWeek: REP_DAYS, phase, priority: NONE_PRIORITY,
      }));
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 6. Unreachable-template detection: which Approved library workouts never appear in ANY combo
//    result across the whole matrix.
// ---------------------------------------------------------------------------------------------
const reachedWorkoutIds = new Set<string>();
const alternativeOnlyWorkoutIds = new Set<string>();
results.forEach(r => {
  r.days.forEach(d => {
    if (d.workoutId) reachedWorkoutIds.add(d.workoutId);
    d.supportWorkoutIds?.forEach(id => reachedWorkoutIds.add(id));
  });
  r.alternativeWorkoutIds.forEach(id => alternativeOnlyWorkoutIds.add(id));
});
const approvedWorkouts = starterWorkoutLibrary.filter(isRecommendationEligible);
const unreachedApprovedWorkouts = approvedWorkouts
  .filter(w => !reachedWorkoutIds.has(w.id))
  .map(w => ({
    id: w.id,
    name: w.name,
    primaryCategory: w.primaryCategory,
    athleteLevels: w.athleteLevels,
    seasonPhases: w.seasonPhases,
    sports: w.sports,
    reachableAsAlternativeOnly: alternativeOnlyWorkoutIds.has(w.id),
  }));

// ---------------------------------------------------------------------------------------------
// 7. Write outputs
// ---------------------------------------------------------------------------------------------
const summary = {
  generatedAt: new Date().toISOString(),
  totalCombos: results.length,
  byDimension: {
    core: results.filter(r => r.dimension === 'core').length,
    priority: results.filter(r => r.dimension === 'priority').length,
    phase: results.filter(r => r.dimension === 'phase').length,
  },
  byStatus: {
    ready: results.filter(r => r.status === 'ready').length,
    'coach-managed': results.filter(r => r.status === 'coach-managed').length,
    'unsupported-sport': results.filter(r => r.status === 'unsupported-sport').length,
    'no-match': results.filter(r => r.status === 'no-match').length,
  },
  unreachableOnboardingValues: {
    sports: UNREACHABLE_SPORTS,
    experienceLevels: UNREACHABLE_EXPERIENCE_LEVELS,
  },
  unreachedApprovedWorkoutCount: unreachedApprovedWorkouts.length,
  totalApprovedWorkoutCount: approvedWorkouts.length,
};

writeFileSync(
  path.resolve(import.meta.dirname, '../plan-engine-qa-results.json'),
  JSON.stringify({ summary, unreachedApprovedWorkouts, results }, null, 2),
);

console.log(JSON.stringify(summary, null, 2));
