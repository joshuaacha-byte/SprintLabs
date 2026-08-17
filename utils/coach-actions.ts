import type { Href } from 'expo-router';
import type { CoachAction, CoachActionType } from '@/types';

/**
 * SprintLab Coach UI Phase C-4: pure helpers for Coach action cards (navigation/workflow cards —
 * see components/coach-action-card.tsx). Deliberately free of any AsyncStorage-backed import
 * (unlike utils/coach-actions-resolve.ts, which fetches live data and hands it to
 * `describeCoachAction` below) so this file stays testable under plain Node — see
 * scripts/verify-coach-actions.ts. Mirrors the existing coach.ts/coach-resolve.ts (Phase C-2)
 * and coach-triggers.ts/coach-triggers-live.ts (Phase C-3) pure/AsyncStorage splits.
 */

export type CoachActionDisplay = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  buttonLabel: string;
};

export const COACH_ACTION_BUTTON_LABELS: Record<CoachActionType, string> = {
  complete_readiness: 'Complete readiness check',
  view_workout: 'View workout',
  start_workout: 'Start workout',
  log_session: 'Log session',
  review_week: 'Review week',
  update_profile: 'Update profile',
};

export const COACH_ACTION_ICONS: Record<CoachActionType, string> = {
  complete_readiness: 'monitor-heart',
  view_workout: 'visibility',
  start_workout: 'bolt',
  log_session: 'edit-note',
  review_week: 'calendar-month',
  update_profile: 'person',
};

/** Already-fetched live data a card's display might depend on. Every field is optional/undefined
 * when not applicable to the action being resolved — utils/coach-actions-resolve.ts only fetches
 * what the specific action type actually needs. */
export type CoachActionResolutionInput = {
  /** complete_readiness: true if today already has a readiness record (completed or skipped). */
  readinessAlreadyDone?: boolean;
  /** start_workout: title of an already-active session, if one exists (takes priority — offers Resume instead). */
  activeSessionTitle?: string;
  /** start_workout: today's real scheduled workout, or null if today is rest/has no record. */
  todayWorkout?: { title: string; purpose?: string; exerciseCount: number } | null;
  /** view_workout: the resolved Workout Library record for action.workoutId, or null if it doesn't exist. */
  libraryWorkout?: { name: string; category: string; minMinutes?: number; maxMinutes?: number } | null;
  /** log_session: the real scheduled workout on action.date, if that date resolves to one. */
  loggedDateWorkout?: { weekdayLabel: string; title: string } | null;
  /** review_week: current week's due/completed counts from buildWeeklyProgress. */
  weeklyProgress?: { completed: number; due: number };
};

/** Pure: turns a CoachAction plus already-resolved live data into either the display a card
 * actually renders, or null when the action can't be confidently/usefully shown right now (an
 * unknown workout id, a workout with no exercises, a readiness check already done, etc.) — the
 * caller then falls back to plain text instead of a broken button. Never invents data: every
 * piece of shown text comes from `resolved`, not from the raw action fields Gemini supplied
 * (except `update_profile`'s free-text `field` label, which is purely descriptive). */
export function describeCoachAction(
  action: CoachAction,
  resolved: CoachActionResolutionInput = {},
): { action: CoachAction; display: CoachActionDisplay } | null {
  switch (action.type) {
    case 'complete_readiness': {
      if (resolved.readinessAlreadyDone) return null;
      return {
        action,
        display: {
          eyebrow: 'TODAY’S READINESS',
          title: 'No readiness check completed yet.',
          buttonLabel: COACH_ACTION_BUTTON_LABELS.complete_readiness,
        },
      };
    }

    case 'start_workout': {
      if (resolved.activeSessionTitle) {
        return { action, display: { eyebrow: 'IN PROGRESS', title: resolved.activeSessionTitle, buttonLabel: 'Resume workout' } };
      }
      const workout = resolved.todayWorkout;
      if (!workout || workout.exerciseCount === 0) return null;
      return {
        action,
        display: { eyebrow: 'TODAY', title: workout.title, subtitle: workout.purpose, buttonLabel: COACH_ACTION_BUTTON_LABELS.start_workout },
      };
    }

    case 'view_workout': {
      if (!action.workoutId || !action.workoutId.trim() || !resolved.libraryWorkout) return null;
      const { name, category, minMinutes, maxMinutes } = resolved.libraryWorkout;
      return {
        action,
        display: {
          eyebrow: category.replaceAll('-', ' ').toUpperCase(),
          title: name,
          subtitle: minMinutes && maxMinutes ? `${minMinutes}–${maxMinutes} min` : undefined,
          buttonLabel: COACH_ACTION_BUTTON_LABELS.view_workout,
        },
      };
    }

    case 'log_session': {
      const day = resolved.loggedDateWorkout;
      return {
        action,
        display: {
          eyebrow: day ? day.weekdayLabel.toUpperCase() : 'UNLOGGED SESSION',
          title: day ? day.title : 'A recent session hasn’t been logged.',
          subtitle: 'Not logged',
          buttonLabel: COACH_ACTION_BUTTON_LABELS.log_session,
        },
      };
    }

    case 'review_week': {
      const { completed = 0, due = 0 } = resolved.weeklyProgress ?? {};
      return {
        action,
        display: {
          eyebrow: 'THIS WEEK',
          title: due > 0 ? `${completed} of ${due} sessions completed so far` : 'No scheduled sessions this week yet',
          buttonLabel: COACH_ACTION_BUTTON_LABELS.review_week,
        },
      };
    }

    case 'update_profile': {
      const field = action.field?.trim().slice(0, 80);
      return {
        action,
        display: {
          eyebrow: 'ATHLETE PROFILE',
          title: field || 'A profile detail could help personalize this.',
          buttonLabel: COACH_ACTION_BUTTON_LABELS.update_profile,
        },
      };
    }

    default:
      return null;
  }
}

/** The typed-action -> known-destination mapping SprintLab owns, using Expo Router's own typed
 * `Href` (this project has `experiments.typedRoutes` on) — never a Gemini-supplied string.
 * `start_workout` isn't included: it doesn't map to a plain route push (see
 * components/coach-action-card.tsx, which reuses utils/workout-launch.ts's existing
 * prepareWorkoutLaunch instead, exactly like app/library-detail.tsx already does for its own
 * "start now" action). Gemini can only select one of the CoachActionType values; it can never
 * supply a route string of its own. */
export function coachActionRoute(action: CoachAction): Href | null {
  switch (action.type) {
    case 'complete_readiness':
      return '/readiness';
    case 'view_workout':
      return { pathname: '/library-detail', params: { id: action.workoutId } };
    case 'log_session':
      return '/log';
    case 'review_week':
      return '/plan';
    case 'update_profile':
      return { pathname: '/profile', params: { mode: 'edit' } };
    case 'start_workout':
      return null;
    default:
      return null;
  }
}
