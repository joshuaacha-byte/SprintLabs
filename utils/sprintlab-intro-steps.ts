import type { SprintLabIntroStep } from '@/types/sprintlab-intro';

/**
 * Copy/config for the four-moment first-time SprintLab tour (see components/sprintlab-intro-*).
 * Kept as a plain ordered array so reordering, editing copy, or adding/removing a step is a
 * one-file change — the context/overlay components only ever iterate this list.
 */
export const SPRINTLAB_INTRO_STEPS: SprintLabIntroStep[] = [
  {
    id: 'workout',
    targetId: 'today-hero-card',
    eyebrow: 'Personalized training',
    title: 'Your training, built for you.',
    body: 'SprintLab builds your sessions around your events, goals, schedule, training level, and available equipment.',
  },
  {
    id: 'readiness',
    targetId: 'today-readiness',
    eyebrow: 'Readiness + adaptation',
    title: 'Your plan can adapt.',
    body: 'Check in before training so SprintLab knows how you’re feeling. When needed, your session can adjust instead of blindly following the original plan.',
  },
  {
    id: 'coach',
    targetId: 'coach-launcher',
    eyebrow: 'SprintLab Coach',
    title: 'Meet SprintLab Coach.',
    body: 'Ask about today’s training, understand why you’re doing something, adjust your plan, or find alternatives when something doesn’t work.',
  },
  {
    id: 'progress',
    targetId: 'progress-hero',
    eyebrow: 'Progress',
    title: 'Your training adds up.',
    body: 'SprintLab tracks your completed sessions, consistency, PRs, milestones, and progress over time.',
  },
  {
    id: 'final',
    eyebrow: 'SprintLab',
    title: 'You’re ready to train.',
    body: 'Your plan is built. Your first session is waiting.',
  },
];

/** Coach step's informational-only example prompts — never actually sent, see the tour's own copy. */
export const SPRINTLAB_INTRO_COACH_CHIPS = [
  'Why am I doing flying 20s?',
  'Find a substitute for this exercise',
  'Help with today’s session',
];
