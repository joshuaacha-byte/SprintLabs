import type { PlanChangeProposal, PlanChangeType, WeekdayIndex } from '@/types';
import { weekdayLabels } from '@/data/workouts';

/**
 * SprintLab Coach UI Phase C-2: pure helpers shared between components/coach-context.tsx (owns
 * conversation state) and components/coach-overlay.tsx (renders it). Deliberately free of any
 * AsyncStorage-backed import (unlike utils/coach-resolve.ts, which resolves proposal display
 * text against live storage) so this file — and its logic — can be verified offline in
 * scripts/verify-coach-proposal.ts under plain Node, without React Native or a live Gemini
 * call. Mirrors the existing plan-change-validator.ts (pure) / plan-change-apply.ts
 * (AsyncStorage) split from SprintLab Intelligence I-2.
 */

// --- suggestion chips -> real prompts --------------------------------------------------
// The chip shows the short label; the fuller prompt is what actually gets sent to Coach.
export const SUGGESTION_PROMPTS: Record<string, string> = {
  'Why this workout?': 'Why is my current or next scheduled workout structured the way it is? Explain the reasoning behind it using my actual training context.',
  'Adjust today’s session': 'Based on my recent training, readiness, and history, should today’s session be adjusted? If a specific change is warranted, propose one.',
  'I’m short on time': 'I have less time available than planned for training today. How should I adapt the session while preserving the most important training stimulus?',
  'How am I looking this week?': 'Evaluate how my current week is going using my recent training, readiness, and history. Be specific and honest.',
};

// --- multi-turn history bounding -------------------------------------------------------
export const MAX_HISTORY_MESSAGES = 6; // ~3 exchanges — enough for a follow-up like "why not Saturday instead?"

export type CoachHistoryTurn = { role: 'athlete' | 'split'; text: string };

/** Takes the last N text-bearing turns (never proposal cards or error messages — those aren't meaningful conversational content for Gemini) for sending as bounded conversation history. */
export function boundedHistory(messages: { kind: string; text: string }[], max = MAX_HISTORY_MESSAGES): CoachHistoryTurn[] {
  return messages
    .filter((message): message is { kind: 'athlete' | 'split'; text: string } => message.kind === 'athlete' || message.kind === 'split')
    .slice(-max)
    .map(message => ({ role: message.kind, text: message.text }));
}

// --- friendly, non-leaky error copy -----------------------------------------------------
export const COACH_ERROR_COPY = {
  rateLimited: 'Split is temporarily unavailable. Try again shortly.',
  network: 'Split couldn’t reach SprintLab. Check your connection and try again.',
  generic: 'Split couldn’t answer that just now. Try again in a moment.',
  noProfile: 'Complete your SprintLab profile before asking Split a question.',
  staleProposal: 'Your plan changed since this was suggested. Ask Split for a fresh recommendation.',
} as const;

// --- proposal display -------------------------------------------------------------------
const ACTION_LABELS: Record<PlanChangeType, string> = {
  move_workout: 'MOVE WORKOUT',
  replace_workout: 'REPLACE WORKOUT',
  change_workout_variant: 'CHANGE VARIANT',
  adjust_volume: 'ADJUST VOLUME',
  add_recovery_day: 'ADD RECOVERY DAY',
  remove_future_workout: 'REMOVE WORKOUT',
};

export type ProposalDisplay = {
  actionLabel: string;
  subjectTitle: string;
  fromLabel: string;
  toLabel: string;
};

export function weekdayLabelForDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return weekdayLabels[parsed.getDay() as WeekdayIndex]?.full ?? date;
}

/** Pure — turns a raw PlanChangeProposal plus optionally-resolved workout titles into the strings the proposal card actually renders. Never shows raw JSON. */
export function describeProposal(proposal: PlanChangeProposal, resolved: { currentTitle?: string; newTitle?: string } = {}): ProposalDisplay {
  const actionLabel = ACTION_LABELS[proposal.type] ?? proposal.type.replaceAll('_', ' ').toUpperCase();
  const subjectTitle = resolved.currentTitle ?? 'This session';

  switch (proposal.type) {
    case 'move_workout':
      return { actionLabel, subjectTitle, fromLabel: weekdayLabelForDate(proposal.date), toLabel: proposal.toDate ? weekdayLabelForDate(proposal.toDate) : '—' };
    case 'replace_workout':
    case 'change_workout_variant':
      return { actionLabel, subjectTitle, fromLabel: subjectTitle, toLabel: resolved.newTitle ?? 'New workout' };
    case 'adjust_volume': {
      const modifier = typeof proposal.modifier === 'number' ? proposal.modifier : 1;
      return { actionLabel, subjectTitle, fromLabel: '100% volume', toLabel: `${Math.round(modifier * 100)}% volume` };
    }
    case 'add_recovery_day':
      return { actionLabel, subjectTitle, fromLabel: subjectTitle, toLabel: proposal.recoveryTitle?.trim() || 'Recovery day' };
    case 'remove_future_workout':
      return { actionLabel, subjectTitle, fromLabel: subjectTitle, toLabel: 'Rest day' };
    default:
      return { actionLabel, subjectTitle, fromLabel: '—', toLabel: '—' };
  }
}
