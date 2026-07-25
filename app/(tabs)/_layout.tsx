import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { palette } from '@/constants/sprintlab';
import { getAthleteProfile } from '@/utils/athlete-profile';

const icons = { index: 'bolt', plan: 'calendar-month', library: 'library-books', history: 'history', progress: 'insights' } as const;

export default function TabLayout() {
  const router = useRouter();
  useEffect(() => {
    void getAthleteProfile().then(profile => {
      if (!profile?.onboardingComplete) router.push('/profile');
    });
  }, [router]);
  return <Tabs screenOptions={({ route }) => ({
    headerShown: false,
    sceneStyle: { backgroundColor: palette.bg },
    tabBarStyle: { backgroundColor: '#0C131A', borderTopColor: palette.border, height: 82, paddingTop: 8 },
    tabBarActiveTintColor: palette.accent,
    tabBarInactiveTintColor: palette.muted,
    tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 3 },
    tabBarIcon: ({ color, size }) => <MaterialIcons name={icons[route.name as keyof typeof icons]} color={color} size={size} />,
  })}>
    <Tabs.Screen name="index" options={{ title: 'Today' }} />
    <Tabs.Screen name="plan" options={{ title: 'Plan' }} />
    <Tabs.Screen name="library" options={{ title: 'Library' }} />
    <Tabs.Screen name="history" options={{ title: 'History' }} />
    <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
  </Tabs>;
}
