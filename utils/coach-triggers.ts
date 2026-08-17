import type { MeetPriority } from '@/types/domain';

/**
 * SprintLab Coach UI Phase C-3: pure, deterministic local trigger detection for the launcher's
 * attention dot (components/coach-launcher.tsx's `hasAttention`, reserved but unused since C-1).
 *
 * This module answers exactly one question: "is there something in the athlete's existing
 * SprintLab data that may be worth Split reviewing with the athlete?" It never decides how
 * training should change — that stays entirely with the athlete choosing to engage, Gemini
 * reasoning about it (/api/coach), and the existing plan-change-validator/apply pipeline as the
 * sole authority over any eventual mutation.
 *
 * Every trigger reuses a signal SprintLab already computes and explains elsewhere rather than
 * inventing new judgment: weekly-progress day status (utils/progress.ts's buildWeeklyProgress),
 * logged RPE (buildRecentSessions), the existing readiness result (app/readiness.tsx's own
 * red/yellow/green computation), and the season engine's priority meet (deriveSeasonPhase). No
 * new scoring, no diagnosis language — see the message copy below.
 *
 * Kept free of any AsyncStorage-backed import so it stays testable under plain Node (see
 * scripts/verify-coach-triggers.ts), mirroring the utils/coach.ts / utils/coach-resolve.ts split.
 */

export type CoachTriggerType =
  | 'missed_workout'
  | 'high_rpe'
  | 'low_readiness'
  | 'repeated_high_effort'
  | 'multiple_missed_sessions'
  | 'meet_approaching';

export type CoachTriggerPriority = 'low' | 'medium' | 'high';

export type CoachTrigger = {
  /** Stable, event-based id (e.g. `missed_workout:2026-08-14`, `high_rpe:<trainingLogId>`) — a
   * new occurrence of the same type gets a new id, so dismissing one never suppresses the type
   * permanently. */
  id: string;
  type: CoachTriggerType;
  priority: CoachTriggerPriority;
  /** Short label for the overlay's suggestion chip. */
  title: string;
  /** What Split noticed, in plain observational language — never a diagnosis (see module docs). */
  message: string;
  /** The exact first-person question sent to /api/coach when the athlete taps the chip. */
  suggestedPrompt: string;
  date?: string;
  entityId?: string;
};

// Thresholds are deliberately conservative and reuse the app's existing 1-10 RPE scale (see
// app/log.tsx's Session RPE picker: "1 = very easy · 10 = maximal").
const HIGH_RPE_THRESHOLD = 9;
const REPEATED_EFFORT_RPE_THRESHOLD = 8;
const REPEATED_EFFORT_LOOKBACK = 3;
const REPEATED_EFFORT_MIN_COUNT = 2;
/** A miss older than this no longer surfaces missed_workout on its own — avoids nagging about a
 * stale, already-passed miss forever. */
const RECENT_MISS_WINDOW_DAYS = 2;
const MEET_APPROACHING_MAX_DAYS = 7;

export type CoachTriggerWeekDayStatus = 'completed' | 'partial' | 'missed' | 'today' | 'upcoming' | 'rest' | 'extra';
export type CoachTriggerWeekDay = { date: string; status: CoachTriggerWeekDayStatus };
export type CoachTriggerRecentSession = { id: string; date: string; rpe: number };
export type CoachTriggerReadiness = { level?: 'green' | 'yellow' | 'red' } | null;
export type CoachTriggerPriorityMeet = { id: string; name: string; date: string; priority: MeetPriority; daysAway: number | null } | null;

export type DetectCoachTriggersInput = {
  today: string;
  /** Current week only (Monday-Sunday), exactly as buildWeeklyProgress already computes it. */
  weekDays: CoachTriggerWeekDay[];
  /** Most-recent-first logged sessions, exactly as buildRecentSessions already computes them. */
  recentSessions: CoachTriggerRecentSession[];
  /** Today's existing readiness result/level — not re-derived here. */
  readiness: CoachTriggerReadiness;
  /** The athlete's next priority meet, exactly as deriveSeasonPhase already exposes it. */
  priorityMeet: CoachTriggerPriorityMeet;
};

