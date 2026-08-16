import { starterWorkoutLibrary } from '../data/workout-library.ts';
import {
  sampleAthleteProfile,
  sampleBasketballAthleteProfile,
  sampleFootballAthleteProfile,
  sampleSoccerAthleteProfile,
  sampleTrainingLog,
} from '../data/domain-samples.ts';
import type { AthleteProfile } from '../types/index.ts';
import { plannedWorkoutToDomainWorkout } from '../utils/domain-adapters.ts';
import { buildDeterministicWeeklyPlan, type SuggestedPlanDay } from '../utils/plan-selector.ts';
import { workoutToPlannedSnapshot } from '../utils/training-history.ts';
import { applyWeeklyProgressionProposal } from '../utils/weekly-progression.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const override = (phase: 'general-preparation' | 'competition') => ({
  phase,
  reason: 'Automated planner pathway verification',
  setBy: 'prototype-editor' as const,
  expiresOn: '2099-12-31',
});

function plan(profile: AthleteProfile) {
  const result = buildDeterministicWeeklyPlan(profile, starterWorkoutLibrary);
  if (result.status !== 'ready') {
    throw new Error(`${profile.id} failed to produce a plan: ${result.message}`);
  }
  assert(result.suggestions.length > 0, `${profile.id} produced an empty plan.`);
  assert(result.suggestions.every(day => starterWorkoutLibrary.find(workout => workout.id === day.workoutId)?.approvalStatus === 'approved'), `${profile.id} used a non-Approved workout.`);
  assert(new Set(result.suggestions.map(day => day.dayIndex)).size === result.suggestions.length, `${profile.id} scheduled two sessions on one day.`);
  return result;
}

function highCount(days: SuggestedPlanDay[]) {
  return days.filter(day => day.loadClass === 'high').length;
}

const approvedWorkoutIds = new Set(
  starterWorkoutLibrary.filter(workout => workout.approvalStatus === 'approved').map(workout => workout.id),
);
const progressionRecords = starterWorkoutLibrary.filter(workout => workout.progressionWorkoutId);
assert(progressionRecords.length >= 5, 'The approved library must expose authored progression links.');
progressionRecords.forEach(workout => {
  assert(
    approvedWorkoutIds.has(workout.progressionWorkoutId!),
    `${workout.id} progression must point to an Approved workout.`,
  );
});
starterWorkoutLibrary.filter(workout => workout.regressionWorkoutId).forEach(workout => {
  assert(
    approvedWorkoutIds.has(workout.regressionWorkoutId!),
    `${workout.id} regression must point to an Approved workout.`,
  );
});

const shortTrack = plan({
  ...sampleAthleteProfile,
  id: 'verify-track-short',
  primaryEvent: '100m',
  secondaryEvents: ['200m'],
  trainingDaysPerWeek: 4,
  availableTrainingDays: ['monday', 'tuesday', 'thursday', 'friday'],
  preferredRestDay: 'sunday',
  seasonPhaseOverride: override('general-preparation'),
  sportPracticeDays: [],
  gameOrCompetitionDays: [],
});
assert(shortTrack.suggestions.length === 4, '100/200 pathway must fill four selected training days.');
assert(highCount(shortTrack.suggestions) === 2, 'Four-day 100/200 general preparation must use two high-output days.');

const progressionSeed = {
  ...shortTrack,
  suggestions: [
    { ...shortTrack.suggestions[0], workoutId: 'ACC-01', workoutName: 'Wall Drill + 10 m Start Foundation' },
    ...shortTrack.suggestions.slice(1),
  ],
};
const progressedSeed = applyWeeklyProgressionProposal(
  progressionSeed,
  {
    kind: 'progress-one',
    title: 'Test one reviewed progression',
    explanation: 'Verification only.',
    evidence: [],
  },
  starterWorkoutLibrary,
);
assert(
  progressedSeed.suggestions.some(day => day.workoutId === 'ACC-02'),
  'Automatic progression must replace one linked session with its Approved next workout.',
);

