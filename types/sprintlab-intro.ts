export type SprintLabIntroStepId = 'workout' | 'readiness' | 'coach' | 'progress' | 'final';

/** A single moment in the first-time SprintLab product tour (components/sprintlab-intro-overlay.tsx).
 * `targetId` is the registry key (see components/sprintlab-intro-context.tsx's useIntroTarget) of
 * the real on-screen element this step spotlights — omitted for a step that shows a centered card
 * with no cutout (the Progress preview panel and the final reveal). Reordering, editing copy, or
 * adding/removing a step means only touching utils/sprintlab-intro-steps.ts; this shape and the
 * overlay that renders it don't need to change for that. */
export type SprintLabIntroStep = {
  id: SprintLabIntroStepId;
  targetId?: string;
  eyebrow: string;
  title: string;
  body: string;
};
