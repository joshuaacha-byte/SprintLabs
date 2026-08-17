import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSprintLabIntro } from '@/components/sprintlab-intro-context';
import { Palette, useTheme } from '@/constants/sprintlab';
import { SPRINTLAB_INTRO_COACH_CHIPS } from '@/utils/sprintlab-intro-steps';
import { completeStep, tap } from '@/utils/haptics';

// SprintLab first-time product tour: mounted once at the root layout (app/_layout.tsx), same as
// components/coach-launcher.tsx / coach-overlay.tsx. Renders whatever
// components/sprintlab-intro-context.tsx's state holds — it never owns tour state itself, and it
// never mutates readiness/workout/plan data. The dimmed "spotlight" is drawn as four rectangles
// around the real on-screen target rather than a portal/z-index trick, so the actual live Today
// content (the athlete's real workout, real readiness line, real Coach launcher) shows through the
// cutout undimmed instead of a screenshot or a recreated copy of it.

type Rect = { x: number; y: number; width: number; height: number };

export function SprintLabIntroOverlay() {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const { isActive, step, stepIndex, stepCount, next, skip, getTarget } = useSprintLabIntro();
  const [rect, setRect] = useState<Rect | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isActive || !step?.targetId) {
      setRect(null);
      return;
    }
    let cancelled = false;
    let attempts = 0;
    const targetId = step.targetId;
    const tryMeasure = () => {
      if (cancelled) return;
      const node = getTarget(targetId);
      if (node && typeof node.measureInWindow === 'function') {
        node.measureInWindow((x, y, width, height) => {
          if (!cancelled && width > 0 && height > 0) setRect({ x, y, width, height });
        });
      }
      attempts += 1;
      if (attempts < 12) setTimeout(tryMeasure, 120);
    };
    setRect(null);
    const timer = setTimeout(tryMeasure, 90);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isActive, step, getTarget]);

  // Shared pulse driver — the readiness step uses it for the small demo arrow, the coach step
  // uses it for a soft glow around the real launcher so the athlete's eye connects "SprintLab
  // Coach" with that exact character.
  useEffect(() => {
    if (!isActive || (step?.id !== 'readiness' && step?.id !== 'coach')) return;
    pulse.setValue(0);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [isActive, step, pulse]);

  if (!isActive || !step) return null;

  const advance = () => { tap(); next(); };
  const finish = () => { completeStep(); next(); };
  const dismiss = () => { tap(); skip(); };

  const hasSpotlight = Boolean(step.targetId);
  const placeBelow = rect ? rect.y < winH / 2 : true;
  const cardWidth = Math.min(360, winW - 40);
  // The coach launcher sits fixed bottom-right — anchor the card to that same side (instead of
  // centering) so it visually points at the widget rather than floating in the middle of the
  // screen, and clear extra vertical room so its taller (chips + button) content can never
  // overlap the real launcher underneath.
  const isCoachStep = step.id === 'coach';
  const cardLeft = isCoachStep ? Math.max(20, winW - cardWidth - 20) : (winW - cardWidth) / 2;
  const coachClearance = 300;

  const header = <View style={styles.headerRow}>
    <View style={styles.dots}>
      {Array.from({ length: stepCount }).map((_, index) => (
        <View key={index} style={[styles.dot, index === stepIndex && styles.dotActive]} />
      ))}
    </View>
    {step.id !== 'final' ? <Pressable accessibilityRole="button" onPress={dismiss} hitSlop={8}>
      <Text style={styles.skip}>Skip</Text>
    </Pressable> : null}
  </View>;

  const extra = step.id === 'readiness' ? <ReadinessDemo palette={palette} styles={styles} pulse={pulse} />
    : step.id === 'coach' ? <CoachChips styles={styles} />
    : null;

  const body = <View style={styles.cardBody}>
    {header}
    <Text style={styles.eyebrow}>{step.eyebrow}</Text>
    <Text style={styles.title}>{step.title}</Text>
    <Text style={styles.copy}>{step.body}</Text>
    {extra}
    <Pressable accessibilityRole="button" onPress={step.id === 'final' ? finish : advance} style={({ pressed }) => [styles.nextButton, pressed && styles.nextButtonPressed]}>
      <Text style={styles.nextButtonText}>{step.id === 'final' ? 'Start training' : 'Next'}</Text>
    </Pressable>
  </View>;

  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    {hasSpotlight && rect
      ? <SpotlightHole rect={rect} winW={winW} winH={winH} palette={palette} glow={isCoachStep ? pulse : undefined} />
      : <View pointerEvents="auto" style={styles.fullDim} />}

    {rect ? (
      <View style={[
        styles.tooltipCard,
        { width: cardWidth, left: cardLeft },
        placeBelow
          ? { top: Math.min(rect.y + rect.height + 14, winH - insets.bottom - 250) }
          : { top: Math.max(insets.top + 14, rect.y - 14 - (isCoachStep ? coachClearance : 250)) },
      ]}>
        {body}
      </View>
    ) : (
      <View style={styles.centerWrap} pointerEvents="box-none">
        <View style={[styles.tooltipCard, styles.centeredCard, { width: cardWidth }]}>{body}</View>
      </View>
    )}
  </View>;
}