const beginnerShortTrack = plan({
  ...sampleAthleteProfile,
  id: 'verify-beginner-track-short-three-days',
  primaryEvent: '100m',
  secondaryEvents: [],
  experienceLevel: 'beginner',
  trainingDaysPerWeek: 3,
  availableTrainingDays: ['monday', 'wednesday', 'friday'],
  preferredRestDay: 'sunday',
  seasonPhaseOverride: override('general-preparation'),
  sportPracticeDays: [],
  gameOrCompetitionDays: [],
});
assert(beginnerShortTrack.suggestions.length === 3, 'Beginner 100m pathway must fill the three selected training days.');
assert(highCount(beginnerShortTrack.suggestions) === 2, 'Beginner 100m pathway must use two separated quality days.');
assert(beginnerShortTrack.suggestions.every((day, index, items) => index === 0 || day.dayIndex - items[index - 1].dayIndex >= 1), 'Beginner 100m pathway must keep distinct scheduled days.');
assert(
  beginnerShortTrack.suggestions.flatMap(day => day.supportWorkoutIds).filter(id => ['STR-01', 'STR-02'].includes(id)).length >= 2,
  'Beginner track plans must retain two foundational loaded-strength exposures; loading and total sets provide the progression.',
);

const indoorSixty = plan({
  ...sampleAthleteProfile,
  id: 'verify-trained-track-60m',
  primaryEvent: '60m',
  secondaryEvents: ['100m'],
  experienceLevel: 'intermediate',
  trainingDaysPerWeek: 4,
  availableTrainingDays: ['monday', 'tuesday', 'thursday', 'saturday'],
  preferredRestDay: 'sunday',
  seasonPhaseOverride: override('general-preparation'),
  sportPracticeDays: [],
  gameOrCompetitionDays: [],
});
assert(indoorSixty.suggestions.length === 4, '60m athletes must receive a complete short-sprint week.');
assert(highCount(indoorSixty.suggestions) === 2, 'Four-day 60m general preparation must separate two quality exposures.');

const trainedShortTrack = plan({
  ...sampleAthleteProfile,
  id: 'verify-trained-track-short-five-days',
  primaryEvent: '100m',
  secondaryEvents: ['200m'],
  experienceLevel: 'intermediate',
  trainingDaysPerWeek: 5,
  availableTrainingDays: ['monday', 'tuesday', 'wednesday', 'friday', 'saturday'],
  preferredRestDay: 'sunday',
  seasonPhaseOverride: override('general-preparation'),
  sportPracticeDays: [],
  gameOrCompetitionDays: [],
});
assert(trainedShortTrack.suggestions.length === 5, 'Trained 100/200 pathway must fill five selected training days.');
assert(highCount(trainedShortTrack.suggestions) === 3, 'Trained 100/200 five-day pathway must use three quality exposures.');
assert(
  trainedShortTrack.suggestions.flatMap(day => day.supportWorkoutIds).filter(id => ['STR-01', 'STR-02'].includes(id)).length >= 2,
  'Trained 100/200 plans must contain two complete loaded-strength pairings.',
);

const longTrack = plan({
  ...sampleAthleteProfile,
  id: 'verify-track-long',
  primaryEvent: '400m',
  secondaryEvents: ['200m'],
  experienceLevel: 'intermediate',
  trainingDaysPerWeek: 5,
  availableTrainingDays: ['monday', 'tuesday', 'wednesday', 'friday', 'saturday'],
  preferredRestDay: 'sunday',
  seasonPhaseOverride: override('general-preparation'),
  sportPracticeDays: [],
  gameOrCompetitionDays: [],
});
assert(highCount(longTrack.suggestions) === 3, 'Trained five-day 200/400 general preparation must use three quality days.');
assert(longTrack.suggestions.some(day => day.targetCategory === 'speed-endurance'), '200/400 general preparation must contain controlled speed endurance.');
assert(
  longTrack.suggestions.flatMap(day => day.supportWorkoutIds).filter(id => ['STR-01', 'STR-02'].includes(id)).length >= 2,
  'Trained 200/400 plans must contain two complete loaded-strength pairings.',
);

