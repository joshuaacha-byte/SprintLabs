import { PropsWithChildren, useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Palette, useTheme } from '@/constants/sprintlab';

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  const styles = useStyles();
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Eyebrow({ children }: PropsWithChildren) {
  const styles = useStyles();
  return <Text style={styles.eyebrow}>{children}</Text>;
}
/** Compact SprintLab brand lockup: the canonical SL stopwatch mark (assets/images/sprintlab-logo.png
 * — the same asset used for the app icon and boot splash) plus a two-tone "SPRINTLAB" wordmark.
 * `variant` is reserved for future sizing (e.g. a larger splash/marketing treatment) — only
 * `'header'` exists today, sized for the Today screen's top-left brand area. */
export function SprintLabBrandLockup({ variant = 'header' }: { variant?: 'header' }) {
  void variant;
  const styles = useStyles();
  return (
    <View style={styles.lockup}>
      <View style={styles.lockupBadgeWrap}>
        <View style={styles.lockupGlow} pointerEvents="none" />
        <View style={styles.lockupBadge}>
          <Image source={require('@/assets/images/sprintlab-logo.png')} style={styles.lockupMark} resizeMode="contain" accessibilityIgnoresInvertColors />
        </View>
      </View>
      <Text style={styles.lockupWordmark}>
        <Text style={styles.lockupSprint}>SPRINT</Text>
        <Text style={styles.lockupLab}>LAB</Text>
      </Text>
    </View>
  );
}
export function ScreenTitle({ children, subtitle }: PropsWithChildren<{ subtitle?: string }>) {
  const styles = useStyles();
  return <View style={styles.titleWrap}><Text style={styles.title}>{children}</Text>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}</View>;
}
export function PrimaryButton({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  const styles = useStyles();
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && styles.pressed]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}
export function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  const palette = useTheme();
  const styles = useStyles();
  return <View style={styles.metric}><Text style={[styles.metricValue, accent && { color: palette.accent }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function useStyles() {
  const palette = useTheme();
  return useMemo(() => createStyles(palette), [palette]);
}

const createStyles = (palette: Palette) => StyleSheet.create({
  card: { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, borderRadius: 18, padding: 16 },
  eyebrow: { color: palette.muted, fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  titleWrap: { gap: 6 },
  title: { color: palette.text, fontSize: 30, lineHeight: 35, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { color: palette.muted, fontSize: 15, lineHeight: 21 },
  button: { backgroundColor: palette.accent, borderRadius: 14, minHeight: 54, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#0B1000', fontSize: 16, fontWeight: '900' },
  disabled: { opacity: 0.4 }, pressed: { opacity: 0.8 },
  metric: { flex: 1, minWidth: 90, gap: 4 },
  metricValue: { color: palette.text, fontSize: 22, fontWeight: '900' },
  metricLabel: { color: palette.muted, fontSize: 12, lineHeight: 16 },
  lockup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lockupBadgeWrap: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  lockupGlow: { position: 'absolute', width: 38, height: 38, borderRadius: 13, backgroundColor: palette.accent, opacity: 0.16 },
  lockupBadge: { width: 30, height: 30, borderRadius: 9, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(201,255,24,0.4)' },
  lockupMark: { width: '100%', height: '100%' },
  lockupWordmark: { fontSize: 19, fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.3 },
  lockupSprint: { color: palette.text },
  lockupLab: { color: palette.accent },
});
