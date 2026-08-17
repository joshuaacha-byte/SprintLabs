import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Palette, useTheme } from '@/constants/sprintlab';
import type { NotificationPermissionStatus } from '@/utils/notification-permission';
import { openSystemNotificationSettings } from '@/utils/notification-permission';
import { tap } from '@/utils/haptics';

// The one place SprintLab explains notifications before ever touching the native permission API —
// used both inline in onboarding's reminder step and as the standalone app/notifications-setup.tsx
// screen, so the explanation → opt-in → OS-prompt sequence looks and behaves identically everywhere.

export function NotificationSetupCard({ status, onEnable, onNotNow, enabling }: {
  status: NotificationPermissionStatus;
  onEnable: () => void;
  /** Omit to hide the secondary action (e.g. when the card is only showing current status, not asking for a decision). */
  onNotNow?: () => void;
  enabling?: boolean;
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);

  if (status === 'granted') {
    return <View style={styles.card}>
      <View style={styles.iconCircle}><MaterialIcons name="notifications-active" size={22} color={palette.accent} /></View>
      <Text style={styles.title}>Notifications are on</Text>
      <Text style={styles.copy}>SprintLab can remind you about planned workouts, readiness check-ins, and important plan updates.</Text>
    </View>;
  }

  if (status === 'denied') {
    return <View style={styles.card}>
      <View style={styles.iconCircle}><MaterialIcons name="notifications-off" size={22} color={palette.muted} /></View>
      <Text style={styles.title}>Notifications are off</Text>
      <Text style={styles.copy}>Notifications were turned off for SprintLab at the system level. Turn them back on in your device settings to receive reminders.</Text>
      <Pressable accessibilityRole="button" onPress={() => { tap(); openSystemNotificationSettings(); }} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>Open device settings</Text>
      </Pressable>
    </View>;
  }

  return <View style={styles.card}>
    <View style={styles.iconCircle}><MaterialIcons name="notifications-none" size={22} color={palette.accent} /></View>
    <Text style={styles.title}>Stay on top of your training</Text>
    <Text style={styles.copy}>Get reminders for planned workouts, readiness check-ins, and important plan updates. You can turn this off anytime.</Text>
    <Pressable accessibilityRole="button" disabled={enabling} onPress={() => { tap(); onEnable(); }} style={[styles.primaryButton, enabling && styles.disabled]}>
      <Text style={styles.primaryButtonText}>{enabling ? 'Enabling…' : 'Enable Notifications'}</Text>
    </Pressable>
    {onNotNow ? <Pressable accessibilityRole="button" disabled={enabling} onPress={() => { tap(); onNotNow(); }} style={styles.secondaryButton}>
      <Text style={styles.secondaryButtonText}>Not Now</Text>
    </Pressable> : null}
  </View>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  card: { gap: 10, borderRadius: 18, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, padding: 18, alignItems: 'flex-start' },
  iconCircle: { width: 42, height: 42, borderRadius: 13, backgroundColor: palette.accentDark, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  title: { color: palette.text, fontSize: 17, fontWeight: '900' },
  copy: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  primaryButton: { alignSelf: 'stretch', minHeight: 48, borderRadius: 13, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  primaryButtonText: { color: '#0B1000', fontSize: 14, fontWeight: '900' },
  secondaryButton: { alignSelf: 'center', minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  secondaryButtonText: { color: palette.muted, fontSize: 13, fontWeight: '800' },
  disabled: { opacity: 0.6 },
});