const football = plan({
  ...sampleFootballAthleteProfile,
  id: 'verify-football-40',
  primarySport: 'football',
  sports: ['football'],
  experienceLevel: 'intermediate',
  trainingDaysPerWeek: 5,
  availableTrainingDays: ['monday', 'tuesday', 'wednesday', 'friday', 'saturday'],
  preferredRestDay: 'sunday',
  sportPracticeDays: [],
  gameOrCompetitionDays: [],
  seasonPhaseOverride: override('general-preparation'),
});
assert(football.suggestions.some(day => day.workoutId === 'F40-ACC-02'), 'Trained football pathway must use the trained early-acceleration record.');
assert(football.suggestions.some(day => day.workoutId === 'F40-MAX-02'), 'Trained football pathway must use the trained upright-speed record.');
assert(football.suggestions.some(day => day.workoutId === 'F40-TRANSFER-01'), 'Football pathway must use the dedicated 20-40-yard transfer record.');
assert(highCount(football.suggestions) === 3, 'Trained five-day football pathway must contain three separated quality exposures.');
assert(football.suggestions.reduce((count, day) => count + day.supportWorkoutIds.length, 0) === 2, 'Football general preparation must pair two strength exposures, not add a third lifting day.');
assert(football.suggestions.flatMap(day => day.supportWorkoutIds).every(id => ['STR-01', 'STR-02'].includes(id)), 'Football strength must use the same complete force and explosive templates.');

const foundationFootball = plan({
  ...sampleFootballAthleteProfile,
  id: 'verify-football-foundation',
  primarySport: 'football',
  sports: ['football'],
  experienceLevel: 'beginner',
  trainingDaysPerWeek: 5,
  availableTrainingDays: ['monday', 'tuesday', 'wednesday', 'friday', 'saturday'],
  preferredRestDay: 'sunday',
  sportPracticeDays: [],
  gameOrCompetitionDays: [],
  seasonPhaseOverride: override('general-preparation'),
});
assert(highCount(foundationFootball.suggestions) === 2, 'Foundation football athlete must not receive three demanding sprint days.');
assert(foundationFootball.suggestions.some(day => day.workoutId === 'F40-ACC-01'), 'Foundation football pathway must use foundation acceleration.');
assert(foundationFootball.suggestions.some(day => day.workoutId === 'F40-MAX-01'), 'Foundation football pathway must use foundation upright speed.');

const beginnerFootballThreeDay = plan({
  ...sampleFootballAthleteProfile,
  id: 'verify-football-beginner-three-days',
  primarySport: 'football',
  sports: ['football'],
  experienceLevel: 'beginner',
  trainingDaysPerWeek: 3,
  availableTrainingDays: ['monday', 'wednesday', 'friday'],
  preferredRestDay: 'sunday',
  sportPracticeDays: [],
  gameOrCompetitionDays: [],
  seasonPhaseOverride: override('general-preparation'),
});
assert(beginnerFootballThreeDay.suggestions.length === 3, 'Beginner football pathway must fill three selected days.');
assert(highCount(beginnerFootballThreeDay.suggestions) === 2, 'Beginner football three-day pathway must contain two acceleration-focused quality days.');

const soccer = plan({
  ...sampleSoccerAthleteProfile,
  id: 'verify-soccer-general',
  primarySport: 'soccer',
  sports: ['soccer'],
  trainingContext: 'offseason',
  trainingDaysPerWeek: 3,
  availableTrainingDays: ['monday', 'wednesday', 'friday'],
  preferredRestDay: 'sunday',
  sportPracticeDays: [],
  gameOrCompetitionDays: [],
  trackAccess: 'none',
  turfAccess: 'regular',
  grassAccess: 'regular',
  seasonPhaseOverride: override('general-preparation'),
});
assert(soccer.summary.includes('general linear-speed'), 'Soccer must be labeled as a general linear-speed foundation.');
assert(soccer.suggestions.some(day => day.workoutId === 'GEN-ACC-02'), 'Trained general-sport pathway must use trained acceleration.');
assert(soccer.suggestions.some(day => day.workoutId === 'GEN-MAX-02'), 'Trained general-sport pathway must use trained upright speed.');

const soccerWithPractices = plan({
  ...sampleSoccerAthleteProfile,
  id: 'verify-soccer-practice-load',
  primarySport: 'soccer',
  sports: ['soccer'],
  trainingContext: 'offseason',
  trainingDaysPerWeek: 5,
  availableTrainingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  preferredRestDay: 'sunday',
  sportPracticeDays: ['tuesday', 'thursday'],
  gameOrCompetitionDays: ['saturday'],
  seasonPhaseOverride: override('general-preparation'),
});
assert(soccerWithPractices.suggestions.length === 3, 'Soccer practices must reduce five open choices to three SprintLab sessions.');
assert(soccerWithPractices.suggestions.every(day => ![2, 4, 6].includes(day.dayIndex)), 'Soccer plan must not stack sessions on practice or game days.');

