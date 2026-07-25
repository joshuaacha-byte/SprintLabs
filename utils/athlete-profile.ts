import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AthleteOnboardingDraft, AthleteProfile, AthleteSport, SpeedGoal, SpeedPathway } from '@/types';

const ATHLETE_PROFILE_KEY = 'sprintlab.athlete-profile.v2';
const LEGACY_PROFILE_KEYS = ['sprintlab.athlete-profile', 'sprintlab.profile'];
const ONBOARDING_KEY = 'sprintlab.athlete-onboarding.v1';

export function sportPathway(profile: Pick<AthleteProfile, 'sport' | 'primaryEvent' | 'loggingOnlyMode'>): SpeedPathway {
  if (profile.loggingOnlyMode) return 'logging-only';
  if ((profile.sport ?? 'track-and-field') === 'track-and-field') return profile.primaryEvent === '400m' ? 'track-long-sprint' : 'track-short-sprint';
  if (profile.sport === 'basketball') return 'court-speed';
  if (profile.sport === 'football') return 'combine-preparation';
  if (profile.sport === 'soccer' || profile.sport === 'lacrosse' || profile.sport === 'rugby') return 'multidirectional-field-sport';
  return 'general-speed-development';
}

export function defaultSpeedGoals(sport: AthleteSport): SpeedGoal[] {
  if (sport === 'track-and-field') return ['acceleration', 'maximum-velocity', 'speed-endurance'];
  if (sport === 'football') return ['acceleration', 'maximum-velocity', 'combine-testing'];
  if (sport === 'basketball') return ['acceleration', 'multidirectional-speed', 'explosive-power'];
  if (sport === 'soccer' || sport === 'lacrosse' || sport === 'rugby') return ['acceleration', 'multidirectional-speed', 'repeated-sprint-ability'];
  return ['acceleration', 'maximum-velocity', 'general-speed-development'];
}

/** Makes a pre-expansion track profile usable without deleting or renaming legacy fields. */
export function migrateAthleteProfile(raw: AthleteProfile): AthleteProfile {
  // An explicit empty array is an unfinished onboarding answer; only legacy profiles
  // without a `sports` field receive the safe track default.
  const sports = [...new Set(raw.sports ? raw.sports : [raw.primarySport ?? raw.sport ?? 'track-and-field'])];
  const sport = raw.primarySport ?? raw.sport ?? sports[0] ?? 'track-and-field';
  return {
    ...raw,
    sport: sports.length ? sport : raw.sport,
    primarySport: sports.length ? sport : undefined,
    sports,
    sportPosition: raw.sportPosition ?? null,
    speedGoals: raw.speedGoals?.length ? raw.speedGoals : defaultSpeedGoals(sport),
    competitionLevel: raw.competitionLevel ?? (raw.competitionCategory === 'high-school' ? 'high-school' : raw.competitionCategory === 'collegiate' ? 'college' : raw.competitionCategory === 'youth' ? 'youth' : raw.competitionCategory === 'club' ? 'club' : 'recreational'),
    trainingContext: raw.trainingContext ?? (raw.seasonPhase === 'competition' || raw.seasonPhase === 'championship' ? 'in-season' : raw.seasonPhase === 'transition' ? 'postseason' : raw.seasonPhase === 'offseason' ? 'offseason' : 'general-development'),
    primaryPerformanceTest: raw.primaryPerformanceTest ?? null,
    secondaryPerformanceTests: raw.secondaryPerformanceTests ?? [],
    sportPracticeDays: raw.sportPracticeDays ?? [],
    gameOrCompetitionDays: raw.gameOrCompetitionDays ?? [],
    currentTeamTrainingLoad: raw.currentTeamTrainingLoad ?? 'unknown',
    courtAccess: raw.courtAccess ?? 'none',
    sledAccess: raw.sledAccess ?? 'none',
    timingGatesAccess: raw.timingGatesAccess ?? 'none',
    conesAccess: raw.conesAccess ?? 'regular',
    onboardingComplete: raw.onboardingComplete ?? false,
    currentTrainingDemands: raw.currentTrainingDemands ?? [],
    onboardingLimitations: raw.onboardingLimitations ?? [],
    turfAccess: raw.turfAccess ?? 'none',
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
  return { ...draft, version: 1, currentStep: Math.min(14, Math.max(1, draft.currentStep || 1)), profile: migrateAthleteProfile(draft.profile) };
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
  const keys = await AsyncStorage.getAllKeys();
  const sprintLabKeys = keys.filter(key => key.startsWith('sprintlab.'));
  if (sprintLabKeys.length) await AsyncStorage.multiRemove(sprintLabKeys);
}
