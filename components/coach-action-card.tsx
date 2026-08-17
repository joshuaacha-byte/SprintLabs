import { ComponentProps, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CoachMarkdown } from '@/components/coach-markdown';
import { useCoach, type CoachActionMessage } from '@/components/coach-context';
import { Palette, useTheme } from '@/constants/sprintlab';
import type { WeekdayIndex } from '@/types';
import { coachActionRoute, COACH_ACTION_ICONS } from '@/utils/coach-actions';
import { toLocalDateKey } from '@/utils/progress';
import { getScheduledDay } from '@/utils/storage';
import { prepareWorkoutLaunch } from '@/utils/workout-launch';
import { tap } from '@/utils/haptics';

// SprintLab Coach UI Phase C-4: renders one navigation/workflow card (never a mutation — see
// components/coach-context.tsx's CoachActionMessage, already resolved against live storage
// before this component ever mounts). Tapping the card's button ALWAYS just closes Coach and
// navigates to an existing SprintLab screen — it never calls /api/coach and never mutates
// anything itself, exactly like the C-2 proposal card's "Keep Original" path never calls Gemini.
//
// `start_workout` is the one exception to a plain route push: it reuses utils/workout-launch.ts's
// existing prepareWorkoutLaunch — the same function app/library-detail.tsx, app/(tabs)/plan.tsx,
// and app/workout-builder.tsx already use to start a workout — rather than a second execution
// path. Everything else maps through utils/coach-actions.ts's fixed, allowlisted route table.

export function CoachActionCard({ message }: { message: CoachActionMessage }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const router = useRouter();
  const { closeCoach } = useCoach();
  const { action, display } = message;

  const go = async () => {
    tap();
    if (action.type === 'start_workout') {
      const todayIndex = new Date().getDay() as WeekdayIndex;
      const today = toLocalDateKey(new Date());
      // Re-fetched fresh at tap time rather than trusting the card's already-resolved display —
      // mirrors how utils/plan-change-apply.ts never trusts state captured when a proposal was
      // generated either.
      const day = await getScheduledDay(todayIndex, today);
      closeCoach();
      if (day.kind !== 'workout' || !day.workout) { router.push('/'); return; }
      const result = await prepareWorkoutLaunch(day.workout, 'plan', { scheduledDate: today, scheduledDayIndex: todayIndex });
      if (result === 'active-session') { router.push('/workout'); return; }
      router.push(result === 'readiness-required' ? { pathname: '/readiness', params: { launch: 'pending' } } : '/workout');
      return;
    }

    const target = coachActionRoute(action);
    closeCoach();
    if (target) router.push(target);
  };

  return <View style={styles.card}>
    <CoachMarkdown>{message.text}</CoachMarkdown>
    <View style={styles.body}>
      <View style={styles.eyebrowRow}>
        <MaterialIcons name={COACH_ACTION_ICONS[action.type] as ComponentProps<typeof MaterialIcons>['name']} size={13} color={palette.accent} />
        <Text style={styles.eyebrow}>{display.eyebrow}</Text>
      </View>
      <Text style={styles.title}>{display.title}</Text>
      {display.subtitle ? <Text style={styles.subtitle}>{display.subtitle}</Text> : null}
    </View>
    <Pressable accessibilityRole="button" onPress={() => void go()} style={styles.button}>
      <Text style={styles.buttonText}>{display.buttonLabel}</Text>
      <MaterialIcons name="arrow-forward" size={16} color="#0A0E07" />
    </Pressable>
  </View>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  card: { alignSelf: 'stretch', gap: 10, borderRadius: 16, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface2, padding: 13 },
  body: { gap: 3, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, paddingTop: 9 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  eyebrow: { color: palette.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  title: { color: palette.text, fontSize: 14, fontWeight: '800', marginTop: 2 },
  subtitle: { color: palette.muted, fontSize: 12, lineHeight: 16 },
  button: { flexDirection: 'row', gap: 6, minHeight: 40, borderRadius: 11, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#0A0E07', fontSize: 13, fontWeight: '900' },
});