function SpotlightHole({ rect, winW, winH, palette, glow }: { rect: Rect; winW: number; winH: number; palette: Palette; glow?: Animated.Value }) {
  const pad = 8;
  const x = Math.max(0, rect.x - pad);
  const y = Math.max(0, rect.y - pad);
  const width = Math.min(rect.width + pad * 2, winW - x);
  const height = Math.min(rect.height + pad * 2, winH - y);
  const dim = { backgroundColor: 'rgba(4,7,4,0.72)' };
  const glowPad = 10;
  const glowOpacity = glow?.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.4] });
  const glowScale = glow?.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  return <>
    <View pointerEvents="auto" style={[dim, { position: 'absolute', top: 0, left: 0, right: 0, height: y }]} />
    <View pointerEvents="auto" style={[dim, { position: 'absolute', top: y + height, left: 0, right: 0, bottom: 0 }]} />
    <View pointerEvents="auto" style={[dim, { position: 'absolute', top: y, left: 0, width: x, height }]} />
    <View pointerEvents="auto" style={[dim, { position: 'absolute', top: y, left: x + width, right: 0, height }]} />
    {/* A soft breathing halo behind the ring — only for the coach step — so the athlete's eye is
        drawn straight to the real launcher character rather than just a static outline. */}
    {glow ? <Animated.View pointerEvents="none" style={{
      position: 'absolute',
      top: y - glowPad, left: x - glowPad, width: width + glowPad * 2, height: height + glowPad * 2,
      borderRadius: (Math.min(width, height) + glowPad * 2) / 2,
      backgroundColor: palette.accent,
      opacity: glowOpacity,
      transform: [{ scale: glowScale ?? 1 }],
    }} /> : null}
    {/* Transparent — keeps the real content undimmed and visible, but still swallows taps so the
        athlete can't accidentally trigger the real workout/readiness/Coach action mid-tour. */}
    <View pointerEvents="auto" style={{ position: 'absolute', top: y, left: x, width, height }} />
    <View pointerEvents="none" style={{
      position: 'absolute', top: y, left: x, width, height,
      borderRadius: 16, borderWidth: 2, borderColor: palette.accent,
    }} />
  </>;
}

function ReadinessDemo({ palette, styles, pulse }: { palette: Palette; styles: ReturnType<typeof createStyles>; pulse: Animated.Value }) {
  const arrowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  return <View style={styles.demoRow}>
    <View style={styles.demoChip}><Text style={styles.demoChipText}>Readiness check</Text></View>
    <Animated.View style={{ opacity: arrowOpacity }}>
      <MaterialIcons name="arrow-forward" size={16} color={palette.accent} />
    </Animated.View>
    <View style={[styles.demoChip, styles.demoChipAccent]}><Text style={[styles.demoChipText, styles.demoChipTextAccent]}>Session adjusted</Text></View>
  </View>;
}

function CoachChips({ styles }: { styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.chipWrap}>
    {SPRINTLAB_INTRO_COACH_CHIPS.map(chip => (
      <View key={chip} style={styles.demoChip}><Text style={styles.demoChipText} numberOfLines={1}>{chip}</Text></View>
    ))}
  </View>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  fullDim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(4,7,4,0.78)' },
  centerWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  centeredCard: { position: 'relative' },
  tooltipCard: {
    position: 'absolute',
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: 'rgba(201,255,24,0.35)',
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  cardBody: { gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.border },
  dotActive: { backgroundColor: palette.accent, width: 16 },
  skip: { color: palette.muted, fontSize: 12, fontWeight: '800' },
  eyebrow: { color: palette.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase' },
  title: { color: palette.text, fontSize: 19, lineHeight: 24, fontWeight: '900' },
  copy: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  demoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  demoChip: { minHeight: 30, paddingHorizontal: 10, borderRadius: 10, backgroundColor: palette.surface2, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' },
  demoChipAccent: { backgroundColor: palette.accentDark, borderColor: palette.accent },
  demoChipText: { color: palette.text, fontSize: 11, fontWeight: '800' },
  demoChipTextAccent: { color: palette.accent },
  chipWrap: { gap: 7, marginTop: 2 },
  nextButton: { minHeight: 46, borderRadius: 13, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  nextButtonPressed: { opacity: 0.85 },
  nextButtonText: { color: '#0B1000', fontSize: 14, fontWeight: '900' },
});
