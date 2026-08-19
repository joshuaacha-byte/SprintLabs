import type { RestTimerState } from '@/types';

// Pure, storage-free rest-timer math. app/workout.tsx is the only place that reads/writes
// ActiveWorkoutSession.restTimer, but the arithmetic lives here so it stays testable and so the
// screen never has to reason about wall-clock math inline. The countdown is always derived from
// `endsAt` (a real timestamp) vs. the current time — never from repeatedly decrementing a stored
// counter — so backgrounding the app or locking the phone (which suspends JS execution, not the
// real clock) can never leave the displayed time wrong: the very next render recomputes it exactly.

/** A fresh, not-yet-started rest timer for the athlete's real prescribed duration. */
export function createRestTimer(totalSeconds: number, next: string): RestTimerState {
  return { totalSeconds, next, running: false, remainingSeconds: totalSeconds };
}

/** The current remaining seconds, clamped to zero — the single function every read site (display,
 * finish detection) should go through instead of touching `remainingSeconds`/`endsAt` directly. */
export function restRemainingSeconds(rest: RestTimerState | null | undefined, now = Date.now()): number {
  if (!rest) return 0;
  if (!rest.running || !rest.endsAt) return Math.max(0, Math.round(rest.remainingSeconds));
  const remaining = Math.round((new Date(rest.endsAt).getTime() - now) / 1000);
  return Math.max(0, remaining);
}

export function isRestFinished(rest: RestTimerState | null | undefined, now = Date.now()): boolean {
  return Boolean(rest) && rest!.running && restRemainingSeconds(rest, now) <= 0;
}

/** Begins/resumes counting down from whatever is currently remaining. */
export function startRestTimer(rest: RestTimerState, now = Date.now()): RestTimerState {
  const remaining = rest.running ? restRemainingSeconds(rest, now) : rest.remainingSeconds;
  return { ...rest, running: true, endsAt: new Date(now + Math.max(0, remaining) * 1000).toISOString() };
}

/** Freezes the countdown at its current remaining value. */
export function pauseRestTimer(rest: RestTimerState, now = Date.now()): RestTimerState {
  return { ...rest, running: false, remainingSeconds: restRemainingSeconds(rest, now), endsAt: undefined };
}

/** Adds (or subtracts) seconds to whichever value is currently authoritative. */
export function addRestSeconds(rest: RestTimerState, delta: number, now = Date.now()): RestTimerState {
  if (rest.running && rest.endsAt) {
    return { ...rest, endsAt: new Date(new Date(rest.endsAt).getTime() + delta * 1000).toISOString() };
  }
  return { ...rest, remainingSeconds: Math.max(0, rest.remainingSeconds + delta) };
}

/** Stops the countdown and freezes it at zero — used the moment the timer reaches the end, so the
 * athlete sees a clear "rest complete" state instead of the strip silently vanishing. */
export function finishRestTimer(rest: RestTimerState): RestTimerState {
  return { ...rest, running: false, remainingSeconds: 0, endsAt: undefined };
}