function daysBetween(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T12:00:00`);
  const to = new Date(`${toKey}T12:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

const PRIORITY_WEIGHT: Record<CoachTriggerPriority, number> = { high: 2, medium: 1, low: 0 };

/** Returns every currently-active trigger, sorted highest priority first and then most recent
 * first. The caller (utils/coach-triggers-live.ts) picks a single most-relevant one — a lot can
 * be true at once, but the athlete only ever sees one dot, one reason. */
export function detectCoachTriggers(input: DetectCoachTriggersInput): CoachTrigger[] {
  const triggers: CoachTrigger[] = [];

  const missedDaysThisWeek = input.weekDays
    .filter(day => day.status === 'missed')
    .sort((first, second) => second.date.localeCompare(first.date));

  if (missedDaysThisWeek.length >= 2) {
    const mostRecent = missedDaysThisWeek[0];
    triggers.push({
      id: `multiple_missed_sessions:${mostRecent.date}:${missedDaysThisWeek.length}`,
      type: 'multiple_missed_sessions',
      priority: 'high',
      title: 'Reconsider my week',
      message: `You've missed ${missedDaysThisWeek.length} planned sessions this week.`,
      suggestedPrompt: 'I’ve missed a couple of planned sessions this week. Can we reconsider the rest of my week?',
      date: mostRecent.date,
    });
  } else if (missedDaysThisWeek.length === 1 && daysBetween(missedDaysThisWeek[0].date, input.today) <= RECENT_MISS_WINDOW_DAYS) {
    const missed = missedDaysThisWeek[0];
    triggers.push({
      id: `missed_workout:${missed.date}`,
      type: 'missed_workout',
      priority: 'medium',
      title: 'Review my week',
      message: 'You missed a scheduled workout.',
      suggestedPrompt: 'I missed my scheduled workout. Should we change the rest of my week?',
      date: missed.date,
    });
  }

  const mostRecentSession = input.recentSessions[0];
  if (mostRecentSession && mostRecentSession.rpe >= HIGH_RPE_THRESHOLD) {
    triggers.push({
      id: `high_rpe:${mostRecentSession.id}`,
      type: 'high_rpe',
      priority: 'medium',
      title: 'Review what’s next',
      message: 'That session was harder than usual.',
      suggestedPrompt: 'That last session was harder than usual for me. Can you review what I have coming up next?',
      date: mostRecentSession.date,
      entityId: mostRecentSession.id,
    });
  }

  const recentDemandingSessions = input.recentSessions
    .slice(0, REPEATED_EFFORT_LOOKBACK)
    .filter(session => session.rpe >= REPEATED_EFFORT_RPE_THRESHOLD);
  if (recentDemandingSessions.length >= REPEATED_EFFORT_MIN_COUNT) {
    const mostRecent = recentDemandingSessions[0];
    triggers.push({
      id: `repeated_high_effort:${mostRecent.id}`,
      type: 'repeated_high_effort',
      priority: 'medium',
      title: 'Check recent load',
      message: 'Your recent sessions have been demanding.',
      suggestedPrompt: 'My recent sessions have been demanding. Can you review what’s coming up next?',
      date: mostRecent.date,
      entityId: mostRecent.id,
    });
  }

  if (input.readiness?.level === 'red' || input.readiness?.level === 'yellow') {
    const isRed = input.readiness.level === 'red';
    triggers.push({
      id: `low_readiness:${input.today}`,
      type: 'low_readiness',
      priority: isRed ? 'high' : 'medium',
      title: 'Review today’s session',
      message: isRed ? 'Your readiness came back low today.' : 'Your readiness is lower today.',
      suggestedPrompt: 'My readiness is lower today. Can you review today’s session with me?',
      date: input.today,
    });
  }

  if (
    input.priorityMeet
    && (input.priorityMeet.priority === 'A' || input.priorityMeet.priority === 'B')
    && input.priorityMeet.daysAway !== null
    && input.priorityMeet.daysAway >= 0
    && input.priorityMeet.daysAway <= MEET_APPROACHING_MAX_DAYS
  ) {
    triggers.push({
      id: `meet_approaching:${input.priorityMeet.id}`,
      type: 'meet_approaching',
      priority: 'low',
      title: 'Review this week',
      message: 'Your meet is getting close.',
      suggestedPrompt: 'My meet is getting close. Can you review how this week lines up?',
      date: input.priorityMeet.date,
      entityId: input.priorityMeet.id,
    });
  }

  return triggers.sort((first, second) => {
    const weightDiff = PRIORITY_WEIGHT[second.priority] - PRIORITY_WEIGHT[first.priority];
    if (weightDiff !== 0) return weightDiff;
    return (second.date ?? '').localeCompare(first.date ?? '');
  });
}

/** Returns the single most relevant trigger the athlete hasn't already dismissed for this exact
 * occurrence. A later, different occurrence of the same type (a new id) is still eligible. */
export function selectActiveCoachTrigger(triggers: CoachTrigger[], dismissedIds: string[]): CoachTrigger | null {
  const dismissed = new Set(dismissedIds);
  return triggers.find(trigger => !dismissed.has(trigger.id)) ?? null;
}
