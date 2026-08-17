import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Eyebrow, ScreenTitle } from '@/components/sprint-ui';
import { NotificationSetupCard } from '@/components/notification-setup-card';
import { Palette, useTheme } from '@/constants/sprintlab';
import { getAthleteProfile } from '@/utils/athlete-profile';
import { syncWorkoutReminders } from '@/utils/workout-reminders';
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  setNotificationOptInDecision,
  type NotificationPermissionStatus,
} from '@/utils/notification-permission';
import { error, success, tap } from '@/utils/haptics';

// The standalone, reachable-anytime version of SprintLab's own notification explanation screen
// (Settings → Notifications, and re-used inline by onboarding's reminder step). Enabling here is
// the ONLY athlete action in this screen that leads to the native permission prompt.

export default function NotificationsSetupScreen() {
  const router = useRouter();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [status, setStatus] = useState<NotificationPermissionStatus>('undetermined');
  const [enabling, setEnabling] = useState(false);

  useFocusEffect(useCallback(() => {
    void getNotificationPermissionStatus().then(setStatus);
  }, []));

  const enable = async () => {
    setEnabling(true);
    try {
      const result = await requestNotificationPermission();
      setStatus(result);
      await setNotificationOptInDecision('enabled');
      if (result === 'granted') {
        const profile = await getAthleteProfile();
        if (profile?.workoutReminderEnabled) await syncWorkoutReminders({ profile });
        success();
      }
    } catch {
      error();
    } finally {
      setEnabling(false);
    }
  };

  const notNow = async () => {
    await setNotificationOptInDecision('not-now');
    tap();
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Close" onPress={() => { tap(); router.back(); }} style={styles.iconButton}>
          <MaterialIcons name="close" color={palette.text} size={22} />
        </Pressable>
        <Eyebrow>Notifications</Eyebrow>
      </View>
      <View style={styles.body}>
        <ScreenTitle subtitle="Choose how SprintLab keeps you on track between sessions.">Notifications</ScreenTitle>
        <NotificationSetupCard
          status={status}
          enabling={enabling}
          onEnable={() => void enable()}
          onNotNow={status === 'undetermined' ? () => void notNow() : undefined}
        />
        {status === 'granted' ? (
          <Pressable accessibilityRole="button" onPress={() => { tap(); router.push('/settings'); }} style={styles.settingsLink}>
            <Text style={styles.settingsLinkText}>Manage reminder times in Settings</Text>
            <MaterialIcons name="arrow-forward" size={16} color={palette.muted} />
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const createStyles = (palette: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20 },
  iconButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  body: { width: '100%', maxWidth: 820, alignSelf: 'center', paddingHorizontal: 20, gap: 18 },
  settingsLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  settingsLinkText: { color: palette.muted, fontSize: 12, fontWeight: '800' },
});
