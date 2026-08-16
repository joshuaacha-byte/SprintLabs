import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { splitImages } from '@/components/onboarding';
import { useCoach } from '@/components/coach-context';
import { Palette, useTheme } from '@/constants/sprintlab';
import { tap } from '@/utils/haptics';
import { getCoachSurface } from '@/utils/coach-routes';

// SprintLab Coach UI Phase C-1: the one persistent Split launcher, mounted once at the root
// layout (see app/_layout.tsx). Route visibility is entirely driven by utils/coach-routes.ts —
// this component never hardcodes per-screen logic.

// Routes rendered inside the (tabs) group have an 82pt tab bar (see app/(tabs)/_layout.tsx's
// tabBarStyle.height) that this root-level launcher sits above; every other visible route has
// no tab bar, so the launcher only needs to clear the safe area there.
const TAB_BAR_HEIGHT = 82;
const TAB_ROUTES = new Set(['/', '/plan', '/history', '/progress', '/library']);

export function CoachLauncher() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { openCoach, hasAttention } = useCoach();

  const surface = getCoachSurface(pathname);
  if (!surface) return null;

  const bottomOffset = (TAB_ROUTES.has(pathname) ? TAB_BAR_HEIGHT : insets.bottom) + 16;

  return <Pressable
    accessibilityRole="button"
    accessibilityLabel="Open SprintLab Coach"
    onPress={() => { tap(); openCoach({ surface }); }}
    style={({ pressed }) => [styles.launcher, { bottom: bottomOffset }, pressed && styles.pressed]}
  >
    <View style={styles.glow} pointerEvents="none" />
    <Image source={splitImages.listening} style={styles.split} resizeMode="contain" accessibilityIgnoresInvertColors />
    {hasAttention ? <View style={styles.attentionDot} /> : null}
  </Pressable>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  launcher: {
    position: 'absolute',
    right: 18,
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
});
