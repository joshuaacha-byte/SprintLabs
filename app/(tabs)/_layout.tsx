import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';
import { useTheme } from '@/constants/sprintlab';
import { getAthleteProfile } from '@/utils/athlete-profile';
import { HapticTab } from '@/components/haptic-tab';

const icons = { index: 'bolt', plan: 'calendar-month', library: 'library-books', history: 'history', progress: 'insights' } as const;

export default function TabLayout() {
  const router = useRouter();
  const palette = useTheme();
  const colorScheme = useColorScheme();
  const light = colorScheme === 'light';
  const navigationColors = light
    ? { background: '#FFFFFF', border: '#CBD5C6', inactive: '#536255', scene: '#F4F7F1' }
    : { background: '#111922', border: '#243341', inactive: '#91A0AE', scene: '#080D12' };
  useEffect(() => {
    void getAthleteProfile().then(profile => {
      if (!profile?.onboardingComplete) router.replace('/profile');
    });
  }, [router]);
  return <Tabs screenOptions={({ route }) => ({
    headerShown: false,
    sceneStyle: { backgroundColor: navigationColors.scene },
    tabBarStyle: { backgroundColor: navigationColors.background, borderTopColor: navigationColors.border, height: 82, paddingTop: 8 },
    tabBarActiveTintColor: palette.accent,
    tabBarInactiveTintColor: navigationColors.inactive,
    tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 3 },
    tabBarButton: props => <HapticTab {...props} />,
    tabBarIcon: ({ color, size }) => <MaterialIcons name={icons[route.name as keyof typeof icons]} color={color} size={size} />,
  })}>
    <Tabs.Screen name="index" options={{ title: 'Today' }} />
    <Tabs.Screen name="plan" options={{ title: 'Plan' }} />
    <Tabs.Screen name="history" options={{ title: 'Logbook' }} />
    <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
    <Tabs.Screen name="library" options={{ href: null }} />
  </Tabs>;
}
