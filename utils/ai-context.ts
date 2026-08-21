import type { AthleteProfile, CompletedWorkoutSession, LibraryWorkout, ReadinessDecision, ScheduledDay, TrainingLogSummary } from '@/types';
import { buildRecentSessions, buildWeeklyProgress, toLocalDateKey, type ScheduleHistoryEntry } from '@/utils/progress';
import { deriveSeasonPhase } from '@/utils/season-engine';
import { buildCoachLibraryCandidates, type LibraryCandidateSummary } from '@/utils/library-retrieval';

/**
 * Converts SprintLab's existing internal records into a compact, normalized object safe to
 * send to Gemini as live athlete context. This intentionally reuses the same computations
 * already trusted elsewhere in the app (buildWeeklyProgress, buildRecentSessions,
 * deriveSeasonPhase) rather than re-deriving athlete state a second way.
 *
 * Deliberately excluded: the full workout library, entire history, UI/navigation/visual state,
 * and anything not useful for answering a training question. `libraryCandidates` is the one
 * exception — a small, retrieval-selected set (utils/library-retrieval.ts) of real Library
 * workouts relevant to today's session and this athlete, so a replace_workout/change_workout_variant
 * proposal can reference a real id instead of guessing one.
 */

const RECENT_TRAINING_LIMIT = 8;
const NOTE_MAX_CHARS = 220;

const truncate = (value: string, max: number) => value.length > max ? `${value.slice(0, max)}…` : value;

export type AthleteAIContext = {
  athlete: {
    name?: string;
    sport: string;
    /** Free-text sport name when the athlete's sport is 'other' — otherwise omitted. */
    otherSportName?: string;
    /** e.g. "Wide receiver" — only meaningful for a non-track sport. */
    sportPosition?: string;
    primaryEvent?: string;
    secondaryEvents?: string[];
    /** The event the athlete says matters most right now, when it differs from primaryEvent. */
    priorityEvent?: string;
    trainingLevel: string;
    trainingDaysPerWeek: number;
    prs: { event: string; timeSeconds: number; date?: string }[];
    /** Athlete-entered goal times — separate from prs (what they've done) and goals (qualitative
     * focus areas) so Coach can reference what they're chasing, not just where they are. */
    targetTimes: { event: string; timeSeconds: number; targetDate?: string }[];
    goals: string[];
    /** Recorded verbatim from the athlete/coach; factual constraints, not SprintLab's judgment. */
    restrictions?: {
      coach?: string;
      medical?: string;
      cautionAreas?: string[];
      currentPain?: boolean;
      /** Structured concern follow-ups (area + currently-limiting/recently-cleared/monitoring),
       * distinct from cautionAreas — this carries status, not just area. */
      concernAreas?: { area: string; status: string; detail?: string }[];
      returningAfterTimeOff?: boolean;
      timeAwayDuration?: string;
    };
    /** Only present for a football athlete who entered baseline/target numbers — informational,
     * never a plan-selection input. */
    footballTests?: { fortyYardDashTime?: number; targetFortyYardDashTime?: number; proAgilityTime?: number };
  };
  season: {
    phase: string;
    explanation: string;
    priorityMeet: { name: string; date: string; priority: string; daysAway: number | null } | null;
  };
  currentWeek: {
    startDate: string;
    days: { date: string; status: string; workoutTitle?: string }[];
    completed: number;
    due: number;
  };
  recentTraining: {
    date: string;
    title: string;
    completed: boolean;
    rpe: number;
    notes?: string;
    /** A specific area the athlete flagged after this session, when present — separate from
     * general soreness, sourced from the same Log a Session report Progress's "Recurring
     * discomfort" surfaces from. */
    painArea?: string;
  }[];
  recovery: {
    latestReadiness?: { date: string; level?: string; reasons?: string[] };
    recentRpeAverage?: number;
  };
  /** A small, retrieval-selected set of real Approved Library workouts relevant right now —
   * never the full library. See utils/library-retrieval.ts::buildCoachLibraryCandidates. */
  libraryCandidates: LibraryCandidateSummary[];
};

export type AthleteAIContextInput = {
  profile: AthleteProfile;
  schedule: ScheduledDay[];
  scheduleHistory: ScheduleHistoryEntry[];
  sessions: CompletedWorkoutSession[];
  logs: TrainingLogSummary[];
  readiness: ReadinessDecision | null;
  libraryWorkouts: LibraryWorkout[];
  now?: Date;
};

