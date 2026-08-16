import * as Haptics from 'expo-haptics';

/**
 * Central haptic service. Call sites describe the meaning of an interaction and
 * never depend on Expo Haptics directly.
 */

type HapticKind = 'tap' | 'selection' | 'completeStep' | 'success' | 'warning' | 'error';

let lastFeedback: { kind: HapticKind; at: number } | null = null;
const DUPLICATE_WINDOW_MS = 45;

const fire = (kind: HapticKind, action: () => Promise<void>) => {
  const now = Date.now();
  if (lastFeedback && lastFeedback.kind === kind && now - lastFeedback.at < DUPLICATE_WINDOW_MS) return;
  lastFeedback = { kind, at: now };
  void action().catch(() => undefined);
};

/** Normal buttons, navigation, back/close, and opening details or controls. */
export const tap = () =>
  fire('tap', () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

/** A selectable value actually changed. */
export const selection = () =>
  fire('selection', () => Haptics.selectionAsync());

/** A meaningful step, exercise, stage, or save was completed. */
export const completeStep = () =>
  fire('completeStep', () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

/** A major action completed successfully. */
export const success = () =>
  fire('success', () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

/** A caution, skip, removal, pain signal, or schedule concern. */
export const warning = () =>
  fire('warning', () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));

/** Validation, save, or invalid-action failure. */
export const error = () =>
  fire('error', () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));

/** A rep, set, exercise, or section was marked complete. */
export const hapticComplete = tap;

/** A bulk action completed several units at once (mark-all-done, complete section). */
export const hapticBulkComplete = completeStep;

/** The rest timer started or paused. */
export const hapticTimerToggle = selection;

/** A picker or selector settled on a new value. */
export const hapticSelection = selection;

/** A whole session finished, a personal best was logged, or another genuine accomplishment landed. */
export const hapticSuccess = success;

/** A consequential action (delete, archive, erase, remove) was just confirmed. */
export const hapticWarning = warning;

/** Validation and failed actions. */
export const hapticError = error;
