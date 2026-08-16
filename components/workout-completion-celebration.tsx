import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Palette, useTheme } from '@/constants/sprintlab';
import type { WeekDayProgress } from '@/utils/progress';
import { completeStep, hapticSuccess, tap } from '@/utils/haptics';
import type { CelebrationKind } from '@/utils/streaks';

export type CelebrationPayload = {
  kind: CelebrationKind;
  planStreak?: { previous: number; current: number; isMilestone: boolean };
  consistencyStreak?: { previous: number; current: number; isMilestone: boolean };
  week?: { completed: number; due: number; days: WeekDayProgress[] };
};

const STATUS_META: Record<WeekDayProgress['status'], { icon: keyof typeof MaterialIcons.glyphMap; label: string }> = {
  completed: { icon: 'check', label: 'Completed' },
  partial: { icon: 'remove', label: 'Partial' },
  missed: { icon: 'close', label: 'Missed' },
  rest: { icon: 'bedtime', label: 'Rest' },
  today: { icon: 'radio-button-checked', label: 'Today' },
  upcoming: { icon: 'schedule', label: 'Scheduled later' },
};

function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then(value => { if (active) setReduceMotion(value); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', value => setReduceMotion(Boolean(value)));
    return () => { active = false; subscription?.remove?.(); };
  }, []);
  return reduceMotion;
}

function headline(payload: CelebrationPayload): { title: string; body: string } {
  if (payload.kind === 'one-off') {
    return { title: 'Workout saved', body: 'This one-off session was added to your Logbook.' };
  }
  if (payload.kind === 'started') {
    return { title: 'Plan Streak started', body: 'Your first scheduled session is complete.' };
  }
  if (payload.kind === 'maintained') {
    return { title: 'Workout saved', body: 'This session was recorded, but it doesn’t change your current Plan Streak — that comes from your most recent consecutive scheduled sessions.' };
  }
  const current = payload.planStreak?.current ?? 0;
  return { title: `${current}-session Plan Streak`, body: `${numberWord(current)} scheduled sessions completed in a row.` };
}

function numberWord(value: number) {
  const words = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  return value >= 0 && value <= 10 ? words[value] : String(value);
}

