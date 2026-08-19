import AsyncStorage from '@react-native-async-storage/async-storage';

// SprintLab Coach UI: a single persisted flag so the "Ask Coach" discoverability treatment
// (components/coach-launcher.tsx) only ever plays once per install, matching the same
// AsyncStorage-boolean-flag pattern already used elsewhere (e.g. utils/theme-preference.ts).
const COACH_INTRO_SEEN_KEY = 'sprintlab:coach-intro-seen';

export async function hasSeenCoachIntro(): Promise<boolean> {
  return (await AsyncStorage.getItem(COACH_INTRO_SEEN_KEY)) === 'true';
}

export async function markCoachIntroSeen(): Promise<void> {
  await AsyncStorage.setItem(COACH_INTRO_SEEN_KEY, 'true');
}

/** Developer Tools' "Reset Coach test state" — part of it. Clears only the launcher's one-time
 * "Ask Coach" bubble flag. The conversation itself is never persisted (components/coach-context.tsx
 * starts empty on every launch), so there is nothing else to clear for the conversation itself. */
export async function resetCoachIntroSeen(): Promise<void> {
  await AsyncStorage.removeItem(COACH_INTRO_SEEN_KEY);
}
