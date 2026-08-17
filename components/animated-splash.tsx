import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { Palette, useTheme } from '@/constants/sprintlab';

/**
 * SprintLab animated startup splash — logo appears inside a rounded app-icon-style tile, a calm
 * beat holds, a lock-in click/bounce/glow completes it, then the existing lime burst expands to
 * reveal the app. No motion travels around the logo (no ring sweep, no orbiting dot) — the logo
 * itself, using the real SL stopwatch mark (assets/images/sprintlab-logo.png, the same asset as
 * the app icon and the native expo-splash-screen image), is the only focus.
 *
 * All tunable values live in SPLASH_TIMING/SPLASH_LOOK below — nothing else in this file should
 * need to change to retime or restyle the sequence.
 */

// ─── Tunable timing (ms) ────────────────────────────────────────────────────
export const SPLASH_TIMING = {
  /** Tile + logo fade/scale in. */
  appearDuration: 420,
  /** When the calm pre-lock hold begins, relative to mount. */
  holdStart: 420,
  /** Length of the calm hold before lock-in — the screen should feel settled here. */
  holdDuration: 900,
  /** Lock-in (click + bounce + glow) duration, starting right after the hold. */
  lockInDuration: 420,
  /** Gap between lock-in finishing and the launch burst starting. */
  lockInToLaunchGap: 100,
  /** How long the lime burst takes to expand past the screen edges. */
  launchDuration: 620,
  /** How long the splash layer itself takes to fade once the burst starts. */
  splashFadeDuration: 380,
} as const;

const HOLD_START = SPLASH_TIMING.holdStart;
const LOCK_IN_START = HOLD_START + SPLASH_TIMING.holdDuration;
const LAUNCH_START = LOCK_IN_START + SPLASH_TIMING.lockInDuration + SPLASH_TIMING.lockInToLaunchGap;
const TOTAL_DURATION = LAUNCH_START + SPLASH_TIMING.launchDuration;

// ─── Tunable look ───────────────────────────────────────────────────────────
const SPLASH_LOOK = {
  /** Rounded tile the logo sits inside — sized and cornered like an app-icon tile. */
  tileSize: 168,
  tileRadius: 40,
  logoSize: 118,
  /** Tile/logo opacity and scale at the very start of "appear". */
  startOpacity: 0,
  startScale: 0.94,
  /** Peak scale during the lock-in bounce (subtle compression/rebound, not a pop). */
  lockInPeakScale: 1.025,
  lockInDipScale: 0.975,
  /** Ambient halo peak opacity during the calm hold — a gentle single breathe, not a spin. */
  haloPeakOpacity: 0.16,
  /** Glow flash peak opacity right at lock-in. */
  glowPeakOpacity: 0.5,
  burstMaxScale: 8, // relative to tileSize, comfortably exceeds any phone screen diagonal
} as const;

