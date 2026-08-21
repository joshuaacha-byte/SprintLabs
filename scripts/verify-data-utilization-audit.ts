// Regression checks for the data-utilization audit fixes: targetPerformances/targetEvent/
// otherSportParticipation/sportPosition reach Coach context (previously collected and never read
// anywhere past their own onboarding screen). Also confirms old saved profiles carrying fields
// removed from AthleteProfile over the course of this audit (currentWorkouts,
// recentSprintConsistency, safetyAcknowledgedAt, currentTeamTrainingLoad) still load safely.
//
// Equipment/facility access fields (trackAccess, grassAccess, ..., turfAccess — 12 total) are
// deliberately NOT exercised here: they are not collected by any onboarding or Settings question
// (see the doc comment on AthleteProfile.trackAccess in types/domain.ts), so there is no real
// per-athlete variation to test. A prior version of this file asserted that equipmentSetupNote()
// produced different substitution text for a "well-equipped" vs "barebones" profile — that only
// proved the function ran on two hand-constructed literals that no real onboarding flow can ever
// produce, not that SprintLab does anything athlete-specific with equipment. That wiring and this
// test were both removed; requiredSetup is back to plainly listing a workout's equipment, the same
// for every athlete, which is honest given the fields behind it are uncollectable.
//
// Run: node --experimental-strip-types --loader ./scripts/alias-loader.mjs ./scripts/verify-data-utilization-audit.ts
import { sampleAthleteProfile } from '../data/domain-samples.ts';
import { buildAthleteAIContext } from '../utils/ai-context.ts';
import { migrateAthleteProfile } from '../utils/athlete-profile.ts';
import { evaluatePrehab } from '../utils/prehab-engine.ts';
import type { AthleteProfile, SeasonCalendar } from '../types/index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`REGRESSION: ${message}`);
}

function profileFor(overrides: Partial<AthleteProfile>): AthleteProfile {
  return {
    ...(sampleAthleteProfile as AthleteProfile),
    id: 'audit-regression',
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
    seasonPhaseOverride: { phase: 'general-preparation', reason: 'Regression test.', setBy: 'prototype-editor', expiresOn: '2099-12-31' },
    ...overrides,
  };
}

// 1. targetPerformances, targetEvent, and otherSportParticipation now reach Coach context.
{
  const profile = profileFor({
    targetPerformances: [{ event: '100m', timeSeconds: 10.85, targetDate: '2026-12-01' }],
    targetEvent: '200m',
    primaryEvent: '100m',
  });
  const context = buildAthleteAIContext({
    profile, schedule: [], scheduleHistory: [], sessions: [], logs: [], readiness: null, libraryWorkouts: [],
  });
  assert(context.athlete.targetTimes.length === 1 && context.athlete.targetTimes[0].event === '100m', 'targetPerformances must reach Coach context as targetTimes.');
  assert(context.athlete.priorityEvent === '200m', 'A targetEvent that differs from primaryEvent must reach Coach context as priorityEvent.');

  const sameEventProfile = profileFor({ targetEvent: '100m', primaryEvent: '100m' });
  const sameEventContext = buildAthleteAIContext({
    profile: sameEventProfile, schedule: [], scheduleHistory: [], sessions: [], logs: [], readiness: null, libraryWorkouts: [],
  });
  assert(sameEventContext.athlete.priorityEvent === undefined, 'priorityEvent must be omitted when it matches primaryEvent — no redundant signal.');

  const otherSportProfile = profileFor({ primarySport: 'other', sport: 'other', otherSportParticipation: 'Ultimate frisbee' });
  const otherSportContext = buildAthleteAIContext({
    profile: otherSportProfile, schedule: [], scheduleHistory: [], sessions: [], logs: [], readiness: null, libraryWorkouts: [],
  });
  assert(otherSportContext.athlete.otherSportName === 'Ultimate frisbee', 'otherSportParticipation must reach Coach context as otherSportName when sport is "other".');

  const trackContext = buildAthleteAIContext({
    profile: profileFor({}), schedule: [], scheduleHistory: [], sessions: [], logs: [], readiness: null, libraryWorkouts: [],
  });
  assert(trackContext.athlete.otherSportName === undefined, 'otherSportName must be omitted for a track-and-field athlete.');
}

// 2. sportPosition now reaches Coach context (previously collected, shown nowhere, sent nowhere).
{
  const profile = profileFor({ primarySport: 'football', sport: 'football', sportPosition: 'Wide receiver' });
  const context = buildAthleteAIContext({
    profile, schedule: [], scheduleHistory: [], sessions: [], logs: [], readiness: null, libraryWorkouts: [],
  });
  assert(context.athlete.sportPosition === 'Wide receiver', 'sportPosition must reach Coach context.');
}

// 3. Removing currentWorkouts/recentSprintConsistency/safetyAcknowledgedAt/currentTeamTrainingLoad from the type must not
// break loading an old saved profile whose stored JSON still has them (AsyncStorage JSON.parse
// doesn't know the type shrank — migrateAthleteProfile must tolerate the extra keys).
{
  const legacyRaw = JSON.parse(JSON.stringify({
    ...profileFor({}),
    currentWorkouts: 'Some old free-text answer',
    recentSprintConsistency: '3-plus-times-weekly',
    safetyAcknowledgedAt: '2025-01-01T00:00:00.000Z',
    currentTeamTrainingLoad: 'high',
  }));
  const migrated = migrateAthleteProfile(legacyRaw);
  assert(migrated.id === 'audit-regression', 'migrateAthleteProfile must not throw on a legacy record carrying now-removed fields.');
}

