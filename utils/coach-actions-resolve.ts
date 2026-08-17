import type { CoachAction, WeekdayIndex } from '@/types';
import { describeCoachAction, type CoachActionDisplay, type CoachActionResolutionInput } from '@/utils/coach-actions';
import { weekdayLabelForDate } from '@/utils/coach';
import { buildWeeklyProgress, toLocalDateKey } from '@/utils/progress';
import {
  getActiveWorkoutSession,
  getCompletedWorkoutSessions,
  getReadiness,
  getScheduleHistory,
  getScheduledDay,
  getScheduledDayForDate,
  getWeekSchedule,
} from '@/utils/storage';
import { getLibraryWorkout } from '@/utils/workout-library';

// SprintLab Coach UI Phase C-4: the AsyncStorage-backed half of action resolution, kept separate
// from utils/coach-actions.ts's pure describeCoachAction() so that pure decision logic stays
// testable under plain Node (see scripts/verify-coach-actions.ts) without pulling in React
// Native's AsyncStorage module — mirrors the coach.ts/coach-resolve.ts and
// coach-triggers.ts/coach-triggers-live.ts splits from Phases C-2 and C-3.
//
// This file's only job is: fetch exactly the live data the given action type needs, then hand it
// to describeCoachAction(). Treat a Gemini-returned action as a REQUEST, not truth — an
// unresolved/invalid/no-longer-relevant reference makes describeCoachAction() return null, and
// the caller (components/coach-context.tsx) falls back to plain text instead of a broken button.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function fetchResolutionInput(action: CoachAction): Promise<CoachActionResolutionInput> {
  const today = toLocalDateKey(new Date());

  switch (action.type) {
    case 'complete_readiness': {
      const readiness = await getReadiness(today);
      return { readinessAlreadyDone: Boolean(readiness) };
    }

    case 'start_workout': {
      const active = await getActiveWorkoutSession();
      if (active) return { activeSessionTitle: active.plannedWorkoutSnapshot.title };
      const todayIndex = new Date().getDay() as WeekdayIndex;
      const day = await getScheduledDay(todayIndex, today);
      if (day.kind !== 'workout' || !day.workout) return { todayWorkout: null };
      const exerciseCount = day.workout.sections.reduce((sum, section) => sum + section.exercises.length, 0);
      return { todayWorkout: { title: day.workout.title, purpose: day.workout.purpose, exerciseCount } };
    }

    case 'view_workout': {
      if (!action.workoutId || !action.workoutId.trim()) return { libraryWorkout: null };
      const workout = await getLibraryWorkout(action.workoutId);
      if (!workout) return { libraryWorkout: null };
      const [minMinutes, maxMinutes] = workout.metrics.estimatedDurationMinutes;
      return { libraryWorkout: { name: workout.name, category: workout.primaryCategory, minMinutes, maxMinutes } };
    }

    case 'log_session': {
      if (!action.date || !ISO_DATE_RE.test(action.date) || action.date > today) return { loggedDateWorkout: null };
      const day = await getScheduledDayForDate(action.date);
      if (day.kind !== 'workout' || !day.workout) return { loggedDateWorkout: null };
      return { loggedDateWorkout: { weekdayLabel: weekdayLabelForDate(action.date), title: day.workout.title } };
    }

    case 'review_week': {
      const [schedule, history, sessions] = await Promise.all([
        getWeekSchedule(),
        getScheduleHistory(),
        getCompletedWorkoutSessions(),
      ]);
      const weekly = buildWeeklyProgress(schedule, sessions, new Date(), history);
      return { weeklyProgress: { completed: weekly.completed, due: weekly.due } };
    }

    case 'update_profile':
      return {};

    default:
      return {};
  }
}

/** Resolves/validates a Gemini-returned CoachAction against live storage and returns the display
 * data a card actually renders, or null if it can't be confidently resolved right now. Read-only
 * — never mutates anything, exactly like utils/coach-resolve.ts's proposal resolver. */
export async function resolveCoachActionDisplay(action: CoachAction): Promise<{ action: CoachAction; display: CoachActionDisplay } | null> {
  const resolved = await fetchResolutionInput(action);
  return describeCoachAction(action, resolved);
}
