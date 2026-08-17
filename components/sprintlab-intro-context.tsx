import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import type { View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { SPRINTLAB_INTRO_STEPS } from '@/utils/sprintlab-intro-steps';
import type { SprintLabIntroStep } from '@/types/sprintlab-intro';
import { markSprintLabIntroSeen } from '@/utils/sprintlab-intro';

// SprintLab first-time product tour: this file owns all tour state (which step is active) and
// drives the ONLY navigation the tour ever performs (to the real Progress tab, and back to Today
// when that step ends). components/sprintlab-intro-overlay.tsx only renders whatever is here and
// never navigates itself; Today, Progress, and the Coach launcher only register where their real
// elements are via useIntroTarget below — the tour always spotlights the actual live screen
// rather than a recreated copy of it.

type SprintLabIntroContextValue = {
  isActive: boolean;
  step: SprintLabIntroStep | null;
  stepIndex: number;
  stepCount: number;
  /** Starts the tour from its first step. */
  start: () => void;
  next: () => void;
  /** Ends the tour immediately from any step and marks it seen — Skip is available throughout. */
  skip: () => void;
  registerTarget: (id: string, node: View | null) => void;
  getTarget: (id: string) => View | null;
};

const SprintLabIntroContext = createContext<SprintLabIntroContextValue | null>(null);

export function SprintLabIntroProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const pathname = usePathname();
  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const targetsRef = useRef(new Map<string, View | null>());
  // Tracks whether the tour itself navigated to Progress, so it (and only it) navigates back —
  // never fighting an athlete who manually switches tabs mid-tour for some other reason.
  const navigatedToProgressRef = useRef(false);

  const registerTarget = useCallback((id: string, node: View | null) => {
    targetsRef.current.set(id, node);
  }, []);
  const getTarget = useCallback((id: string) => targetsRef.current.get(id) ?? null, []);

  const step = isActive ? SPRINTLAB_INTRO_STEPS[stepIndex] : null;

  // The tour's only navigation: real Progress-tab visit for the "progress" moment, real return to
  // Today once that moment ends (Next → final, or Skip while still on Progress). Never touches
  // navigation for any other step — those all stay on whatever screen the athlete is already on.
  useEffect(() => {
    if (isActive && step?.id === 'progress') {
      navigatedToProgressRef.current = true;
      if (pathname !== '/progress') router.push('/progress');
      return;
    }
    if (navigatedToProgressRef.current) {
      navigatedToProgressRef.current = false;
      if (pathname !== '/') router.replace('/');
    }
  }, [isActive, step, pathname, router]);

  const start = useCallback(() => {
    setStepIndex(0);
    setIsActive(true);
  }, []);

  const skip = useCallback(() => {
    setIsActive(false);
    void markSprintLabIntroSeen();
  }, []);

  const next = useCallback(() => {
    setStepIndex(current => {
      const nextIndex = current + 1;
      if (nextIndex < SPRINTLAB_INTRO_STEPS.length) return nextIndex;
      return current;
    });
  }, []);

  // Advancing past the final step ends the tour the same way Skip does — same "mark seen" path.
  const advance = useCallback(() => {
    if (stepIndex >= SPRINTLAB_INTRO_STEPS.length - 1) {
      skip();
      return;
    }
    next();
  }, [next, skip, stepIndex]);

  const value = useMemo<SprintLabIntroContextValue>(() => ({
    isActive,
    step,
    stepIndex,
    stepCount: SPRINTLAB_INTRO_STEPS.length,
    start,
    next: advance,
    skip,
    registerTarget,
    getTarget,
  }), [isActive, step, stepIndex, start, advance, skip, registerTarget, getTarget]);

  return <SprintLabIntroContext.Provider value={value}>{children}</SprintLabIntroContext.Provider>;
}

export function useSprintLabIntro() {
  const context = useContext(SprintLabIntroContext);
  if (!context) throw new Error('useSprintLabIntro must be used within SprintLabIntroProvider');
  return context;
}

/** Lets a screen register the real View it wants spotlightable by id — attach the returned ref
 * directly to that element (e.g. `<View ref={useIntroTarget('today-hero-card')}>`). Mirrors
 * components/coach-context.tsx's useCoachEntity registration pattern. */
export function useIntroTarget(id: string) {
  const { registerTarget } = useSprintLabIntro();
  return useCallback((node: View | null) => registerTarget(id, node), [registerTarget, id]);
}