// 4. painSeverity removed from ReadinessDecision: sensation === 'severe-acute' alone still gates
// evaluatePrehab()'s stop-refer branch (the only distinct decision painSeverity ever added — a
// >=7 severity threshold — is already fully subsumed by the severe-acute sensation tier).
{
  const stop = evaluatePrehab({ readiness: { date: '2026-01-01', status: 'completed', sensation: 'severe-acute', painNotes: '' } });
  assert(stop.gate === 'stop-refer', 'sensation "severe-acute" alone must still produce a stop-refer prehab gate with painSeverity removed.');

  const modify = evaluatePrehab({ readiness: { date: '2026-01-01', status: 'completed', sensation: 'minor-tightness', hasLocalizedIssue: true, painNotes: '' } });
  assert(modify.gate === 'modify-check', 'A minor-tightness sensation must not be escalated to stop-refer just because painSeverity no longer exists.');
}

// 5. seasonCalendar is the sole write target for onboarding season-date edits: SeasonStep no
// longer writes nextMeetDate/championshipDate as a second copy of the same fact. Migration still
// converts an old profile's nextMeetDate/championshipDate into seasonCalendar when absent.
{
  const legacyRaw = JSON.parse(JSON.stringify({
    ...profileFor({}),
    seasonCalendar: undefined,
    nextMeetDate: '2026-05-01',
    championshipDate: '2026-06-15',
  }));
  const migrated = migrateAthleteProfile(legacyRaw);
  assert(migrated.seasonCalendar?.firstMeetDate === '2026-05-01', 'migrateAthleteProfile must fold a legacy nextMeetDate into seasonCalendar.firstMeetDate when seasonCalendar is absent.');
  assert(migrated.seasonCalendar?.championshipDate === '2026-06-15', 'migrateAthleteProfile must fold a legacy championshipDate into seasonCalendar.championshipDate when seasonCalendar is absent.');

  const modernCalendar: SeasonCalendar = { competitionStatus: 'in-season', firstMeetDate: '2027-01-01', championshipDate: '2027-02-01', priorityMeets: [] };
  const modernRaw = JSON.parse(JSON.stringify({ ...profileFor({}), seasonCalendar: modernCalendar, nextMeetDate: null, championshipDate: null }));
  const modernMigrated = migrateAthleteProfile(modernRaw);
  assert(modernMigrated.seasonCalendar?.firstMeetDate === '2027-01-01', 'An already-present seasonCalendar must never be overwritten by the legacy fallback fields.');
}

// 6. Newly connected Coach-context fields: footballTests (football only), concernAreas +
// returningAfterTimeOff/timeAwayDuration (restrictions), raceDevelopmentAreas (goals).
{
  const footballProfile = profileFor({
    primarySport: 'football', sport: 'football',
    footballProfile: { fortyYardDashTime: 4.62, targetFortyYardDashTime: 4.5, proAgilityTime: 4.3 },
  });
  const footballContext = buildAthleteAIContext({
    profile: footballProfile, schedule: [], scheduleHistory: [], sessions: [], logs: [], readiness: null, libraryWorkouts: [],
  });
  assert(footballContext.athlete.footballTests?.fortyYardDashTime === 4.62, 'footballProfile.fortyYardDashTime must reach Coach context for a football athlete.');

  const trackContextNoFootball = buildAthleteAIContext({
    profile: profileFor({}), schedule: [], scheduleHistory: [], sessions: [], logs: [], readiness: null, libraryWorkouts: [],
  });
  assert(trackContextNoFootball.athlete.footballTests === undefined, 'footballTests must be omitted for a non-football athlete.');

  const concernProfile = profileFor({
    trainingConcernDetails: [{ area: 'other', status: 'monitoring' }],
    otherConcernArea: 'Lower back stiffness after lifting',
    returningAfterTimeOff: true,
    timeAwayDuration: '2-6-weeks',
  });
  const concernContext = buildAthleteAIContext({
    profile: concernProfile, schedule: [], scheduleHistory: [], sessions: [], logs: [], readiness: null, libraryWorkouts: [],
  });
  assert(concernContext.athlete.restrictions?.concernAreas?.[0]?.detail === 'Lower back stiffness after lifting', 'trainingConcernDetails with area "other" must carry otherConcernArea as its detail in Coach context.');
  assert(concernContext.athlete.restrictions?.returningAfterTimeOff === true, 'returningAfterTimeOff must reach Coach context restrictions.');
  assert(concernContext.athlete.restrictions?.timeAwayDuration === '2-6-weeks', 'timeAwayDuration must reach Coach context restrictions when returningAfterTimeOff is true.');

  const raceAreaProfile = profileFor({ raceDevelopmentAreas: ['curve-running'] });
  const raceAreaContext = buildAthleteAIContext({
    profile: raceAreaProfile, schedule: [], scheduleHistory: [], sessions: [], logs: [], readiness: null, libraryWorkouts: [],
  });
  assert(raceAreaContext.athlete.goals.includes('curve-running'), 'raceDevelopmentAreas must be merged into Coach context goals.');
}

console.log('All data-utilization audit regression checks passed.');