export function buildAthleteAIContext(input: AthleteAIContextInput): AthleteAIContext {
  const now = input.now ?? new Date();
  const { profile } = input;

  const season = deriveSeasonPhase(profile, toLocalDateKey(now));
  const weekly = buildWeeklyProgress(input.schedule, input.sessions, now, input.scheduleHistory);
  const recent = buildRecentSessions(input.logs, input.sessions, RECENT_TRAINING_LIMIT);
  const recentRpeValues = recent.map(session => session.rpe).filter(rpe => rpe > 0);

  const todayScheduledDay = input.schedule.find(day => day.dayIndex === now.getDay());
  const libraryCandidates = buildCoachLibraryCandidates({
    workouts: input.libraryWorkouts,
    profile,
    schedule: input.schedule,
    todayWorkoutId: todayScheduledDay?.kind === 'workout' ? todayScheduledDay.workout?.id : undefined,
  });

  const concernAreas = profile.trainingConcernDetails?.length
    ? profile.trainingConcernDetails.map(detail => ({
        area: detail.area,
        status: detail.status,
        detail: detail.area === 'other' ? profile.otherConcernArea?.trim() || undefined : undefined,
      }))
    : undefined;

  const restrictions = (
    profile.coachRestrictions
    || profile.medicalRestrictions
    || profile.cautionAreas?.length
    || profile.currentPain
    || concernAreas
    || profile.returningAfterTimeOff
  )
    ? {
        coach: profile.coachRestrictions?.trim() || undefined,
        medical: profile.medicalRestrictions?.trim() || undefined,
        cautionAreas: profile.cautionAreas?.length ? profile.cautionAreas : undefined,
        currentPain: profile.currentPain || undefined,
        concernAreas,
        returningAfterTimeOff: profile.returningAfterTimeOff || undefined,
        timeAwayDuration: profile.returningAfterTimeOff ? profile.timeAwayDuration : undefined,
      }
    : undefined;

  const footballTests = (profile.primarySport ?? profile.sport) === 'football' && profile.footballProfile
    ? {
        fortyYardDashTime: profile.footballProfile.fortyYardDashTime,
        targetFortyYardDashTime: profile.footballProfile.targetFortyYardDashTime,
        proAgilityTime: profile.footballProfile.proAgilityTime,
      }
    : undefined;

  return {
    athlete: {
      name: profile.name?.trim() || undefined,
      sport: profile.primarySport ?? profile.sport ?? 'track-and-field',
      otherSportName: (profile.primarySport ?? profile.sport) === 'other' ? profile.otherSportParticipation?.trim() || undefined : undefined,
      sportPosition: profile.sportPosition?.trim() || undefined,
      primaryEvent: profile.primaryEvent,
      secondaryEvents: profile.secondaryEvents?.length ? profile.secondaryEvents : undefined,
      priorityEvent: profile.targetEvent && profile.targetEvent !== profile.primaryEvent ? profile.targetEvent : undefined,
      trainingLevel: profile.experienceLevel,
      trainingDaysPerWeek: profile.trainingDaysPerWeek,
      prs: profile.personalBests.map(pr => ({ event: pr.event, timeSeconds: pr.timeSeconds, date: pr.date })),
      targetTimes: (profile.targetPerformances ?? []).map(target => ({ event: target.event, timeSeconds: target.timeSeconds, targetDate: target.targetDate ?? undefined })),
      goals: [...new Set([...(profile.speedGoals ?? []), ...(profile.raceDevelopmentAreas ?? []), profile.primaryGoal].filter(Boolean) as string[])],
      restrictions,
      footballTests,
    },
    season: {
      phase: season.phase,
      explanation: season.explanation,
      priorityMeet: season.nextMeet ? {
        name: season.nextMeet.name,
        date: season.nextMeet.date,
        priority: season.nextMeet.priority,
        daysAway: season.daysToNextMeet,
      } : null,
    },
    currentWeek: {
      startDate: weekly.days[0]?.date ?? toLocalDateKey(now),
      days: weekly.days.map(day => ({ date: day.date, status: day.status, workoutTitle: day.workoutTitle })),
      completed: weekly.completed,
      due: weekly.due,
    },
    recentTraining: recent.map(session => {
      const log = input.logs.find(item => item.id === session.id);
      return {
        date: session.date,
        title: session.title,
        completed: session.completed,
        rpe: session.rpe,
        notes: log?.notes ? truncate(log.notes, NOTE_MAX_CHARS) : undefined,
        painArea: log?.painArea ?? undefined,
      };
    }),
    recovery: {
      latestReadiness: input.readiness && input.readiness.status === 'completed'
        ? { date: input.readiness.date, level: input.readiness.readinessLevel, reasons: input.readiness.readinessReasons }
        : undefined,
      recentRpeAverage: recentRpeValues.length
        ? Math.round((recentRpeValues.reduce((sum, value) => sum + value, 0) / recentRpeValues.length) * 10) / 10
        : undefined,
    },
    libraryCandidates,
  };
}
