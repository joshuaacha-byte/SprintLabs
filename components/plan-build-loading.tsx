import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line as SvgLine, Text as SvgText } from 'react-native-svg';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PrimaryOnboardingButton } from '@/components/onboarding';
import { Palette, useTheme } from '@/constants/sprintlab';
import type { AthleteProfile } from '@/types';
import { blockedWeekdayReasons, buildDeterministicWeeklyPlan } from '@/utils/plan-selector';
import { getLibraryWorkouts } from '@/utils/workout-library';
import { weekdayLabels } from '@/data/workouts';

// SprintLab plan-build step (onboarding step 16). Full implementation of the approved Figma
// Make loading-screen prototype, rebuilt native-safe from scratch on top of the working
// View/Text/Pressable placeholder that was confirmed stable on a physical device.
//
// Why this file looks the way it does: the previous (crashing) version animated
// react-native-svg shape props — cx/cy/strokeDashoffset/rotation — directly through
// Reanimated's useAnimatedProps/animatedProps. That mechanism pushes prop updates straight to
// the native Fabric shadow node on the UI thread, bypassing react-native-svg's normal
// React-render prop pipeline (extractProps.ts -> extractTransform.ts), which is what actually
// converts shorthand props like `rotation`/`originX`/`originY` into the real native prop the
// view expects. That combination is not proven safe under the New Architecture on this app.
//
// This version never animates an SVG prop directly. Every SVG element below is a plain,
// non-Animated element whose props are recomputed from ordinary React state on each render —
// the exact same technique the approved Figma prototype itself uses (a requestAnimationFrame
// loop driving plain useState), just throttled for React Native render cost. All genuine
// motion — the two rotating decorative rings, checklist activation, glow/status pulses, the
// engine-line shimmer — is done with React Native's core `Animated` API (not Reanimated) on
// plain View/Text elements only (opacity/transform), the same primitive already proven stable
// on this exact device elsewhere in this onboarding flow (see CommitmentHoldButton in
// components/onboarding.tsx).

const LIME = '#C9FF18';
const ANIMATION_DURATION_MS = 9800;
const CTA_DELAY_MS = 900;
const FRAME_THROTTLE_MS = 40; // ~25fps cap on state-driven SVG re-renders

const PHASES = [
  { min: 0, max: 15, label: 'READING YOUR PROFILE' },
  { min: 15, max: 35, label: 'MAPPING YOUR SPEED' },
  { min: 35, max: 60, label: 'STRUCTURING YOUR WEEK' },
  { min: 60, max: 85, label: 'BALANCING TRAINING LOAD' },
  { min: 85, max: 101, label: 'FINALIZING YOUR PLAN' },
] as const;

const CHECKLIST_THRESHOLDS = [13, 26, 42, 57, 72, 87] as const;

// --- geometry (mirrors the approved reference's 280x280 layout) -----------------------
const SVG_S = 280;
const CX = 140;
const CY = 140;
const R_OUT = 112;
const R_MID = 95;
const R_IN = 78;
const CIRC_OUT = 2 * Math.PI * R_OUT;
const ARC_DEG = 300;
const ARC_LEN = (ARC_DEG / 360) * CIRC_OUT;
const ARC_START_DEG = 210; // 7 o'clock, sweeping clockwise 300° to 5 o'clock (polar() convention, 0deg = 12 o'clock)
// RotatedLayer applies a plain CSS-style `transform: rotate()`, which spins the circle's SVG-native
// dash start point (3 o'clock) rather than polar()'s 12-o'clock-based angle — the two conventions are
// offset by 90deg. This converts ARC_START_DEG into the correct rotation so the ring's open gap lands
// centered at the bottom of the circle, matching where polar()-based elements (the progress dot) sit.
const ARC_ROTATE_DEG = ARC_START_DEG - 90;
const ORBIT_DEG_PER_SEC = 22;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

const TICKS = Array.from({ length: 30 }, (_, index) => {
  const deg = index * 12;
  if (deg >= 150 && deg <= 210) return null;
  const big = index % 5 === 0;
  const inner = polar(CX, CY, R_OUT + 5, deg);
  const outer = polar(CX, CY, R_OUT + 5 + (big ? 6 : 3), deg);
  return { key: deg, inner, outer, big };
}).filter((tick): tick is NonNullable<typeof tick> => Boolean(tick));

