import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AthleteOnboardingDraft, AthleteProfile, AthleteSport, SpeedGoal, SpeedPathway } from '@/types';

const ATHLETE_PROFILE_KEY = 'sprintlab.athlete-profile.v2';
const LEGACY_PROFILE_KEYS = ['sprintlab.athlete-profile', 'sprintlab.profile'];
const ONBOARDING_KEY = 'sprintlab.athlete-onboarding.v1';

export type TrainingWorkflow = 'sprintlab-plan' | 'coach-plan' | 'combined' | 'log-only';

export function getTrainingWorkflow(
  profile: Pick<AthleteProfile, 'trainingPlanMode' | 'trainingPlanModeAnswered' | 'loggingOnlyMode' | 'followsCoachCreatedPlan'>,
): TrainingWorkflow | null {
  if (!profile.trainingPlanModeAnswered) return null;
  if (profile.loggingOnlyMode) return 'log-only';
  if (profile.trainingPlanMode === 'both') return 'combined';
  if (profile.trainingPlanMode === 'log-coach-plan') return 'coach-plan';
  if (profile.trainingPlanMode === 'build-my-plan') return 'sprintlab-plan';
  return null;
}

export function trainingWorkflowChanges(workflow: TrainingWorkflow): Partial<AthleteProfile> {
  if (workflow === 'sprintlab-plan') {
    return { trainingPlanMode: 'build-my-plan', trainingPlanModeAnswered: true, loggingOnlyMode: false, followsCoachCreatedPlan: false };
  }
  if (workflow === 'coach-plan') {
    return { trainingPlanMode: 'log-coach-plan', trainingPlanModeAnswered: true, loggingOnlyMode: false, followsCoachCreatedPlan: true };
  }
  if (workflow === 'combined') {
    return { trainingPlanMode: 'both', trainingPlanModeAnswered: true, loggingOnlyMode: false, followsCoachCreatedPlan: true };
  }
  return { trainingPlanMode: 'log-coach-plan', trainingPlanModeAnswered: true, loggingOnlyMode: true, followsCoachCreatedPlan: false };
}

export function trainingWorkflowLabel(workflow: TrainingWorkflow | null): string {
  if (workflow === 'sprintlab-plan') return 'Build a SprintLab plan';
  if (workflow === 'coach-plan') return 'Follow my coach’s plan';
  if (workflow === 'combined') return 'Combine both';
  if (workflow === 'log-only') return 'Log without a plan';
  return 'Not selected';
}

export function sportPathway(profile: Pick<AthleteProfile, 'sport' | 'primaryEvent' | 'loggingOnlyMode'>): SpeedPathway {
  if (profile.loggingOnlyMode) return 'logging-only';
  if ((profile.sport ?? 'track-and-field') === 'track-and-field') return profile.primaryEvent === '400m' ? 'track-long-sprint' : 'track-short-sprint';
  if (profile.sport === 'football') return 'combine-preparation';
  return 'general-speed-development';
}

export function defaultSpeedGoals(sport: AthleteSport): SpeedGoal[] {
  if (sport === 'track-and-field') return ['acceleration', 'maximum-velocity', 'speed-endurance'];
  if (sport === 'football') return ['acceleration', 'maximum-velocity', 'combine-testing'];
  return ['acceleration', 'maximum-velocity', 'general-speed-development'];
}

