import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';

// Centralizes the ONE call site in the app allowed to trigger the native/system notification
// permission prompt (requestNotificationPermission below). Every other call site — onboarding's
// reminder step, Settings' reminder card, utils/workout-reminders.ts — must go through this file
// so the OS prompt can only ever fire from an athlete's explicit "Enable" tap on SprintLab's own
// notification-setup screen (components/notification-setup-card.tsx), never automatically on
// launch, on mount, or as a side effect of choosing a reminder TIME.

const OPT_IN_DECISION_KEY = 'sprintlab:notification-opt-in-decision';

/** The athlete's own SprintLab-level choice, distinct from the OS permission status — lets the
 * app remember "already asked, they said not now" so it doesn't nag on every visit, while still
 * offering an explicit way to enable later (Settings → Notifications). */
export type NotificationOptInDecision = 'enabled' | 'not-now';

export async function getNotificationOptInDecision(): Promise<NotificationOptInDecision | null> {
  const value = await AsyncStorage.getItem(OPT_IN_DECISION_KEY);
  return value === 'enabled' || value === 'not-now' ? value : null;
}

export async function setNotificationOptInDecision(decision: NotificationOptInDecision): Promise<void> {
  await AsyncStorage.setItem(OPT_IN_DECISION_KEY, decision);
}

/** Developer Tools' "Reset notification setup" — clears only SprintLab's own opt-in-decision
 * flag so the explanation screen can be retested from its "never asked" state. This is entirely
 * SprintLab-internal: it does NOT touch the real OS notification permission, which iOS/Android
 * control and can only actually be reset from the device's own system settings. */
export async function resetNotificationOptInDecision(): Promise<void> {
  await AsyncStorage.removeItem(OPT_IN_DECISION_KEY);
}

export type NotificationPermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';

async function notificationsModule() {
  if (Platform.OS === 'web') return null;
  return import('expo-notifications');
}

function isGranted(permission: { granted?: boolean; status?: string }) {
  return permission.granted === true || permission.status === 'granted';
}

/** Read-only — never prompts. Safe to call on every mount/focus. */
export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  const Notifications = await notificationsModule();
  if (!Notifications) return 'unsupported';
  const permission = await Notifications.getPermissionsAsync();
  if (isGranted(permission)) return 'granted';
  // expo-notifications reports `canAskAgain: false` once the OS will no longer show its own
  // prompt (denied, or iOS after the first ask) — treat that as "denied" so the UI offers Settings
  // instead of silently trying (and failing) to prompt again.
  return permission.canAskAgain === false ? 'denied' : 'undetermined';
}

/** The single place in the codebase that calls Notifications.requestPermissionsAsync(). Callers
 * must only reach this from an athlete's explicit "Enable Notifications" action. */
export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  const Notifications = await notificationsModule();
  if (!Notifications) return 'unsupported';
  const permission = await Notifications.requestPermissionsAsync();
  if (isGranted(permission)) return 'granted';
  return permission.canAskAgain === false ? 'denied' : 'undetermined';
}

export function openSystemNotificationSettings() {
  if (Platform.OS === 'ios') void Linking.openURL('app-settings:');
  else void Linking.openSettings();
}