const DISTANCE_LABELS = [{ deg: 0, label: '100' }, { deg: 90, label: '200' }, { deg: 270, label: '400' }];

function planBuildPathwayLabel(profile: AthleteProfile) {
  const sport = profile.primarySport ?? profile.sport;
  if (sport === 'football') return '40-yard pathway';
  if (sport && sport !== 'track-and-field') return 'General speed pathway';
  if (profile.primaryEvent === '200m' || profile.primaryEvent === '400m') return '200m + 400m pathway';
  return '60m + 100m pathway';
}

/** Six real facts pulled from the athlete's own answers — never generic placeholder text. */
function planBuildChecklist(profile: AthleteProfile): string[] {
  const sport = profile.primarySport ?? profile.sport;
  const events = sport === 'track-and-field' || !sport
    ? [profile.primaryEvent, ...(profile.secondaryEvents ?? [])].filter(Boolean).join(' · ')
    : '';

  const hasBaseline = profile.personalBests.length > 0 || Boolean(profile.primaryPerformanceTest);
  const goalCount = (profile.speedGoals ?? []).length;

  const blocked = blockedWeekdayReasons(profile);
  const rank = (reason: string) => {
    const lower = reason.toLowerCase();
    if (lower.includes('competition') || lower.includes('game')) return 0;
    if (lower.includes('practice')) return 1;
    if (lower.includes('another sport')) return 2;
    return 4;
  };
  let protectedLabel: string | null = null;
  let bestRank = Infinity;
  blocked.forEach((reasons, dayIndex) => {
    reasons.forEach(reason => {
      const value = rank(reason);
      if (value < bestRank) {
        bestRank = value;
        const kind = value === 0 ? 'competition' : value === 1 ? 'practice' : 'training';
        protectedLabel = `${weekdayLabels[dayIndex].full} ${kind} protected`;
      }
    });
  });

  return [
    events || planBuildPathwayLabel(profile),
    hasBaseline ? 'Current performance mapped' : 'Starting point set',
    profile.trainingDaysPerWeek ? `${profile.trainingDaysPerWeek} training day${profile.trainingDaysPerWeek === 1 ? '' : 's'} available` : 'Training availability set',
    goalCount ? 'Priorities saved' : 'Primary goal set',
    protectedLabel ?? 'Speed priorities identified',
    'Weekly load balanced',
  ];
}

