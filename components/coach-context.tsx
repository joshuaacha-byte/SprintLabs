import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import type { CoachResponsePayload, PlanChangeProposal } from '@/types';
import { buildCurrentAthleteAIContext } from '@/utils/ai-context-live';
import { applyAIPlanChange } from '@/utils/plan-change-apply';
import { boundedHistory, COACH_ERROR_COPY, type ProposalDisplay } from '@/utils/coach';
import { resolveProposalDisplay } from '@/utils/coach-resolve';
import { dismissCoachTrigger, getActiveCoachTrigger } from '@/utils/coach-triggers-live';
import type { CoachTrigger } from '@/utils/coach-triggers';
import { toLocalDateKey } from '@/utils/progress';

// SprintLab Coach UI Phase C-2: real backend connection. This file owns all conversation state
// and is the ONLY place that calls /api/coach or utils/plan-change-apply — components/
// coach-overlay.tsx only renders whatever is in `messages` and calls sendMessage/applyProposal/
// dismissProposal. The Gemini API key and all Gemini-calling code stay server-side in
// app/api/coach+api.ts; this file only ever talks to that one SprintLab endpoint.

/** The current-screen context the Coach layer knows about when the athlete opens it. This is
 * intentionally shallow — a surface name plus an optional entity a detail screen supplied — not
 * the full athlete AI context, which buildCurrentAthleteAIContext() supplies per request. */
export type CoachOpenContext = {
  surface: string;
  entityId?: string;
  entityLabel?: string;
};

export type CoachTextMessage = { id: string; kind: 'athlete' | 'split'; text: string };
export type CoachProposalStatus = 'pending' | 'applying' | 'applied' | 'dismissed' | 'stale';
export type CoachProposalMessage = {
  id: string;
  kind: 'proposal';
  text: string;
  proposal: PlanChangeProposal;
  display: ProposalDisplay;
  status: CoachProposalStatus;
  statusNote?: string;
};
export type CoachErrorMessage = { id: string; kind: 'error'; text: string };
export type CoachMessage = CoachTextMessage | CoachProposalMessage | CoachErrorMessage;

type CoachContextValue = {
  isOpen: boolean;
  /** The context the overlay is currently showing — set when opened, preserved after close so a same-session reopen doesn't lose it. */
  openContext: CoachOpenContext | null;
  openCoach: (context: CoachOpenContext) => void;
  closeCoach: () => void;
  /** True when a local trigger (utils/coach-triggers.ts) is currently active and hasn't been
   * seen yet — drives the launcher's attention dot. Set automatically at app boot from local
   * signals (readiness, missed sessions, soreness trend, an approaching priority meet); never
   * set from a Gemini response. */
  hasAttention: boolean;
  setHasAttention: (value: boolean) => void;
  /** The trigger currently driving hasAttention, if any. Lets the overlay show a lightweight
   * "Split noticed this" banner and its suggested prompt chip (see utils/coach-triggers.ts). */
  activeTrigger: CoachTrigger | null;
  /** Lets a detail screen (e.g. a specific workout) register itself as the "current entity" while focused, so Coach knows what the athlete was looking at if opened from there. */
  registerCurrentEntity: (entity: { id: string; label: string } | null) => void;
  /** In-memory conversation for this app session. Not persisted — a fresh app launch starts empty; closing/reopening the overlay within the same session keeps it. */
  messages: CoachMessage[];
  /** True while a /api/coach request is in flight. The overlay uses this to show a thinking state and disable duplicate sends. */
  isSending: boolean;
  /** Adds the athlete's message, calls /api/coach exactly once, and appends the result (text, proposal card, or a friendly error). `promptOverride`, if given, is what's actually sent to Coach while `displayText` is what's shown in the conversation (used by the suggestion chips). */
  sendMessage: (displayText: string, promptOverride?: string) => Promise<void>;
  /** Re-validates and applies a pending proposal via the existing I-2 applyAIPlanChange path. Never calls Gemini. */
  applyProposal: (messageId: string) => Promise<void>;
  /** Declines a pending proposal. Never mutates the plan, never calls Gemini. */
  dismissProposal: (messageId: string) => void;
};

