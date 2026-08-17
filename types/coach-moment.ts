/**
 * A lightweight, locally-derived observation SprintLab surfaces right where an event actually
 * happened (workout completion today; Today/Progress/History later) — never a chat message, and
 * never something that on its own calls Gemini. See utils/coach-moments.ts for how these are
 * derived from real stored data, and components/coach-moment-card.tsx for how they render.
 */
export type CoachMomentEventType =
  | 'workout-completed'
  | 'workout-ended-early'
  | 'weekly-target-completed'
  | 'plan-streak-milestone'
  | 'consistency-milestone'
  | 'high-rpe'
  | 'pr-recorded'
  | 'first-workout';

export type CoachMomentSeverity = 'low' | 'medium' | 'high';

export type CoachMoment = {
  id: string;
  type: CoachMomentEventType;
  severity: CoachMomentSeverity;
  headline: string;
  body?: string;
  /** Present only for type === 'pr-recorded' — drives the distinct "NEW BEST" visual treatment
   * instead of the plain headline/body card every other moment type uses. */
  pr?: {
    event: string;
    newTimeSeconds: number;
    previousTimeSeconds: number;
    improvementSeconds: number;
  };
  /**
   * When present, renders a tappable "Ask Split about this →" handoff. `displayText` is what
   * appears in the conversation; `promptOverride` (when different) is what's actually sent to
   * Gemini — the exact same displayText/promptOverride split components/coach-context.tsx's
   * sendMessage already uses for every other suggestion chip, so a Coach Moment handoff is not a
   * new send mechanism. Tapping it is the ONLY thing that triggers a real Gemini call — showing
   * the card itself never does.
   */
  handoff?: { displayText: string; promptOverride?: string; surface: string };
};