/** A plain, non-Animated View wrapper that rotates its (Svg) children by a fixed or continuously spinning amount using only `transform: rotate`, never react-native-svg's own rotation/origin props. */
function RotatedLayer({ deg, spin, children }: { deg?: number; spin?: { duration: number; reverse?: boolean }; children: React.ReactNode }) {
  const spinValue = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!spin) return;
    const loop = Animated.loop(Animated.timing(spinValue, { toValue: 1, duration: spin.duration, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin, spinValue]);

  if (!spin) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${deg ?? 0}deg` }] }]}>{children}</View>;
  }
  const rotate = spinValue.interpolate({ inputRange: [0, 1], outputRange: spin.reverse ? ['0deg', '-360deg'] : ['0deg', '360deg'] });
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>{children}</Animated.View>;
}

function DecorativeRing({ radius, dash, opacity, spin }: { radius: number; dash: string; opacity: number; spin: { duration: number; reverse?: boolean } }) {
  return <RotatedLayer spin={spin}>
    <Svg width="100%" height="100%" viewBox={`0 0 ${SVG_S} ${SVG_S}`}>
      <Circle cx={CX} cy={CY} r={radius} fill="none" stroke={`rgba(201,255,24,${opacity})`} strokeWidth={0.8} strokeDasharray={dash} />
    </Svg>
  </RotatedLayer>;
}

function ChecklistItem({ label, active, isLast }: { label: string; active: boolean; isLast: boolean }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const activation = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(activation, { toValue: active ? 1 : 0, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [active, activation]);

  const rowOpacity = activation.interpolate({ inputRange: [0, 1], outputRange: [0.18, 1] });
  const boxBorderColor = activation.interpolate({ inputRange: [0, 1], outputRange: ['rgba(201,255,24,0.2)', 'rgba(201,255,24,0.7)'] });
  const boxBackground = activation.interpolate({ inputRange: [0, 1], outputRange: ['rgba(201,255,24,0)', 'rgba(201,255,24,0.1)'] });
  const checkScale = activation.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  return <Animated.View style={[styles.checklistRow, !isLast && styles.checklistRowDivider, { opacity: rowOpacity }]}>
    <Animated.View style={[styles.checklistBox, { borderColor: boxBorderColor, backgroundColor: boxBackground }]}>
      <Animated.View style={{ opacity: activation, transform: [{ scale: checkScale }] }}>
        <MaterialIcons name="check" size={11} color={LIME} />
      </Animated.View>
    </Animated.View>
    <Text style={[styles.checklistLabel, active && styles.checklistLabelActive]}>{label}</Text>
    <Animated.View style={[styles.checklistDot, { opacity: activation }]} />
  </Animated.View>;
}

function EngineShimmer() {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [trackWidth, setTrackWidth] = useState(0);
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(shimmer, { toValue: 1, duration: 2200, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [shimmer]);
  const onLayout = (event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width);
  const shimmerWidth = Math.max(trackWidth * 0.2, 1);
  const translateX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-shimmerWidth, trackWidth] });
  return <View onLayout={onLayout} style={StyleSheet.absoluteFill}>
    {trackWidth > 0 && <Animated.View style={[styles.engineShimmerBar, { width: shimmerWidth, transform: [{ translateX }] }]} />}
  </View>;
}

export function PlanBuildStep({ profile, onReady }: { profile: AthleteProfile; onReady: () => void }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const checklist = useMemo(() => planBuildChecklist(profile), [profile]);

  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<'pending' | 'ready' | 'failed'>('pending');
  const [phase, setPhase] = useState<'building' | 'complete' | 'error'>('building');
  const [prog, setProg] = useState(0); // 0..1, eased
  const [orbitDeg, setOrbitDeg] = useState(30);
  const [animDone, setAnimDone] = useState(false);
  const [cta, setCta] = useState(false);
  const [continuing, setContinuing] = useState(false);

  const glowPulse = useRef(new Animated.Value(0)).current;
  const livePulse = useRef(new Animated.Value(0)).current;
  const ctaOpacity = useRef(new Animated.Value(0)).current;

  // The real generation gate. Runs the same planner call the review screen will re-run —
  // this is only used to know when a real result exists, never persisted from here.
  useEffect(() => {
    let cancelled = false;
    setOutcome('pending');
    getLibraryWorkouts()
      .then(library => {
        if (cancelled) return;
        buildDeterministicWeeklyPlan(profile, library);
        setOutcome('ready');
      })
      .catch(() => { if (!cancelled) setOutcome('failed'); });
    return () => { cancelled = true; };
  }, [attempt, profile]);

  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // The visual sequence: a plain requestAnimationFrame loop driving ordinary React state,
  // throttled to ~25fps. Deliberately keyed only on `attempt` (mount + explicit retries), not
  // `phase` — the loop keeps running seamlessly straight through the 'building' -> 'complete'
  // transition so the orbit dots keep circling indefinitely while the athlete reviews the READY
  // state, instead of restarting or freezing. It only stops on 'error' (checked live via a ref
  // so this doesn't need to be an effect dependency) or when the component unmounts.
  useEffect(() => {
    let start: number | null = null;
    let lastUpdate = 0;
    let raf = 0;
    const frame = (ts: number) => {
      if (phaseRef.current === 'error') return;
      if (start == null) start = ts;
      const elapsed = ts - start;
      const t = Math.min(elapsed / ANIMATION_DURATION_MS, 1);
      if (ts - lastUpdate >= FRAME_THROTTLE_MS || t >= 1) {
        lastUpdate = ts;
        setProg(easeInOutCubic(t));
        setOrbitDeg((30 + (elapsed / 1000) * ORBIT_DEG_PER_SEC) % 360);
        if (t >= 1) setAnimDone(true);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [attempt]);

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glowPulse, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(glowPulse, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [glowPulse]);

  useEffect(() => {
    if (phase === 'complete') {
      livePulse.stopAnimation();
      return;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(livePulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(livePulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [phase, livePulse]);

  // The graceful hold: if the visual sequence finishes before the real plan does, this effect
  // simply won't fire yet — the ring stays parked at ~99% (see shownPercent below) with its
  // idle orbit motion continuing until `outcome` flips. If the real plan finishes first, this
  // fires the moment the animation itself completes, so the visual sequence always plays out.
  useEffect(() => {
    if (phase !== 'building') return;
    if (outcome === 'failed') {
      setPhase('error');
      return;
    }
    if (animDone && outcome === 'ready') setPhase('complete');
  }, [animDone, outcome, phase]);

  useEffect(() => {
    if (phase !== 'complete') return;
    const timer = setTimeout(() => {
      setCta(true);
      Animated.timing(ctaOpacity, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }, CTA_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase, ctaOpacity]);

  const retry = () => {
    setCta(false);
    setContinuing(false);
    ctaOpacity.setValue(0);
    setAnimDone(false);
    setProg(0);
    setPhase('building');
    setAttempt(current => current + 1);
  };

  const continueToWeek = () => {
    if (continuing) return; // guards against a fast double-tap firing onReady twice and skipping a step
    setContinuing(true);
    onReady();
  };

  // Never report 100/READY until the real plan actually exists — cap the displayed number
  // just short of complete if the visual timer somehow outruns real generation.
  const displayPercent = Math.min(100, Math.round(prog * 100));
  const shownPercent = phase === 'complete' ? 100 : Math.min(displayPercent, 99);
  const currentPhase = PHASES.find(p => shownPercent >= p.min && shownPercent < p.max) ?? PHASES[PHASES.length - 1];

  const progArcLen = Math.max((phase === 'complete' ? 1 : prog) * ARC_LEN, 0.01);
  const dotPos = polar(CX, CY, R_OUT, ARC_START_DEG + (phase === 'complete' ? 1 : prog) * ARC_DEG);
  const orbit1 = polar(CX, CY, R_MID, orbitDeg);
  const orbit2 = polar(CX, CY, R_MID, orbitDeg + 180);

  const ambientGlowOpacity = glowPulse.interpolate({ inputRange: [0, 1], outputRange: phase === 'complete' ? [0.14, 0.18] : [0.045, 0.065] });
  const liveDotOpacity = livePulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });

  return <View style={styles.screen}>
    <Text style={styles.wordmark}>SPRINTLAB</Text>

    {phase === 'error' ? (
      <View style={styles.errorWrap}>
        <View style={styles.errorRing}>
          <MaterialIcons name="refresh" size={30} color={palette.muted} />
        </View>
        <Text style={styles.errorEyebrow}>PLAN BUILD INTERRUPTED</Text>
        <Text style={styles.errorCopy}>Your answers are saved. Try building your week again.</Text>
        <View style={styles.errorButton}><PrimaryOnboardingButton title="Try again" onPress={retry} /></View>
      </View>
    ) : <>
      <View style={styles.vizWrap}>
        <Animated.View pointerEvents="none" style={[styles.ambientGlow, { opacity: ambientGlowOpacity }]} />
        <DecorativeRing radius={R_OUT + 22} dash="3.5 11" opacity={0.035} spin={{ duration: 28000 }} />
        <DecorativeRing radius={R_IN - 12} dash="2 8" opacity={0.04} spin={{ duration: 20000, reverse: true }} />

        <Svg width="100%" height="100%" viewBox={`0 0 ${SVG_S} ${SVG_S}`}>
          <Circle cx={CX} cy={CY} r={4.5} fill="none" stroke="rgba(201,255,24,0.14)" strokeWidth={0.7} />
          <SvgLine x1={CX - 14} y1={CY} x2={CX - 5.5} y2={CY} stroke="rgba(201,255,24,0.08)" strokeWidth={0.7} />
          <SvgLine x1={CX + 5.5} y1={CY} x2={CX + 14} y2={CY} stroke="rgba(201,255,24,0.08)" strokeWidth={0.7} />
          <SvgLine x1={CX} y1={CY - 14} x2={CX} y2={CY - 5.5} stroke="rgba(201,255,24,0.08)" strokeWidth={0.7} />
          <SvgLine x1={CX} y1={CY + 5.5} x2={CX} y2={CY + 14} stroke="rgba(201,255,24,0.08)" strokeWidth={0.7} />

          {TICKS.map(tick => <SvgLine key={tick.key} x1={tick.inner.x} y1={tick.inner.y} x2={tick.outer.x} y2={tick.outer.y} stroke={tick.big ? 'rgba(201,255,24,0.26)' : 'rgba(201,255,24,0.09)'} strokeWidth={tick.big ? 1.2 : 0.75} />)}

          {DISTANCE_LABELS.map(({ deg, label }) => {
            const p = polar(CX, CY, R_OUT + 26, deg);
            return <SvgText key={deg} x={p.x} y={p.y} textAnchor="middle" fontSize={5.5} fontWeight="600" letterSpacing={0.5} fill="rgba(201,255,24,0.18)">{label}</SvgText>;
          })}

          {[-20, 0, 20].map((yOff, index) => <View key={yOff}>
            <SvgLine x1={CX - R_OUT - 6} y1={CY + yOff} x2={CX - R_OUT - 12} y2={CY + yOff} stroke={`rgba(201,255,24,${index === 1 ? 0.18 : 0.07})`} strokeWidth={index === 1 ? 0.9 : 0.6} />
            <SvgLine x1={CX + R_OUT + 6} y1={CY + yOff} x2={CX + R_OUT + 12} y2={CY + yOff} stroke={`rgba(201,255,24,${index === 1 ? 0.18 : 0.07})`} strokeWidth={index === 1 ? 0.9 : 0.6} />
          </View>)}

          <Circle cx={orbit1.x} cy={orbit1.y} r={2.5} fill={LIME} />
          <Circle cx={orbit2.x} cy={orbit2.y} r={1.8} fill="rgba(201,255,24,0.45)" />
          {phase !== 'complete' && <Circle cx={dotPos.x} cy={dotPos.y} r={3.5} fill={LIME} />}
        </Svg>

        <RotatedLayer deg={ARC_ROTATE_DEG + 8}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${SVG_S} ${SVG_S}`}>
            <Circle cx={CX} cy={CY} r={R_IN} fill="none" stroke="rgba(201,255,24,0.06)" strokeWidth={0.8} strokeDasharray={`${(ARC_DEG / 360) * 2 * Math.PI * R_IN} ${2 * Math.PI * R_IN}`} />
          </Svg>
        </RotatedLayer>
        <RotatedLayer deg={ARC_ROTATE_DEG + 4}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${SVG_S} ${SVG_S}`}>
            <Circle cx={CX} cy={CY} r={R_MID} fill="none" stroke="rgba(201,255,24,0.055)" strokeWidth={0.8} strokeDasharray={`${(ARC_DEG / 360) * 2 * Math.PI * R_MID} ${2 * Math.PI * R_MID}`} />
          </Svg>
        </RotatedLayer>
        <RotatedLayer deg={ARC_ROTATE_DEG}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${SVG_S} ${SVG_S}`}>
            <Circle cx={CX} cy={CY} r={R_OUT} fill="none" stroke="rgba(201,255,24,0.08)" strokeWidth={1.5} strokeDasharray={`${ARC_LEN} ${CIRC_OUT}`} />
            <Circle cx={CX} cy={CY} r={R_OUT} fill="none" stroke={LIME} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={`${progArcLen} ${CIRC_OUT}`} opacity={phase === 'complete' ? 1 : 0.92} />
          </Svg>
        </RotatedLayer>

        <View pointerEvents="none" style={styles.vizCenter}>
          {phase !== 'complete' ? <>
            <Text style={styles.phaseLabel}>{currentPhase.label}</Text>
            <Text style={styles.percent}>{shownPercent}</Text>
            <Text style={styles.buildingLabel}>BUILDING YOUR WEEK</Text>
          </> : <>
            <Text style={styles.readyEyebrow}>YOUR WEEK IS</Text>
            <Text style={styles.readyWord}>READY</Text>
          </>}
        </View>
      </View>

      <View style={styles.thinLineTrack}>
        <View style={[styles.thinLineFill, { width: `${Math.max(1, (phase === 'complete' ? 1 : prog) * 100)}%` }]} />
      </View>

      <View style={styles.checklistWrap}>
        <Text style={styles.checklistEyebrow}>PERSONALIZING FOR YOU</Text>
        <View>
          {checklist.map((label, index) => (
            <ChecklistItem key={label} label={label} active={shownPercent >= CHECKLIST_THRESHOLDS[index]} isLast={index === checklist.length - 1} />
          ))}
        </View>
      </View>

      <View style={styles.engineWrap}>
        <View style={{ flex: 1 }}>
          <Text style={styles.engineLabel}>SPRINTLAB ENGINE</Text>
          <View style={styles.engineTrack}>
            <View style={[styles.engineFill, { width: `${Math.max(1, (phase === 'complete' ? 1 : prog) * 100)}%` }]} />
            {phase !== 'complete' && <EngineShimmer />}
          </View>
        </View>
        <View style={styles.engineBadge}>
          <Animated.View style={[styles.engineDot, { opacity: phase === 'complete' ? 1 : liveDotOpacity }]} />
          <Text style={styles.engineStatus}>{phase === 'complete' ? 'COMPLETE' : 'LIVE'}</Text>
        </View>
      </View>

      {cta ? <Animated.View style={[styles.ctaWrap, { opacity: ctaOpacity }]}><PrimaryOnboardingButton title="Continue to my week" onPress={continueToWeek} disabled={continuing} /></Animated.View> : null}
    </>}
  </View>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', paddingTop: 34, paddingBottom: 22, gap: 13 },
  ambientGlow: { position: 'absolute', top: -28, left: -28, right: -28, bottom: -28, borderRadius: 9999, backgroundColor: LIME },
  wordmark: { color: 'rgba(255,255,255,0.14)', fontSize: 9, fontWeight: '900', letterSpacing: 2.6, marginBottom: 4 },
  vizWrap: { width: '68%', maxWidth: 252, minWidth: 188, aspectRatio: 1, marginTop: 14 },
  vizCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  phaseLabel: { color: 'rgba(255,255,255,0.24)', fontSize: 9, fontWeight: '800', letterSpacing: 1.3, marginBottom: 5, textAlign: 'center' },
  percent: { color: palette.text, fontSize: 56, fontWeight: '900', letterSpacing: -1.4, lineHeight: 58 },
  buildingLabel: { color: 'rgba(255,255,255,0.16)', fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginTop: 5 },
  readyEyebrow: { color: LIME, fontSize: 11, fontWeight: '800', letterSpacing: 1.8, marginBottom: 7 },
  readyWord: { color: palette.text, fontSize: 42, fontWeight: '900', letterSpacing: 0.5, lineHeight: 44 },
  thinLineTrack: { width: 150, height: 2, borderRadius: 1, backgroundColor: 'rgba(201,255,24,0.08)', overflow: 'hidden' },
  thinLineFill: { height: '100%', borderRadius: 1, backgroundColor: LIME },
  checklistWrap: { width: '100%', paddingHorizontal: 28, gap: 9 },
  checklistEyebrow: { color: 'rgba(255,255,255,0.12)', fontSize: 9, fontWeight: '800', letterSpacing: 1.7, textAlign: 'center' },
  checklistRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6 },
  checklistRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.05)' },
  checklistBox: { width: 16, height: 16, borderRadius: 5, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  checklistLabel: { flex: 1, color: 'rgba(255,255,255,0.42)', fontSize: 12, fontWeight: '500' },
  checklistLabelActive: { color: palette.text, fontWeight: '700' },
  checklistDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: LIME },
  engineWrap: { width: '100%', paddingHorizontal: 24, paddingTop: 11, flexDirection: 'row', alignItems: 'center', gap: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.05)' },
  engineLabel: { color: 'rgba(255,255,255,0.16)', fontSize: 9, fontWeight: '800', letterSpacing: 1.8, marginBottom: 6 },
  engineTrack: { height: 2, borderRadius: 1, backgroundColor: 'rgba(201,255,24,0.07)', overflow: 'hidden' },
  engineFill: { height: '100%', borderRadius: 1, backgroundColor: LIME },
  engineShimmerBar: { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(201,255,24,0.35)' },
  engineBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  engineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: LIME },
  engineStatus: { color: LIME, fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  ctaWrap: { width: '100%', paddingHorizontal: 24, paddingTop: 4 },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32 },
  errorRing: { width: 68, height: 68, borderRadius: 34, borderWidth: 1.5, borderColor: 'rgba(143,161,178,0.3)', alignItems: 'center', justifyContent: 'center' },
  errorEyebrow: { color: palette.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  errorCopy: { color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  errorButton: { width: '100%', paddingTop: 6 },
});
