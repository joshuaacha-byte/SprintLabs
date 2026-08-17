import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { splitImages } from '@/components/onboarding';
import { useCoach } from '@/components/coach-context';
import { useIntroTarget } from '@/components/sprintlab-intro-context';
import { FLOATING_TAB_BAR, Palette, useTheme } from '@/constants/sprintlab';
import { tap } from '@/utils/haptics';
import { getCoachSurface } from '@/utils/coach-routes';
import { hasSeenCoachIntro, markCoachIntroSeen } from '@/utils/coach-discovery';

// SprintLab Coach UI Phase C-1: the one persistent Split launcher, mounted once at the root
// layout (see app/_layout.tsx). Route visibility is entirely driven by utils/coach-routes.ts —
// this component never hardcodes per-screen logic.

// Routes rendered inside the (tabs) group have a floating tab bar (see app/(tabs)/_layout.tsx,
// which shares FLOATING_TAB_BAR's geometry) that this root-level launcher sits above; every
// other visible route has no tab bar, so the launcher only needs to clear the safe area there.
const TAB_ROUTES = new Set(['/', '/plan', '/history', '/progress', '/library']);

const INTRO_APPEAR_DELAY = 900;
const INTRO_HOLD_DURATION = 2200;
const INTRO_FADE_DURATION = 220;

export function CoachLauncher() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { openCoach, hasAttention } = useCoach();
  const tourTargetRef = useIntroTarget('coach-launcher');
  const introOpacity = useRef(new Animated.Value(0)).current;
  const [introMounted, setIntroMounted] = useState(false);

  // Plays at most once ever (persisted flag), the first time the launcher becomes visible —
  // not once per screen, since this component stays mounted for the whole session and only its
  // rendered output is gated per-route. Subtle fade in, a short hold, fade out; never repeats.
  useEffect(() => {
    let cancelled = false;
    let appearTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    hasSeenCoachIntro().then(seen => {
      if (seen || cancelled) return;
      appearTimer = setTimeout(() => {
        if (cancelled) return;
        setIntroMounted(true);
        Animated.timing(introOpacity, { toValue: 1, duration: INTRO_FADE_DURATION, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
        hideTimer = setTimeout(() => {
          if (cancelled) return;
          Animated.timing(introOpacity, { toValue: 0, duration: INTRO_FADE_DURATION, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
            if (!cancelled) setIntroMounted(false);
          });
          void markCoachIntroSeen();
        }, INTRO_HOLD_DURATION);
      }, INTRO_APPEAR_DELAY);
    });

    return () => {
      cancelled = true;
      clearTimeout(appearTimer);
      clearTimeout(hideTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const surface = getCoachSurface(pathname);
  if (!surface) return null;

  const floatingBarTopClearance = insets.bottom + FLOATING_TAB_BAR.bottomGap + FLOATING_TAB_BAR.height;
  const bottomOffset = (TAB_ROUTES.has(pathname) ? floatingBarTopClearance : insets.bottom) + 16;

  return <View style={[styles.wrap, { bottom: bottomOffset }]} pointerEvents="box-none">
    {introMounted ? <Animated.View pointerEvents="none" style={[styles.introBubble, { opacity: introOpacity }]}>
      <Text style={styles.introText}>Ask Coach</Text>
    </Animated.View> : null}
    <Pressable
      ref={tourTargetRef}
      accessibilityRole="button"
      accessibilityLabel="Open SprintLab Coach"
      onPress={() => { tap(); openCoach({ surface }); }}
      style={({ pressed }) => [styles.launcher, pressed && styles.pressed]}
    >
      <View style={styles.glow} pointerEvents="none" />
      <Image source={splitImages.listening} style={styles.split} resizeMode="contain" accessibilityIgnoresInvertColors />
      {hasAttention ? <View style={styles.attentionDot} /> : null}
    </Pressable>
  </View>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  wrap: { position: 'absolute', right: 18, alignItems: 'flex-end' },
  launcher: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: 'rgba(201,255,24,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.accent,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
  glow: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 34,
    backgroundColor: palette.accent,
    opacity: 0.08,
  },
  split: { width: 44, height: 44 },
  attentionDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: palette.accent,
    borderWidth: 2,
    borderColor: palette.surface,
  },
  introBubble: {
    marginBottom: 8,
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 13,
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: 'rgba(201,255,24,0.35)',
  },
  introText: { color: palette.text, fontSize: 12, fontWeight: '800' },
});