const CoachContext = createContext<CoachContextValue | null>(null);

export function CoachProvider({ children }: PropsWithChildren) {
  const [isOpen, setIsOpen] = useState(false);
  const [openContext, setOpenContext] = useState<CoachOpenContext | null>(null);
  const [hasAttention, setHasAttention] = useState(false);
  const [activeTrigger, setActiveTrigger] = useState<CoachTrigger | null>(null);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const currentEntityRef = useRef<{ id: string; label: string } | null>(null);
  const openContextRef = useRef<CoachOpenContext | null>(null);
  const messagesRef = useRef<CoachMessage[]>([]);
  const isSendingRef = useRef(false);
  const activeTriggerRef = useRef<CoachTrigger | null>(null);

  useEffect(() => { openContextRef.current = openContext; }, [openContext]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { activeTriggerRef.current = activeTrigger; }, [activeTrigger]);

  // Evaluated once at app boot, matching the rest of SprintLab's local decision-support checks
  // (readiness, streaks) — a fresh, explained signal each time the app opens rather than a
  // background poll. Never overwrites an already-open overlay's state.
  useEffect(() => {
    let active = true;
    void getActiveCoachTrigger().then(trigger => {
      if (!active || !trigger) return;
      setActiveTrigger(trigger);
      setHasAttention(true);
    });
    return () => { active = false; };
  }, []);

  const registerCurrentEntity = useCallback((entity: { id: string; label: string } | null) => {
    currentEntityRef.current = entity;
  }, []);

  const openCoach = useCallback((context: CoachOpenContext) => {
    const entity = currentEntityRef.current;
    setOpenContext({
      ...context,
      entityId: context.entityId ?? entity?.id,
      entityLabel: context.entityLabel ?? entity?.label,
    });
    setHasAttention(false);
    // Dismissing here (rather than clearing activeTrigger) lets the overlay still show this
    // trigger's banner/chip for the rest of the session, while ensuring this exact occurrence
    // never re-flags the dot on a future app boot. A later, different occurrence (a new id) of
    // the same trigger type stays eligible.
    const trigger = activeTriggerRef.current;
    if (trigger) void dismissCoachTrigger(trigger.id);
    setIsOpen(true);
  }, []);

  const closeCoach = useCallback(() => setIsOpen(false), []);

  const sendMessage = useCallback(async (displayText: string, promptOverride?: string) => {
    const trimmed = displayText.trim();
    if (!trimmed || isSendingRef.current) return; // guards duplicate sends from a fast double-tap or re-render
    isSendingRef.current = true;
    setIsSending(true);

    const athleteMessage: CoachTextMessage = { id: `athlete-${Date.now()}`, kind: 'athlete', text: trimmed };
    const historyBeforeThisTurn = messagesRef.current;
    setMessages(current => [...current, athleteMessage]);

    try {
      const athleteContext = await buildCurrentAthleteAIContext();
      if (!athleteContext) {
        setMessages(current => [...current, { id: `error-${Date.now()}`, kind: 'error', text: COACH_ERROR_COPY.noProfile }]);
        return;
      }

      const context = openContextRef.current;
      const trigger = activeTriggerRef.current;
      const response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: promptOverride ?? trimmed,
          context: athleteContext,
          today: toLocalDateKey(new Date()),
          surface: context?.surface,
          entityId: context?.entityId,
          entityLabel: context?.entityLabel,
          history: boundedHistory(historyBeforeThisTurn),
          // Only the single currently-active local trigger, kept small — never every detected
          // trigger — so Gemini understands why Split surfaced without a scoring dump.
          activeTrigger: trigger ? { type: trigger.type, date: trigger.date, message: trigger.message } : undefined,
        }),
      });

      if (response.status === 429) {
        setMessages(current => [...current, { id: `error-${Date.now()}`, kind: 'error', text: COACH_ERROR_COPY.rateLimited }]);
        return;
      }

      const body = await response.json().catch(() => null);
      if (!response.ok || !body || typeof body.message !== 'string') {
        setMessages(current => [...current, { id: `error-${Date.now()}`, kind: 'error', text: COACH_ERROR_COPY.generic }]);
        return;
      }

      const payload = body as CoachResponsePayload;
      if (payload.proposal) {
        const display = await resolveProposalDisplay(payload.proposal);
        const proposalMessage: CoachProposalMessage = {
          id: `split-${Date.now()}`,
          kind: 'proposal',
          text: payload.message,
          proposal: payload.proposal,
          display,
          status: 'pending',
        };
        setMessages(current => [...current, proposalMessage]);
      } else {
        setMessages(current => [...current, { id: `split-${Date.now()}`, kind: 'split', text: payload.message }]);
      }
    } catch {
      setMessages(current => [...current, { id: `error-${Date.now()}`, kind: 'error', text: COACH_ERROR_COPY.network }]);
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  }, []);

  const applyProposal = useCallback(async (messageId: string) => {
    const target = messagesRef.current.find(item => item.id === messageId);
    if (!target || target.kind !== 'proposal' || target.status !== 'pending') return;
    setMessages(current => current.map(item => item.id === messageId && item.kind === 'proposal' ? { ...item, status: 'applying' } : item));

    const result = await applyAIPlanChange(target.proposal);
    if (result.ok) {
      setMessages(current => [
        ...current.map(item => item.id === messageId && item.kind === 'proposal' ? { ...item, status: 'applied' as const } : item),
        { id: `split-${Date.now()}`, kind: 'split' as const, text: 'Done — your plan is updated.' },
      ]);
    } else {
      setMessages(current => current.map(item => item.id === messageId && item.kind === 'proposal'
        ? { ...item, status: 'stale' as const, statusNote: COACH_ERROR_COPY.staleProposal }
        : item));
    }
  }, []);

  const dismissProposal = useCallback((messageId: string) => {
    const target = messagesRef.current.find(item => item.id === messageId);
    if (!target || target.kind !== 'proposal' || target.status !== 'pending') return;
    setMessages(current => [
      ...current.map(item => item.id === messageId && item.kind === 'proposal' ? { ...item, status: 'dismissed' as const } : item),
      { id: `split-${Date.now()}`, kind: 'split' as const, text: 'Got it — kept your current plan.' },
    ]);
  }, []);

  const value = useMemo<CoachContextValue>(() => ({
    isOpen,
    openContext,
    openCoach,
    closeCoach,
    hasAttention,
    setHasAttention,
    activeTrigger,
    registerCurrentEntity,
    messages,
    isSending,
    sendMessage,
    applyProposal,
    dismissProposal,
  }), [isOpen, openContext, openCoach, closeCoach, hasAttention, activeTrigger, registerCurrentEntity, messages, isSending, sendMessage, applyProposal, dismissProposal]);

  return <CoachContext.Provider value={value}>{children}</CoachContext.Provider>;
}

export function useCoach() {
  const context = useContext(CoachContext);
  if (!context) throw new Error('useCoach must be used within a CoachProvider');
  return context;
}

/** Convenience hook for a detail screen to register/unregister itself as Coach's "current entity" while focused. Automatically clears on unmount so a screen that navigated away never leaves stale entity context behind for the next Coach open. */
export function useCoachEntity(entity: { id: string; label: string } | null) {
  const { registerCurrentEntity } = useCoach();
  const entityId = entity?.id;
  const entityLabel = entity?.label;
  useEffect(() => {
    registerCurrentEntity(entityId && entityLabel ? { id: entityId, label: entityLabel } : null);
    return () => registerCurrentEntity(null);
  }, [entityId, entityLabel, registerCurrentEntity]);
}