const formerCourtOnlyProfile = plan({
  ...sampleBasketballAthleteProfile,
  id: 'verify-court-limited',
  primarySport: 'basketball',
  sports: ['basketball'],
  trainingContext: 'offseason',
  trainingDaysPerWeek: 3,
  availableTrainingDays: ['monday', 'wednesday', 'friday'],
  preferredRestDay: 'sunday',
  sportPracticeDays: [],
  gameOrCompetitionDays: [],
  trackAccess: 'none',
  turfAccess: 'none',
  grassAccess: 'none',
  hillAccess: 'none',
  indoorAccess: 'none',
  courtAccess: 'regular',
  homeEquipment: ['none'],
  seasonPhaseOverride: override('general-preparation'),
});
assert(formerCourtOnlyProfile.suggestions.length === 3, 'Removed access questions must not create an empty general-speed week.');
assert(
  formerCourtOnlyProfile.suggestions.some(day => day.targetCategory === 'maximum-velocity'),
  'A stale court-only profile must no longer be locked out of upright-speed development.',
);

const inSeason = plan({
  ...sampleFootballAthleteProfile,
  id: 'verify-football-in-season',
  primarySport: 'football',
  sports: ['football'],
  experienceLevel: 'intermediate',
  trainingDaysPerWeek: 4,
  availableTrainingDays: ['monday', 'tuesday', 'thursday', 'friday'],
  preferredRestDay: 'sunday',
  sportPracticeDays: [],
  gameOrCompetitionDays: [],
  seasonPhaseOverride: override('competition'),
});
assert(inSeason.suggestions.length <= 3, 'In-season general path must not fill every available day with extra SprintLab work.');
assert(inSeason.suggestions.some(day => day.workoutId === 'GEN-MICRO-01'), 'In-season path must use the reviewed speed microdose.');
assert(highCount(inSeason.suggestions) === 0, 'In-season fallback must not label a full high-output day.');

const footballWithTeamLoad = plan({
  ...sampleFootballAthleteProfile,
  id: 'verify-football-team-load',
  primarySport: 'football',
  sports: ['football'],
  experienceLevel: 'intermediate',
  trainingDaysPerWeek: 6,
  availableTrainingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
  preferredRestDay: 'sunday',
  sportPracticeDays: ['tuesday', 'thursday'],
  gameOrCompetitionDays: ['saturday'],
  seasonPhaseOverride: override('competition'),
});
assert(footballWithTeamLoad.suggestions.length <= 3, 'In-season football plan must respect the existing team-training load.');
assert(footballWithTeamLoad.suggestions.every(day => ![2, 4, 6].includes(day.dayIndex)), 'In-season football plan must never stack a full session onto practice or game day.');

const generalBeginnerTwoDay = plan({
  ...sampleBasketballAthleteProfile,
  id: 'verify-general-beginner-two-days',
  primarySport: 'basketball',
  sports: ['basketball'],
  experienceLevel: 'beginner',
  trainingContext: 'offseason',
  trainingDaysPerWeek: 2,
  availableTrainingDays: ['monday', 'thursday'],
  preferredRestDay: 'sunday',
  sportPracticeDays: [],
  gameOrCompetitionDays: [],
  seasonPhaseOverride: override('general-preparation'),
});
assert(generalBeginnerTwoDay.suggestions.length === 2, 'General-speed beginner must receive two usable sessions, not an empty plan.');
assert(generalBeginnerTwoDay.suggestions.some(day => day.targetCategory === 'acceleration'), 'Two-day general-speed foundation must include acceleration.');
assert(generalBeginnerTwoDay.suggestions.some(day => day.workoutId === 'GEN-ACC-01'), 'General-speed beginner must receive foundation acceleration.');
assert(generalBeginnerTwoDay.suggestions.some(day => day.workoutId === 'GEN-MAX-01'), 'General-speed beginner must receive foundation upright speed.');
assert(
  generalBeginnerTwoDay.suggestions.flatMap(day => day.supportWorkoutIds).filter(id => ['STR-01', 'STR-02'].includes(id)).length === 2,
  'A healthy two-day general-speed plan must pair foundational loaded strength with both quality sessions.',
);