/** Makes a pre-expansion track profile usable without deleting or renaming legacy fields. */
export function migrateAthleteProfile(raw: AthleteProfile): AthleteProfile {
  // An explicit empty array is an unfinished onboarding answer. Only legacy
  // profiles without a `sports` field receive the safe track default.
  const hasModernSports = Array.isArray(raw.sports);
  const sports = [...new Set(hasModernSports ? raw.sports : [raw.primarySport ?? raw.sport ?? 'track-and-field'])];
  const candidatePrimary = raw.primarySport
    ?? (!hasModernSports ? raw.sport : undefined)
    ?? (raw.onboardingComplete && sports.length === 1 ? sports[0] : undefined);
  const primarySport = candidatePrimary && sports.includes(candidatePrimary) ? candidatePrimary : undefined;
  const sport = primarySport ?? raw.sport ?? sports[0] ?? 'track-and-field';
  const competitionStatus =
    raw.trainingContext === 'in-season' || raw.seasonPhase === 'competition'
      ? 'in-season'
      : raw.trainingContext === 'preseason'
        ? 'preseason'
        : raw.trainingContext === 'postseason' || raw.seasonPhase === 'transition'
          ? 'postseason'
          : raw.trainingContext === 'offseason' || raw.seasonPhase === 'offseason'
            ? 'out-of-season'
            : 'unknown';
  const limitationLabels: Record<string, string> = {
    'Hamstring sensitivity': 'Hamstring',
    'Knee sensitivity': 'Knee',
    'Achilles / ankle sensitivity': 'Achilles or ankle',
    'Achilles / ankle': 'Achilles or ankle',
    'Back sensitivity': 'Back',
    'Shoulder sensitivity': 'Shoulder',
    'Nothing currently': 'No current concerns',
    'No current issues': 'No current concerns',
    'No injuries or restrictions': 'No current concerns',
    'Returning from time off': 'Returning after time off',
  };
  const onboardingLimitations = (raw.onboardingLimitations ?? []).map(label => limitationLabels[label] ?? label);
  const concernAreaByLabel = {
    Hamstring: 'hamstring',
    Knee: 'knee',
    'Achilles or ankle': 'achilles-or-ankle',
    Back: 'back',
    Shoulder: 'shoulder',
    'Other area': 'other',
  } as const;
  const legacyHamstringStatus = raw.hamstringLimitationSeverity === 'returning-from-strain'
    ? 'recently-cleared'
    : raw.hamstringLimitationSeverity === 'cautious'
      ? 'monitoring'
      : raw.hamstringLimitationSeverity
        ? 'currently-limiting'
        : undefined;
  const migratedConcernDetails = raw.trainingConcernDetails ?? Object.entries(concernAreaByLabel)
    .filter(([label]) => onboardingLimitations.includes(label))
    .map(([label, area]) => ({
      area,
      status: label === 'Hamstring' && legacyHamstringStatus
        ? legacyHamstringStatus
        : raw.currentPain
          ? 'currently-limiting' as const
          : 'monitoring' as const,
    }));
  const migratedTrainingDays = raw.trainingDaysPerWeek === -1
    ? Math.min(5, Math.max(2, raw.availableTrainingDays?.length || 3))
    : raw.trainingDaysPerWeek;
  return {
    ...raw,
    trainingDaysPerWeek: migratedTrainingDays,
    sport: sports.length ? sport : raw.sport,
    primarySport,
    primarySportAnswered: raw.primarySportAnswered ?? Boolean(raw.onboardingComplete && primarySport),
    sports,
    sportPosition: raw.sportPosition ?? null,
    speedGoals: raw.speedGoals?.length ? raw.speedGoals : primarySport ? defaultSpeedGoals(primarySport) : [],
    competitionLevel: raw.competitionLevel ?? (raw.competitionCategory === 'high-school' ? 'high-school' : raw.competitionCategory === 'collegiate' ? 'college' : raw.competitionCategory === 'youth' ? 'youth' : raw.competitionCategory === 'club' ? 'club' : 'recreational'),
    trainingContext: raw.trainingContext ?? (raw.seasonPhase === 'competition' || raw.seasonPhase === 'championship' ? 'in-season' : raw.seasonPhase === 'transition' ? 'postseason' : raw.seasonPhase === 'offseason' ? 'offseason' : 'general-development'),
    primaryPerformanceTest: raw.primaryPerformanceTest ?? null,
    secondaryPerformanceTests: raw.secondaryPerformanceTests ?? [],
    sportPracticeDays: raw.sportPracticeDays ?? [],
    gameOrCompetitionDays: raw.gameOrCompetitionDays ?? [],
    gameScheduleVaries: raw.gameScheduleVaries ?? false,
    otherSportDays: raw.otherSportDays ?? [],
    busySchoolDays: raw.busySchoolDays ?? [],
    commitmentSchedulePlaced: raw.commitmentSchedulePlaced
      ?? Boolean(raw.onboardingComplete),
    currentTeamTrainingLoad: raw.currentTeamTrainingLoad ?? 'unknown',
    courtAccess: raw.courtAccess ?? 'none',
    sledAccess: raw.sledAccess ?? 'none',
    timingGatesAccess: raw.timingGatesAccess ?? 'none',
    conesAccess: raw.conesAccess ?? 'regular',
    onboardingComplete: raw.onboardingComplete ?? false,
    trainingPlanModeAnswered: raw.trainingPlanModeAnswered ?? Boolean(raw.onboardingComplete),
    currentTrainingDemands: (raw.currentTrainingDemands ?? [])
      .filter(demand => demand !== 'weight-training'),
    exactTrainingDaysPreference: raw.exactTrainingDaysPreference
      ?? (raw.availableTrainingDays?.length ? true : undefined),
    preferredRestDayAnswered: raw.preferredRestDayAnswered
      ?? Boolean(raw.onboardingComplete),
    onboardingLimitations,
    trainingConcernDetails: migratedConcernDetails,
    otherConcernArea: raw.otherConcernArea ?? '',
    returningAfterTimeOff: raw.returningAfterTimeOff
      ?? onboardingLimitations.includes('Returning after time off'),
    timeAwayDuration: raw.timeAwayDuration,
    trainingConstraintsReviewed: raw.trainingConstraintsReviewed
      ?? Boolean(raw.onboardingComplete),
    currentPain: migratedConcernDetails.some(detail => detail.status === 'currently-limiting'),
    hamstringLimitationSeverity: raw.hamstringLimitationSeverity,
    turfAccess: raw.turfAccess ?? 'none',
    workoutReminderEnabled: raw.workoutReminderEnabled ?? false,
    workoutReminderHour: raw.workoutReminderHour ?? 16,
    workoutReminderMinute: raw.workoutReminderMinute ?? 0,
    workoutReminderCustomTime: raw.workoutReminderCustomTime ?? false,
    workoutReminderAnswered: raw.workoutReminderAnswered
      ?? Boolean(raw.onboardingComplete),
    raceDevelopmentAreas: raw.raceDevelopmentAreas ?? [],
    targetPerformances: raw.targetPerformances ?? [],
    seasonCalendar: raw.seasonCalendar ?? {
      competitionStatus,
      firstMeetDate: raw.nextMeetDate,
      championshipDate: raw.championshipDate,
      priorityMeets: raw.nextMeetDate
        ? [{
            id: `legacy-next-meet:${raw.nextMeetDate}`,
            name: 'Next meet',
            date: raw.nextMeetDate,
            priority: 'B',
            events: [raw.primaryEvent],
            estimated: true,
          }]
        : [],
    },
    seasonPhaseOverride: raw.seasonPhaseOverride ?? null,
    trackProfile: raw.trackProfile ?? (sport === 'track-and-field' ? { primaryEvent: raw.primaryEvent, secondaryEvents: raw.secondaryEvents, personalBests: raw.personalBests, blockStartExperience: raw.blockStartExperience, nextMeetDate: raw.nextMeetDate, championshipDate: raw.championshipDate } : undefined),
  };
}

