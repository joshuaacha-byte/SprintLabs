import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';
import { CoachLauncher } from '@/components/coach-launcher';
import { CoachOverlay } from '@/components/coach-overlay';
import { CoachProvider } from '@/components/coach-context';
import { Palette, useTheme } from '@/constants/sprintlab';
import { getAthleteProfile } from '@/utils/athlete-profile';
import { initializeWorkoutNotifications } from '@/utils/workout-reminders';
import { applyThemePreference, getThemePreference } from '@/utils/theme-preference';

export const unstable_settings = {
  anchor: '(tabs)',
};

SplashScreen.setOptions({ duration: 650, fade: true });

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    let cleanup: () => void = () => {};
    void initializeWorkoutNotifications(() => router.replace('/')).then(removeListener => {
      cleanup = removeListener;
    });
    return () => cleanup();
  }, [router]);

  useEffect(() => {
    let active = true;
    const minimumWelcome = new Promise(resolve => setTimeout(resolve, 700));
    void Promise.all([getAthleteProfile(), getThemePreference(), minimumWelcome]).then(([profile, themePreference]) => {
      if (!active) return;
      applyThemePreference(themePreference);
      if (!profile?.onboardingComplete && pathname !== '/profile') {
        router.replace('/profile');
      }
      setBooted(true);
    });
    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (!booted) {
    return (
      <SafeAreaProvider>
        <View style={styles.boot}>
          <View pointerEvents="none" style={styles.bootGlow} />
          <Image source={require('@/assets/images/sprintlab-logo.png')} resizeMode="contain" style={styles.bootSplit} />
          <Text style={styles.bootEyebrow}>Welcome to</Text>
          <Text style={styles.bootTitle}>SprintLab</Text>
          <View style={styles.bootLine} />
          <Text style={styles.bootCopy}>Science-based speed training, built for athletes by athletes.</Text>
          <StatusBar style="auto" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <CoachProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="readiness" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="workout-builder" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="workout" options={{ headerShown: false }} />
          <Stack.Screen name="log" options={{ headerShown: false }} />
          <Stack.Screen name="history-detail" options={{ headerShown: false }} />
          <Stack.Screen name="library-detail" options={{ headerShown: false }} />
          <Stack.Screen name="profile" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="plan-preview" options={{ headerShown: false, presentation: 'modal' }} />
        </Stack>
        <CoachLauncher />
        <CoachOverlay />
        <StatusBar style="auto" />
      </CoachProvider>
    </SafeAreaProvider>
  );
}

const createStyles = (palette: Palette) => StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.bg, overflow: 'hidden', padding: 24 },
  bootGlow: { position: 'absolute', width: 430, height: 430, borderRadius: 215, backgroundColor: '#4C760C', opacity: 0.22, top: -240, right: -180 },
  bootSplit: { width: 150, height: 150, marginBottom: 18 },
  bootEyebrow: { color: palette.accent, fontSize: 12, fontWeight: '900', letterSpacing: 4 },
  bootTitle: { color: palette.text, fontSize: 38, fontWeight: '900', letterSpacing: 1.5, marginTop: 5 },
  bootLine: { width: 54, height: 4, borderRadius: 2, backgroundColor: palette.accent, marginVertical: 16 },
  bootCopy: { color: palette.muted, fontSize: 14, fontWeight: '700' },
});