export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);

  const appear = useRef(new Animated.Value(0)).current;
  const haloOpacity = useRef(new Animated.Value(0)).current;
  const lockScale = useRef(new Animated.Value(1)).current;
  const lockLift = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0)).current;
  const burstScale = useRef(new Animated.Value(0)).current;
  const burstOpacity = useRef(new Animated.Value(0)).current;
  const splashOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Independent, delay-offset chains combined with one Animated.parallel (not nested
    // parallel-in-sequence-in-parallel) — see components/workout-completion-celebration.tsx for
    // why: deeply nested composites can silently drop their completion callback on some platforms.
    const chains: Animated.CompositeAnimation[] = [
      Animated.sequence([Animated.delay(0), Animated.timing(appear, { toValue: 1, duration: SPLASH_TIMING.appearDuration, easing: Easing.out(Easing.cubic), useNativeDriver: true })]),
      // Calm hold: one gentle ambient breathe behind the tile — no travel, no rotation.
      Animated.sequence([
        Animated.delay(HOLD_START),
        Animated.timing(haloOpacity, { toValue: 1, duration: SPLASH_TIMING.holdDuration * 0.6, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(haloOpacity, { toValue: 0.4, duration: SPLASH_TIMING.holdDuration * 0.4, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
      // Lock-in: tiny mechanical "click" dip, then a restrained rebound past 100% and settle.
      Animated.sequence([
        Animated.delay(LOCK_IN_START),
        Animated.timing(lockLift, { toValue: 1, duration: 60, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(lockLift, { toValue: 0, duration: 90, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(LOCK_IN_START),
        Animated.timing(lockScale, { toValue: SPLASH_LOOK.lockInDipScale, duration: 70, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(lockScale, { toValue: SPLASH_LOOK.lockInPeakScale, duration: 160, easing: Easing.out(Easing.back(1.8)), useNativeDriver: true }),
        Animated.timing(lockScale, { toValue: 1, duration: 190, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(LOCK_IN_START + 40),
        Animated.timing(glowPulse, { toValue: 1, duration: 170, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 0, duration: 210, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
      // Launch: lime burst expands past the screen edges; the splash layer fades shortly after.
      Animated.sequence([
        Animated.delay(LAUNCH_START),
        Animated.timing(burstOpacity, { toValue: 1, duration: 1, useNativeDriver: true }),
        Animated.parallel([
          Animated.timing(burstScale, { toValue: SPLASH_LOOK.burstMaxScale, duration: SPLASH_TIMING.launchDuration, easing: Easing.bezier(0.08, 0, 0.28, 1), useNativeDriver: true }),
          Animated.timing(burstOpacity, { toValue: 0, duration: SPLASH_TIMING.launchDuration, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        ]),
      ]),
      Animated.sequence([Animated.delay(LAUNCH_START + 120), Animated.timing(splashOpacity, { toValue: 0, duration: SPLASH_TIMING.splashFadeDuration, easing: Easing.in(Easing.ease), useNativeDriver: true })]),
    ];

    Animated.parallel(chains).start(() => onFinish());
    // Safety net matching the workout-completion screen's pattern: if a platform ever drops a
    // completion callback, the splash still resolves instead of staying on screen forever.
    const fallback = setTimeout(onFinish, TOTAL_DURATION + 400);
    return () => clearTimeout(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const glowOpacity = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0, SPLASH_LOOK.glowPeakOpacity] });
  const ambientOpacity = haloOpacity.interpolate({ inputRange: [0, 1], outputRange: [0, SPLASH_LOOK.haloPeakOpacity] });
  const lockTranslateY = lockLift.interpolate({ inputRange: [0, 1], outputRange: [0, 2] });
  const appearOpacity = appear;
  const appearScale = appear.interpolate({ inputRange: [0, 1], outputRange: [SPLASH_LOOK.startScale, 1] });

  return <Animated.View pointerEvents="none" style={[styles.overlay, { opacity: splashOpacity }]}>
    <Animated.View pointerEvents="none" style={[styles.ambientHalo, { opacity: ambientOpacity }]} />

    <Animated.View style={{ opacity: appearOpacity, transform: [{ scale: Animated.multiply(appearScale, lockScale) }, { translateY: lockTranslateY }] }}>
      <Animated.View pointerEvents="none" style={[styles.glow, { opacity: glowOpacity }]} />
      <Animated.View style={styles.tile}>
        <Animated.Image
          source={require('@/assets/images/sprintlab-logo.png')}
          resizeMode="contain"
          style={styles.logo}
        />
      </Animated.View>
    </Animated.View>

    <Animated.View pointerEvents="none" style={[styles.burst, { opacity: burstOpacity, transform: [{ scale: burstScale }] }]} />
  </Animated.View>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  ambientHalo: { position: 'absolute', width: SPLASH_LOOK.tileSize * 2.4, height: SPLASH_LOOK.tileSize * 2.4, borderRadius: SPLASH_LOOK.tileSize * 1.2, backgroundColor: palette.accent },
  glow: { position: 'absolute', width: SPLASH_LOOK.tileSize * 1.2, height: SPLASH_LOOK.tileSize * 1.2, left: -SPLASH_LOOK.tileSize * 0.1, top: -SPLASH_LOOK.tileSize * 0.1, borderRadius: SPLASH_LOOK.tileRadius * 1.2, backgroundColor: palette.accent },
  // Rounded app-icon-style tile — dark interior close to the logo's own baked-in background, a
  // hairline lime edge instead of a hard square border, so it reads as integrated into the splash.
  tile: {
    width: SPLASH_LOOK.tileSize,
    height: SPLASH_LOOK.tileSize,
    borderRadius: SPLASH_LOOK.tileRadius,
    backgroundColor: '#0A0F14',
    borderWidth: 1,
    borderColor: 'rgba(201,255,24,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: SPLASH_LOOK.logoSize, height: SPLASH_LOOK.logoSize },
  burst: { position: 'absolute', width: SPLASH_LOOK.tileSize, height: SPLASH_LOOK.tileSize, borderRadius: SPLASH_LOOK.tileSize / 2, backgroundColor: palette.accent },
});