export async function getAthleteProfile(): Promise<AthleteProfile | null> {
  const current = await AsyncStorage.getItem(ATHLETE_PROFILE_KEY);
  if (current) return migrateAthleteProfile(JSON.parse(current) as AthleteProfile);
  for (const key of LEGACY_PROFILE_KEYS) {
    const legacy = await AsyncStorage.getItem(key);
    if (!legacy) continue;
    const migrated = migrateAthleteProfile(JSON.parse(legacy) as AthleteProfile);
    await AsyncStorage.setItem(ATHLETE_PROFILE_KEY, JSON.stringify(migrated));
    return migrated;
  }
  return null;
}

export async function saveAthleteProfile(profile: AthleteProfile) {
  const migrated = { ...migrateAthleteProfile(profile), updatedAt: new Date().toISOString() };
  await AsyncStorage.setItem(ATHLETE_PROFILE_KEY, JSON.stringify(migrated));
  return migrated;
}

export async function getAthleteOnboardingDraft(): Promise<AthleteOnboardingDraft | null> {
  const value = await AsyncStorage.getItem(ONBOARDING_KEY);
  if (!value) return null;
  const draft = JSON.parse(value) as AthleteOnboardingDraft;
  return { ...draft, version: 1, currentStep: Math.min(18, Math.max(1, draft.currentStep || 1)), profile: migrateAthleteProfile(draft.profile) };
}

export async function saveAthleteOnboardingDraft(draft: Omit<AthleteOnboardingDraft, 'version' | 'updatedAt'>) {
  const next: AthleteOnboardingDraft = { ...draft, version: 1, profile: migrateAthleteProfile(draft.profile), updatedAt: new Date().toISOString() };
  await AsyncStorage.setItem(ONBOARDING_KEY, JSON.stringify(next));
  return next;
}

export async function clearAthleteOnboardingDraft() {
  await AsyncStorage.removeItem(ONBOARDING_KEY);
}

/** Development helper: keep the profile and logs, but show onboarding again. */
export async function resetAthleteOnboarding() {
  const profile = await getAthleteProfile();
  if (profile) await saveAthleteProfile({ ...profile, onboardingComplete: false });
  await clearAthleteOnboardingDraft();
}

/** Testing-only escape hatch: removes every locally stored key owned by SprintLab. */
export async function resetAllSprintLabLocalData() {
  await import('@/utils/workout-reminders')
    .then(({ disableWorkoutReminders }) => disableWorkoutReminders())
    .catch(() => undefined);
  // AsyncStorage is private to this installed app. Clearing the complete store
  // is safer for the development reset than maintaining a prefix allow-list
  // that can miss a newly introduced plan, draft, library, or workout key.
  await AsyncStorage.clear();
}