export function WorkoutCompletionCelebration({ payload, onViewSummary, onBackToToday }: {
  payload: CelebrationPayload;
  onViewSummary: () => void;
  onBackToToday?: () => void;
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const reduceMotion = useReduceMotion();
  const [actionsReady, setActionsReady] = useState(reduceMotion);

  const ringScale = useRef(new Animated.Value(reduceMotion ? 1 : 0.7)).current;
  const ringOpacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const haloScale = useRef(new Animated.Value(1)).current;
  const haloOpacity = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const streakOpacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const streakRise = useRef(new Animated.Value(reduceMotion ? 0 : 8)).current;
  const weekOpacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const weekRise = useRef(new Animated.Value(reduceMotion ? 0 : 10)).current;
  const actionsOpacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  const { title, body } = headline(payload);
  const isMilestone = Boolean(payload.planStreak?.isMilestone || payload.consistencyStreak?.isMilestone);

  useEffect(() => {
    const announcement = [
      'Workout saved.',
      payload.planStreak ? `Plan Streak: ${payload.planStreak.current} scheduled sessions completed in a row.` : null,
      payload.week ? `${payload.week.completed} of ${payload.week.due} planned sessions completed this week.` : null,
    ].filter(Boolean).join(' ');
    AccessibilityInfo.announceForAccessibility?.(announcement);

    if (reduceMotion) {
      completeStep();
      hapticSuccess();
      setActionsReady(true);
      return;
    }

    completeStep();
    Animated.sequence([
      // Stage 1 — completion ring resolves
      Animated.parallel([
        Animated.timing(ringOpacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(ringScale, { toValue: 1, damping: 12, stiffness: 160, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(checkOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(haloOpacity, { toValue: 0.35, duration: 90, useNativeDriver: true }),
          Animated.parallel([
            Animated.timing(haloOpacity, { toValue: 0, duration: 260, useNativeDriver: true }),
            Animated.timing(haloScale, { toValue: 1.35, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          ]),
        ]),
      ]),
      // Stage 2 — streak
      Animated.parallel([
        Animated.timing(streakOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(streakRise, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      // Stage 3 — weekly progress
      Animated.parallel([
        Animated.timing(weekOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(weekRise, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      // Stage 4 — actions become reachable
      Animated.timing(actionsOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      hapticSuccess();
      if (payload.kind === 'incremented' || payload.kind === 'started') tap();
      if (isMilestone) setTimeout(() => hapticSuccess(), 160);
      setActionsReady(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  return <View style={styles.overlay} accessibilityViewIsModal accessibilityLabel="Workout complete">
    <View style={styles.center}>
      <View style={styles.ringWrap}>
        <Animated.View pointerEvents="none" style={[styles.halo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]} />
        <Animated.View style={[styles.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]}>
          <Animated.View style={{ opacity: checkOpacity }}><MaterialIcons name="check" size={40} color={palette.accent} /></Animated.View>
        </Animated.View>
      </View>
      <Text style={styles.complete}>Workout complete</Text>

      <Animated.View style={{ opacity: streakOpacity, transform: [{ translateY: streakRise }], alignItems: 'center' }}>
        {payload.planStreak && payload.kind !== 'one-off' && payload.kind !== 'maintained' ? <Text style={styles.streakNumber}>{payload.planStreak.current}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </Animated.View>

      {payload.week ? <Animated.View style={{ opacity: weekOpacity, transform: [{ translateY: weekRise }], width: '100%' }}>
        <View style={styles.weekCard}>
          <Text style={styles.weekCaption}>{payload.week.completed} of {payload.week.due} planned {payload.week.due === 1 ? 'session' : 'sessions'} completed this week</Text>
          <View style={styles.weekRow}>
            {payload.week.days.map(day => {
              const meta = STATUS_META[day.status];
              return <View key={day.date} style={styles.dayWrap} accessibilityElementsHidden>
                <View style={[styles.dayDot, day.status === 'completed' && styles.dayDotDone, day.status === 'missed' && styles.dayDotMissed]}>
                  <MaterialIcons name={meta.icon} size={13} color={day.status === 'completed' ? palette.accent : day.status === 'missed' ? palette.red : palette.muted} />
                </View>
                <Text style={styles.dayLabel}>{day.shortLabel}</Text>
              </View>;
            })}
          </View>
          {payload.week.due > payload.week.completed ? <Text style={styles.weekHint}>{payload.week.due - payload.week.completed} more planned {payload.week.due - payload.week.completed === 1 ? 'session' : 'sessions'} to complete the week.</Text> : null}
        </View>
      </Animated.View> : null}
    </View>

    <Animated.View style={[styles.actions, { opacity: actionsOpacity }]} pointerEvents={actionsReady ? 'auto' : 'none'}>
      <Pressable accessibilityRole="button" disabled={!actionsReady} onPress={() => { tap(); onViewSummary(); }} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>View workout summary</Text>
      </Pressable>
      {onBackToToday ? <Pressable accessibilityRole="button" disabled={!actionsReady} onPress={() => { tap(); onBackToToday(); }} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Back to Today</Text>
      </Pressable> : null}
    </Animated.View>
  </View>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 48, paddingHorizontal: 24, zIndex: 50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, width: '100%', maxWidth: 380 },
  ringWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: palette.accent },
  ring: { width: 104, height: 104, borderRadius: 52, borderWidth: 3, borderColor: palette.accent, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentDark },
  complete: { color: palette.muted, fontSize: 14, fontWeight: '700' },
  streakNumber: { color: palette.text, fontSize: 56, lineHeight: 62, fontWeight: '900', fontVariant: ['tabular-nums'] },
  title: { color: palette.text, fontSize: 19, fontWeight: '900', textAlign: 'center', marginTop: 4 },
  body: { color: palette.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 4, maxWidth: 320 },
  weekCard: { width: '100%', borderRadius: 18, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, padding: 16, gap: 12, marginTop: 6 },
  weekCaption: { color: palette.text, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayWrap: { alignItems: 'center', gap: 5 },
  dayDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' },
  dayDotDone: { borderColor: palette.accent, backgroundColor: palette.accentDark },
  dayDotMissed: { borderColor: '#55282D', backgroundColor: '#301719' },
  dayLabel: { color: palette.muted, fontSize: 9, fontWeight: '800' },
  weekHint: { color: palette.muted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  actions: { width: '100%', maxWidth: 380, gap: 10 },
  primaryButton: { minHeight: 54, borderRadius: 16, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#0B1000', fontSize: 16, fontWeight: '900' },
  secondaryButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: palette.muted, fontSize: 13, fontWeight: '800' },
});
