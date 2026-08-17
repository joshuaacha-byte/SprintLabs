import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { CoachMomentCard } from '@/components/coach-moment-card';
import { Palette, useTheme } from '@/constants/sprintlab';
import type { CoachMoment } from '@/types/coach-moment';
import type { WeekDayProgress } from '@/utils/progress';
import { hapticSuccess, tap } from '@/utils/haptics';
import type { CelebrationKind } from '@/utils/streaks';

// Faithful recreation of the Figma "workout complete" sequence (see
// /Users/joshuaacha/Downloads/Redesign Workout Completion Screen). This component only RENDERS
// Streak System V2 state — every number here (planStreak, longestPlanStreak, trainingCount,
// week) is computed once by utils/streaks.ts's getWorkoutCompletionCelebrationState and handed
// down as `payload`; nothing is recalculated or invented here.

export type CelebrationPayload = {
  kind: CelebrationKind;
  planStreak?: { previous: number; current: number; isMilestone: boolean };
  longestPlanStreak?: number;
  consistencyStreak?: { previous: number; current: number; isMilestone: boolean };
  trainingCount?: { previous: number; current: number; isMilestone: boolean };
  week?: { completed: number; due: number; days: WeekDayProgress[] };
  coverage?: { completed: number; planned: number };
  /** First name only, when known — used for a single "Nice work, Joshua" recognition touch on
   * the headline. Never required; every headline has a clean unnamed fallback. */
  athleteFirstName?: string | null;
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const RING_R = 36;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;
const CHECK_LEN = 52;
const CHECK_D = 'M33 49.5L43.5 60L63 37';
const DAY_CHECK_D = 'M3 7.2L5.8 10L11 4';
const DAY_CHECK_LEN = 14;

// Figma's exact low-alpha slate tones — the app's dark theme is forced on, so these hardcoded
// rgba values (matching palette.muted's RGB, ~148,163,184) stay correct without a color-blend
// helper; the closest opaque design tokens (palette.border/surface) read far more visible than
// this screen's intentionally subtle card chrome.
const SLATE_BORDER = 'rgba(148,163,184,0.1)';
const SLATE_DIVIDER = 'rgba(148,163,184,0.07)';
const SLATE_MUTED_60 = 'rgba(148,163,184,0.6)';
const SLATE_MUTED_50 = 'rgba(148,163,184,0.5)';
const SLATE_MUTED_45 = 'rgba(148,163,184,0.45)';
const LIME_GLOW_BORDER = 'rgba(201,255,24,0.13)';
const LIME_GLOW_BG = 'rgba(201,255,24,0.05)';

function headline(payload: CelebrationPayload): { title: string; body: string } {
  const name = payload.athleteFirstName;
  const doneTitle = name ? `Nice work, ${name}` : 'Workout complete';
  if (payload.kind === 'ended-early') {
    const coverage = payload.coverage;
    return {
      title: 'Workout saved',
      body: coverage && coverage.planned > 0
        ? `Ended early — ${coverage.completed} of ${coverage.planned} planned exercises completed.`
        : 'Ended early — what you completed is saved.',
    };
  }
  if (payload.kind === 'one-off') return { title: doneTitle, body: 'This one-off session was added to your Logbook.' };
  if (payload.kind === 'maintained') return { title: doneTitle, body: 'Saved — this session doesn’t change your current Plan Streak.' };
  return { title: doneTitle, body: 'Session saved to your logbook' };
}

function motivationalLine(payload: CelebrationPayload): string | null {
  if (payload.kind === 'ended-early') return 'Recorded exactly as it happened. It won’t extend your Plan Streak, but nothing you completed is lost.';
  if (payload.kind === 'one-off') return 'Logged as an extra session — it doesn’t change your Plan Streak.';
  if (payload.kind === 'maintained') return 'Recorded. Your Plan Streak reflects your most recent scheduled sessions.';
  const current = payload.planStreak?.current;
  if (current === undefined) return null;
  return `Complete your next planned session to extend your streak to ${current + 1}.`;
}

function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then(value => { if (active) setReduceMotion(value); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', value => setReduceMotion(Boolean(value)));
    return () => { active = false; subscription?.remove?.(); };
  }, []);
  return reduceMotion;
}

