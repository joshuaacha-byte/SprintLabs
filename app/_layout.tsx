import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';
import { AnimatedSplash } from '@/components/animated-splash';
import { CoachLauncher } from '@/components/coach-launcher';
import { CoachOverlay } from '@/components/coach-overlay';
import { CoachProvider } from '@/components/coach-context';
import { SprintLabIntroOverlay } from '@/components/sprintlab-intro-overlay';
import { SprintLabIntroProvider } from '@/components/sprintlab-intro-context';
import { useTheme } from '@/constants/sprintlab';
import { getAthleteProfile } from '@/utils/athlete-profile';
import { initializeWorkoutNotifications } from '@/utils/workout-reminders';
import { applyThemePreference, getThemePreference } from '@/utils/theme-preference';

export const unstable_settings = {
  anchor: '(tabs)',
};

// The native launch screen (app.json's expo-splash-screen config — same #080D12 background and
// SL mark image as this animated splash) auto-hides with this fade once the root layout mounts,
// handing off to the animated splash below with no white flash in between.
SplashScreen.setOptions({ duration: 650, fade: true });

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const palette = useTheme();
  // The real app mounts (and its initial routing decision runs) as soon as data is ready, but
  // stays hidden behind the animated splash overlay until BOTH data is ready AND the splash has
  // played its full sequence — so a fast load never cuts the animation short, and a slow load
  // never leaves the animation frozen mid-sequence (it finishes and holds its settled frame).
  const [dataReady, setDataReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    let cleanup: () => void = () => {};
    void initializeWorkoutNotifications(() => router.replace('/')).then(removeListener => {
      cleanup = removeListener;
    });
    return () => cleanup();
  }, [router]);

  useEffect(() => {
    let active = true;
    void Promise.all([getAthleteProfile(), getThemePreference()]).then(([profile, themePreference]) => {
      if (!active) return;
      applyThemePreference(themePreference);
      if (!profile?.onboardingComplete && pathname !== '/profile') {
        router.replace('/profile');
      }
      setDataReady(true);
    });
    return () => {
      active = false;
    };
  }, [pathname, router]);

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        {dataReady ? <CoachProvider>
          <SprintLabIntroProvider>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="readiness" options={{ headerShown: false, presentation: 'modal' }} />
              <Stack.Screen name="workout-builder" options={{ headerShown: false, presentation: 'modal' }} />
              <Stack.Screen name="workout" options={{ headerShown: false }} />
              <Stack.Screen name="log" options={{ headerShown: false }} />
              <Stack.Screen name="history-detail" options={{ headerShown: false }} />
              <Stack.Screen name="library-detail" options={{ headerShown: false }} />
              <Stack.Screen name="library-substitute" options={{ headerShown: false, presentation: 'modal' }} />
              <Stack.Screen name="profile" options={{ headerShown: false, gestureEnabled: false }} />
              <Stack.Screen name="settings" options={{ headerShown: false, presentation: 'modal' }} />
              <Stack.Screen name="notifications-setup" options={{ headerShown: false, presentation: 'modal' }} />
              <Stack.Screen name="plan-preview" options={{ headerShown: false, presentation: 'modal' }} />
            </Stack>
            <CoachLauncher />
            <CoachOverlay />
            <SprintLabIntroOverlay />
          </SprintLabIntroProvider>
        </CoachProvider> : null}
        {!(dataReady && splashDone) ? <AnimatedSplash onFinish={() => setSplashDone(true)} /> : null}
        <StatusBar style="auto" />
      </View>
    </SafeAreaProvider>
  );
}
