import { PropsWithChildren, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Palette, useTheme } from '@/constants/sprintlab';

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  const styles = useStyles();
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Eyebrow({ children }: PropsWithChildren) {
  const styles = useStyles();
  return <Text style={styles.eyebrow}>{children}</Text>;
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
});