const todayDateKey = () => new Date().toLocaleDateString('en-CA');

export function WorkoutCompletionCelebration({ payload, onViewSummary, onBackToToday, moment }: {
  payload: CelebrationPayload;
  onViewSummary: () => void;
  onBackToToday?: () => void;
  /** The single most-relevant Coach Moment for this save, if any — see utils/coach-moments.ts.
   * Purely additive: this screen's own streak/week choreography is entirely unchanged whether or
   * not a moment is present. */
  moment?: CoachMoment | null;
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const reduceMotion = useReduceMotion();
  const [actionsReady, setActionsReady] = useState(reduceMotion);
  const [skipped, setSkipped] = useState(reduceMotion);

  // A real streak increase is the only case that plays the "roll" — never fabricated.
  const streakIncreased = Boolean(payload.planStreak && payload.planStreak.current > payload.planStreak.previous);
  const currentStreak = payload.planStreak?.current ?? 0;
  const previousStreak = payload.planStreak?.previous ?? currentStreak;
  const isMilestone = Boolean(payload.planStreak?.isMilestone || payload.consistencyStreak?.isMilestone || payload.trainingCount?.isMilestone);
  const todayEntry = payload.week?.days.find(day => day.date === todayDateKey());
  // Only animate today's marker into "completed" when a real required session was just fulfilled
  // — an extra/unplanned session (kind === 'one-off') never fakes today's marker completing.
  const todayAnimates = payload.kind !== 'one-off' && todayEntry?.status === 'completed';
  // Whatever today's marker should look like at rest, whether or not it's the thing animating —
  // e.g. an 'extra' session still renders filled, just without the draw-in sequence.
  const todayRestingFilled = todayAnimates || todayEntry?.status === 'completed' || todayEntry?.status === 'extra';

  const ring = useRef(new Animated.Value(0)).current;
  const check = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(reduceMotion ? 1 : 0.9)).current;
  const headlineAnim = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const cardAnim = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const streakOld = useRef(new Animated.Value(1)).current; // opacity of the outgoing number
  const streakNew = useRef(new Animated.Value(reduceMotion || !streakIncreased ? 1 : 0)).current; // opacity/position of the incoming number
  const streakPop = useRef(new Animated.Value(1)).current;
  const todayFill = useRef(new Animated.Value(reduceMotion || (!todayAnimates && todayRestingFilled) ? 1 : 0)).current;
  const todayCheck = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const weekPulse = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const buttonsAnim = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  const jumpToEnd = () => {
    [ring, check, pulse, headlineAnim, cardAnim, streakNew, todayFill, todayCheck, weekPulse, buttonsAnim, streakPop].forEach(value => value.stopAnimation());
    ring.setValue(1); check.setValue(1); pulse.setValue(0); iconScale.setValue(1);
    headlineAnim.setValue(1); cardAnim.setValue(1);
    streakOld.setValue(0); streakNew.setValue(1); streakPop.setValue(1);
    todayFill.setValue(todayAnimates || todayRestingFilled ? 1 : 0); todayCheck.setValue(1);
    weekPulse.setValue(1); buttonsAnim.setValue(1);
    setActionsReady(true);
    setSkipped(true);
  };

  useEffect(() => {
    const announcement = [
      'Workout saved.',
      payload.planStreak ? `Plan Streak: ${payload.planStreak.current} scheduled sessions completed in a row.` : null,
      payload.week ? `${payload.week.completed} of ${payload.week.due} planned sessions completed this week.` : null,
    ].filter(Boolean).join(' ');
    AccessibilityInfo.announceForAccessibility?.(announcement);

    if (reduceMotion) {
      hapticSuccess();
      setActionsReady(true);
      return;
    }

    hapticSuccess();
    // Flat, independently-timed chains (each just delay→timing/sequence) combined with a single
    // top-level Animated.parallel, matching the Figma phase timeline via cumulative delays rather
    // than nesting Animated.parallel inside Animated.sequence inside Animated.parallel — deeply
    // nested composites are a known source of RN Animated completion callbacks silently never
    // firing, which would stall every phase after the first nested one.
    // Phase boundaries (ms): ring 0–420, check 420–740, pulse/headline 740–1120,
    // streak 1120–1620, today 1620–1960, week pulse 1960–2440, buttons 2440–2800.
    const chains: Animated.CompositeAnimation[] = [
      Animated.sequence([Animated.delay(0), Animated.timing(ring, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: false })]),
      Animated.sequence([Animated.delay(420), Animated.timing(check, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: false })]),
      Animated.sequence([Animated.delay(740), Animated.timing(iconScale, { toValue: 1, duration: 200, easing: Easing.out(Easing.back(1.7)), useNativeDriver: true })]),
      Animated.sequence([
        Animated.delay(740),
        Animated.timing(pulse, { toValue: 1, duration: 190, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 190, easing: Easing.in(Easing.quad), useNativeDriver: false }),
      ]),
      Animated.sequence([Animated.delay(740), Animated.timing(headlineAnim, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true })]),
      Animated.sequence([Animated.delay(1120), Animated.timing(cardAnim, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.cubic), useNativeDriver: true })]),
      streakIncreased
        ? Animated.sequence([
            Animated.delay(1380),
            Animated.timing(streakOld, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ])
        : Animated.sequence([Animated.delay(1120), Animated.timing(streakNew, { toValue: 1, duration: 1, useNativeDriver: true })]),
      ...(streakIncreased ? [
        Animated.sequence([Animated.delay(1380), Animated.timing(streakNew, { toValue: 1, duration: 240, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true })]),
        Animated.sequence([
          Animated.delay(1620),
          Animated.timing(streakPop, { toValue: 1.06, duration: 90, useNativeDriver: true }),
          Animated.timing(streakPop, { toValue: 1, duration: 120, useNativeDriver: true }),
        ]),
      ] : []),
      todayAnimates
        ? Animated.sequence([Animated.delay(1620), Animated.timing(todayFill, { toValue: 1, duration: 340, easing: Easing.out(Easing.back(1.4)), useNativeDriver: false })])
        : Animated.sequence([Animated.delay(1620), Animated.timing(todayFill, { toValue: todayRestingFilled ? 1 : 0, duration: 1, useNativeDriver: false })]),
      ...(todayAnimates ? [Animated.sequence([Animated.delay(1740), Animated.timing(todayCheck, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: false })])] : []),
      Animated.sequence([Animated.delay(1960), Animated.timing(weekPulse, { toValue: 1, duration: 480, easing: Easing.inOut(Easing.cubic), useNativeDriver: false })]),
      Animated.sequence([Animated.delay(2440), Animated.timing(buttonsAnim, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true })]),
    ];
    Animated.parallel(chains).start(() => {
      if (isMilestone) setTimeout(() => hapticSuccess(), 140);
      setActionsReady(true);
    });
    // Safety net: if any chain's callback is ever swallowed by the platform, actions still
    // become usable once the sequence's own total duration has elapsed.
    const fallback = setTimeout(() => setActionsReady(true), 2900);
    return () => clearTimeout(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  const ringDashoffset = ring.interpolate({ inputRange: [0, 1], outputRange: [RING_CIRCUMFERENCE, 0] });
  const checkDashoffset = check.interpolate({ inputRange: [0, 1], outputRange: [CHECK_LEN, 0] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] });
  const streakOldTranslate = streakOld.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] });
  const streakNewTranslate = streakNew.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  const todayDotBg = todayFill.interpolate({ inputRange: [0, 1], outputRange: ['rgba(201,255,24,0.05)', 'rgba(201,255,24,0.18)'] });
  const todayDotBorder = todayFill.interpolate({ inputRange: [0, 1], outputRange: ['rgba(201,255,24,0.12)', 'rgba(201,255,24,0.55)'] });
  const todayCheckDashoffset = todayCheck.interpolate({ inputRange: [0, 1], outputRange: [DAY_CHECK_LEN, 0] });

  return <Pressable
    accessibilityRole="none"
    onPress={() => { if (!skipped) jumpToEnd(); }}
    style={styles.overlay}
  >
    <View accessibilityViewIsModal accessibilityLabel="Workout complete" style={styles.content}>
      <View style={styles.center}>
        <View style={styles.iconWrap}>
          <Animated.View pointerEvents="none" style={[styles.glow, { opacity: glowOpacity }]} />
          <Animated.View style={[styles.iconBg, { transform: [{ scale: iconScale }] }]} />
          <Svg width={96} height={96} viewBox="0 0 96 96" style={StyleSheet.absoluteFill}>
            <Circle cx={48} cy={48} r={RING_R} stroke="rgba(201,255,24,0.1)" strokeWidth={1.5} fill="none" />
            <AnimatedCircle
              cx={48} cy={48} r={RING_R}
              stroke={palette.accent}
              strokeWidth={1.5}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${RING_CIRCUMFERENCE}`}
              strokeDashoffset={ringDashoffset}
              rotation={-90}
              origin="48, 48"
            />
            <AnimatedPath
              d={CHECK_D}
              stroke={palette.accent}
              strokeWidth={2.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              strokeDasharray={`${CHECK_LEN}`}
              strokeDashoffset={checkDashoffset}
            />
          </Svg>
        </View>

        <Animated.View style={{ opacity: headlineAnim, transform: [{ translateY: headlineAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
          <Text style={styles.title}>{headline(payload).title}</Text>
          <Text style={styles.subtitle}>{headline(payload).body}</Text>
        </Animated.View>
      </View>

      <Animated.View style={{ opacity: cardAnim, transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }}>
        <View style={styles.card}>
          <View style={styles.streakRow}>
            <View style={styles.streakLeft}>
              <Text style={styles.eyebrow}>Training streak</Text>
              <View style={styles.numberRow}>
                <View style={styles.numberStack}>
                  {streakIncreased ? <Animated.Text style={[styles.streakNumber, { opacity: streakOld, transform: [{ translateY: streakOldTranslate }] }]}>
                    {previousStreak}
                  </Animated.Text> : null}
                  <Animated.Text style={[
                    styles.streakNumber,
                    streakIncreased ? styles.streakNumberAbsolute : null,
                    { opacity: streakNew, transform: [{ translateY: streakNewTranslate }, { scale: streakPop }] },
                  ]}>
                    {currentStreak}
                  </Animated.Text>
                </View>
                <Text style={styles.sessionsLabel}>{currentStreak === 1 ? 'session' : 'sessions'}</Text>
              </View>
              {isMilestone ? <Text style={styles.milestoneTag}>New milestone</Text> : null}
            </View>
            {payload.longestPlanStreak !== undefined ? <View style={styles.bestBadge}>
              <Text style={styles.bestLabel}>Best</Text>
              <Text style={styles.bestValue}>{payload.longestPlanStreak}</Text>
            </View> : null}
          </View>

          {payload.week ? <>
            <View style={styles.divider} />
            <View style={styles.weekSection}>
              <Text style={styles.eyebrow}>This week</Text>
              <View style={styles.weekRow}>
                {payload.week.days.map(day => {
                  const isTodayDot = day.date === todayDateKey();
                  const done = day.status === 'completed' || day.status === 'extra';
                  const isRest = day.status === 'rest';
                  const isPartial = day.status === 'partial';
                  return <View key={day.date} style={styles.dayWrap}>
                    {isTodayDot ? <Animated.View style={[styles.dayDot, { backgroundColor: todayDotBg, borderColor: todayDotBorder }]}>
                      {todayAnimates ? <Svg width={14} height={14} viewBox="0 0 14 14">
                        <AnimatedPath d={DAY_CHECK_D} stroke={palette.accent} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={`${DAY_CHECK_LEN}`} strokeDashoffset={todayCheckDashoffset} />
                      </Svg> : done ? <Svg width={14} height={14} viewBox="0 0 14 14">
                        <Path d={DAY_CHECK_D} stroke={palette.accent} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </Svg> : <View style={[styles.dayPip, isRest && styles.dayPipRest, isPartial && styles.dayPipPartial]} />}
                    </Animated.View> : <View style={[styles.dayDotStatic, done && styles.dayDotDone]}>
                      {done ? <Svg width={14} height={14} viewBox="0 0 14 14">
                        <Path d={DAY_CHECK_D} stroke={palette.accent} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </Svg> : <View style={[styles.dayPip, isRest && styles.dayPipRest, isPartial && styles.dayPipPartial]} />}
                    </View>}
                    <Text style={[styles.dayLabel, done && styles.dayLabelDone]}>{day.shortLabel}</Text>
                  </View>;
                })}
              </View>
            </View>
          </> : null}

          {motivationalLine(payload) ? <Text style={styles.motivational}>{motivationalLine(payload)}</Text> : null}
        </View>
        {moment ? <View style={styles.momentWrap}><CoachMomentCard moment={moment} /></View> : null}
      </Animated.View>

      <View style={styles.spacer} />

      <Animated.View style={{ opacity: buttonsAnim, transform: [{ translateY: buttonsAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
        {onBackToToday ? <Pressable accessibilityRole="button" disabled={!actionsReady} onPress={() => { tap(); onBackToToday(); }} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Back to Today</Text>
        </Pressable> : null}
        <Pressable accessibilityRole="button" disabled={!actionsReady} onPress={() => { tap(); onViewSummary(); }} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>View workout summary</Text>
        </Pressable>
      </Animated.View>
    </View>
  </Pressable>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: palette.bg, zIndex: 50 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 32, width: '100%', maxWidth: 420, alignSelf: 'center' },
  center: { alignItems: 'center', paddingBottom: 32 },
  iconWrap: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: 124, height: 124, borderRadius: 62, backgroundColor: 'rgba(201,255,24,0.22)' },
  iconBg: { position: 'absolute', width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(201,255,24,0.06)' },
  title: { color: palette.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5, textAlign: 'center', marginTop: 24 },
  subtitle: { color: SLATE_MUTED_60, fontSize: 14, fontWeight: '400', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  card: { backgroundColor: palette.surface, borderWidth: 1, borderColor: SLATE_BORDER, borderRadius: 20, padding: 22, paddingVertical: 26, gap: 22 },
  streakRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  streakLeft: { gap: 4 },
  eyebrow: { color: SLATE_MUTED_60, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
  numberRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, height: 58 },
  numberStack: { height: 58, justifyContent: 'center' },
  streakNumber: { color: palette.accent, fontSize: 52, fontWeight: '800', letterSpacing: -1.5, lineHeight: 58 },
  streakNumberAbsolute: { position: 'absolute' },
  sessionsLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 16, fontWeight: '500', paddingBottom: 6 },
  milestoneTag: { color: palette.accent, fontSize: 11, fontWeight: '800', marginTop: 2 },
  bestBadge: { backgroundColor: LIME_GLOW_BG, borderWidth: 1, borderColor: LIME_GLOW_BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'flex-end', gap: 2 },
  bestLabel: { color: SLATE_MUTED_50, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  bestValue: { color: 'rgba(255,255,255,0.65)', fontSize: 18, fontWeight: '700', letterSpacing: -0.4 },
  divider: { height: 1, backgroundColor: SLATE_DIVIDER },
  weekSection: { gap: 12 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayWrap: { alignItems: 'center', gap: 8 },
  dayDot: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dayDotStatic: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: 'rgba(201,255,24,0.08)', backgroundColor: 'rgba(201,255,24,0.05)', alignItems: 'center', justifyContent: 'center' },
  dayDotDone: { borderColor: 'rgba(201,255,24,0.22)', backgroundColor: 'rgba(201,255,24,0.14)' },
  dayPip: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(148,163,184,0.1)' },
  dayPipRest: { backgroundColor: 'rgba(148,163,184,0.15)' },
  dayPipPartial: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,138,61,0.55)' },
  dayLabel: { color: 'rgba(148,163,184,0.3)', fontSize: 11, fontWeight: '600' },
  dayLabelDone: { color: 'rgba(255,255,255,0.65)' },
  motivational: { color: SLATE_MUTED_45, fontSize: 13, lineHeight: 19 },
  momentWrap: { marginTop: 14 },
  spacer: { flex: 1, minHeight: 24 },
  primaryButton: { minHeight: 56, borderRadius: 14, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#080D12', fontSize: 16, fontWeight: '700', letterSpacing: -0.3 },
  secondaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  secondaryButtonText: { color: SLATE_MUTED_50, fontSize: 14, fontWeight: '500' },
});