const advancedGeneral = plan({
  ...sampleBasketballAthleteProfile,
  id: 'verify-general-advanced',
  primarySport: 'general-athletic-performance',
  sports: ['general-athletic-performance'],
  experienceLevel: 'advanced',
  trainingContext: 'offseason',
  trainingDaysPerWeek: 3,
  availableTrainingDays: ['monday', 'wednesday', 'friday'],
  preferredRestDay: 'sunday',
  sportPracticeDays: [],
  gameOrCompetitionDays: [],
  currentPain: false,
  seasonPhaseOverride: override('general-preparation'),
});
assert(advancedGeneral.suggestions.some(day => day.workoutId === 'GEN-ACC-03'), 'Advanced general-speed athlete must receive advanced acceleration.');
assert(advancedGeneral.suggestions.some(day => day.workoutId === 'GEN-MAX-03'), 'Advanced general-speed athlete must receive advanced upright speed.');

const advancedFootball = plan({
  ...sampleFootballAthleteProfile,
  id: 'verify-football-advanced',
  primarySport: 'football',
  sports: ['football'],
  experienceLevel: 'advanced',
  trainingDaysPerWeek: 3,
  availableTrainingDays: ['monday', 'wednesday', 'friday'],
  preferredRestDay: 'sunday',
  sportPracticeDays: [],
  gameOrCompetitionDays: [],
  currentPain: false,
  seasonPhaseOverride: override('general-preparation'),
});
assert(advancedFootball.suggestions.some(day => day.workoutId === 'F40-ACC-03'), 'Advanced football athlete must receive advanced acceleration.');
assert(advancedFootball.suggestions.some(day => day.workoutId === 'F40-MAX-03'), 'Advanced football athlete must receive advanced upright speed.');

const reducedAdvancedGeneral = plan({
  ...sampleBasketballAthleteProfile,
  id: 'verify-general-advanced-reduced',
  primarySport: 'general-athletic-performance',
  sports: ['general-athletic-performance'],
  experienceLevel: 'advanced',
  trainingContext: 'offseason',
  trainingDaysPerWeek: 2,
  availableTrainingDays: ['monday', 'thursday'],
  preferredRestDay: 'sunday',
  sportPracticeDays: [],
  gameOrCompetitionDays: [],
  currentPain: true,
  seasonPhaseOverride: override('general-preparation'),
});
assert(reducedAdvancedGeneral.suggestions.some(day => day.workoutId === 'GEN-ACC-02'), 'Reduced-readiness advanced athlete must regress exactly one acceleration level.');
assert(reducedAdvancedGeneral.suggestions.some(day => day.workoutId === 'GEN-MAX-02'), 'Reduced-readiness advanced athlete must regress exactly one upright-speed level.');
assert(
  reducedAdvancedGeneral.suggestions.every(day => day.whyThisFits.some(reason => reason.includes('reduced one reviewed level'))),
  'A one-level regression must display its reason.',
);

const duplicatedSnapshot = workoutToPlannedSnapshot(sampleTrainingLog);
const duplicatedDomainWorkout = plannedWorkoutToDomainWorkout(duplicatedSnapshot);
assert(duplicatedSnapshot.category === sampleTrainingLog.plannedWorkout.trainingCategory, 'History duplication must retain the workout category.');
assert(
  duplicatedSnapshot.eventTags?.join('|') === sampleTrainingLog.plannedWorkout.eventPathways.join('|'),
  'History duplication must retain event tags.',
);
assert(duplicatedDomainWorkout.trainingCategory === sampleTrainingLog.plannedWorkout.trainingCategory, 'Duplicated workout conversion must keep its category.');
assert(
  duplicatedDomainWorkout.eventPathways.join('|') === sampleTrainingLog.plannedWorkout.eventPathways.join('|'),
  'Duplicated workout conversion must keep its event pathways.',
);

const coachMode = buildDeterministicWeeklyPlan({
  ...sampleAthleteProfile,
  id: 'verify-coach-mode',
  trainingPlanMode: 'log-coach-plan',
  loggingOnlyMode: false,
}, starterWorkoutLibrary);
assert(coachMode.status === 'coach-managed', 'Coach-plan mode must not generate a SprintLab week.');

const logOnlyMode = buildDeterministicWeeklyPlan({
  ...sampleAthleteProfile,
  id: 'verify-log-only-mode',
  trainingPlanMode: 'log-coach-plan',
  loggingOnlyMode: true,
}, starterWorkoutLibrary);
assert(logOnlyMode.status === 'coach-managed', 'Log-only mode must not generate a SprintLab week.');

console.log('All release planner scenarios passed: tiered football/general speed, reduced-readiness regression, History metadata, 60m, track, team-load, coach, and log-only modes.');
