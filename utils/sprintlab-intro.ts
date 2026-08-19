import AsyncStorage from '@react-native-async-storage/async-storage';

// SprintLab first-time product tour: a single persisted flag so the interactive walkthrough
// (components/sprintlab-intro-overlay.tsx) only ever plays automatically once per install,
// matching the same AsyncStorage-boolean-flag pattern already used for the Coach discoverability
// treatment (utils/coach-discovery.ts).
const INTRO_SEEN_KEY = 'sprintlab:intro-seen';

// One-shot handoff, closer to utils/storage.ts's PendingWorkoutLaunch pattern: set right before
// navigating to Today so the tour launches the moment it mounts there, then cleared the instant
// Today consumes it — never fires twice from a single request. Both the real trigger (the first
// time a generated plan is saved, see app/plan-preview.tsx) and the manual Settings replay entry
// go through this same flag, so there is exactly one mechanism that "asks Today to start the tour."
const INTRO_LAUNCH_REQUEST_KEY = 'sprintlab:intro-launch-requested';

export async function hasSeenSprintLabIntro(): Promise<boolean> {
  return (await AsyncStorage.getItem(INTRO_SEEN_KEY)) === 'true';
}

export async function markSprintLabIntroSeen(): Promise<void> {
  await AsyncStorage.setItem(INTRO_SEEN_KEY, 'true');
}

/** Developer Tools' "Reset first-launch flags" — clears only the "have I seen the tour" flag so
 * the automatic first-run trigger (app/plan-preview.tsx) can genuinely fire again on the next
 * real first-plan-generation moment. Never touches the athlete's plan/history/logs. */
export async function resetSprintLabIntroSeen(): Promise<void> {
  await AsyncStorage.removeItem(INTRO_SEEN_KEY);
}

export async function requestSprintLabIntroLaunch(): Promise<void> {
  await AsyncStorage.setItem(INTRO_LAUNCH_REQUEST_KEY, 'true');
}

/** Reads and clears the pending request atomically-enough for a single-threaded JS app — Today
 * calls this once per focus, so a request can only ever be consumed once. */
export async function consumeSprintLabIntroLaunchRequest(): Promise<boolean> {
  const requested = (await AsyncStorage.getItem(INTRO_LAUNCH_REQUEST_KEY)) === 'true';
  if (requested) await AsyncStorage.removeItem(INTRO_LAUNCH_REQUEST_KEY);
  return requested;
}
