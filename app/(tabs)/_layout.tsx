import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FLOATING_TAB_BAR, useTheme } from '@/constants/sprintlab';
import { getAthleteProfile } from '@/utils/athlete-profile';
import { HapticTab } from '@/components/haptic-tab';

const icons = { index: 'bolt', plan: 'calendar-month', library: 'library-books', history: 'history', progress: 'insights' } as const;

export default function TabLayout() {
  const router = useRouter();
  const palette = useTheme();
  const insets = useSafeAreaInsets();
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
  // Floating dock: detached from the bottom/side edges rather than the previous flush, full-width
  // bar. sceneStyle's paddingBottom reserves the same space at the bottom of every tab screen's
  // content so the bar never covers the last bit of a scrollable list — done once here rather
  // than touching each screen's own padding.
  const floatingBarClearance = insets.bottom + FLOATING_TAB_BAR.bottomGap + FLOATING_TAB_BAR.height;
  return <Tabs screenOptions={({ route }) => ({
    headerShown: false,
    sceneStyle: { backgroundColor: navigationColors.scene, paddingBottom: floatingBarClearance },
    tabBarStyle: {
      position: 'absolute',
      left: FLOATING_TAB_BAR.horizontalInset,
      right: FLOATING_TAB_BAR.horizontalInset,
      bottom: insets.bottom + FLOATING_TAB_BAR.bottomGap,
      height: FLOATING_TAB_BAR.height,
      // Symmetric top/bottom padding (rather than the old top-only padding) is what actually
      // centers the icon+label stack in the taller box and keeps the label's descenders clear
      // of the bottom edge — the previous height/padding combination left zero room below the
      // label, which is what was clipping it on taller default label line-heights (e.g. iPad).
      paddingTop: 12,
      paddingBottom: 12,
      backgroundColor: navigationColors.background,
      borderWidth: 1,
      borderColor: navigationColors.border,
      borderRadius: FLOATING_TAB_BAR.borderRadius,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: light ? 0.12 : 0.35,
      shadowRadius: 16,
      elevation: 12,
    },
    tabBarItemStyle: { justifyContent: 'center' },
    tabBarActiveTintColor: palette.accent,
    tabBarInactiveTintColor: navigationColors.inactive,
    // An explicit lineHeight (rather than letting the platform default one) is the other half of
    // the clipping fix: a bare fontSize can render with more line-height than expected depending
    // on platform/accessibility text-size settings, pushing the label past a tightly-fitted box.
    tabBarLabelStyle: { fontSize: 11, fontWeight: '700', lineHeight: 14, marginTop: 4 },
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
