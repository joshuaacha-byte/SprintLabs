import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="readiness" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="workout-builder" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="workout" options={{ headerShown: false }} />
        <Stack.Screen name="log" options={{ headerShown: false }} />
        <Stack.Screen name="history-detail" options={{ headerShown: false }} />
        <Stack.Screen name="library-detail" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="plan-preview" options={{ headerShown: false, presentation: 'modal' }} />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}
