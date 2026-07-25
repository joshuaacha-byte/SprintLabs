import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Card, Eyebrow, PrimaryButton, ScreenTitle } from '@/components/sprint-ui';
import { palette } from '@/constants/sprintlab';
import { ActiveWorkoutSession, AthleteProfile, ReadinessDecision, ScheduledDay, WeekdayIndex } from '@/types';
import { getAthleteProfile } from '@/utils/athlete-profile';
import { evaluateReadiness, readinessLevelMeta } from '@/utils/readiness';
import { getActiveWorkoutSession, getReadiness, getScheduledDay, startWorkoutSession } from '@/utils/storage';

const dateKey = () => new Date().toLocaleDateString('en-CA');

export default function TodayScreen() {
  const router = useRouter();
  const todayIndex = new Date().getDay() as WeekdayIndex;
  const [scheduledDay, setScheduledDay] = useState<ScheduledDay | null>(null);
  const [readiness, setReadiness] = useState<ReadinessDecision | null>(null);
  const [activeSession, setActiveSession] = useState<ActiveWorkoutSession | null>(null);
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null);
  useFocusEffect(useCallback(() => {
    Promise.all([getScheduledDay(todayIndex), getReadiness(dateKey()), getActiveWorkoutSession(), getAthleteProfile()]).then(([day, decision, active, profile]) => {
      setScheduledDay(day);
      setReadiness(decision);
      setActiveSession(active);
      setAthlete(profile);
    });
  }, [todayIndex]));

  const workout = scheduledDay?.kind === 'workout' ? scheduledDay.workout ?? null : null;
  const exerciseCount = workout?.sections.reduce((sum, section) => sum + section.exercises.length, 0) ?? 0;
  const readinessEvaluation = readiness?.status === 'completed' ? evaluateReadiness(readiness) : null;
  const readinessLevel = readiness?.readinessLevel ?? readinessEvaluation?.level;
  const readinessReasons = readiness?.readinessReasons ?? readinessEvaluation?.reasons ?? [];
  const readinessColor = readinessLevel === 'red' ? palette.red : readinessLevel === 'yellow' ? palette.orange : palette.accent;
  const startWorkout = async () => {
    if (activeSession) {
      router.push('/workout');
      return;
    }
    if (!readiness) return;
    if (!workout || exerciseCount === 0) return;
    await startWorkoutSession(workout, readiness, {
      scheduledDate: dateKey(),
      scheduledDayIndex: todayIndex,
    });
    router.push('/workout');
  };
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page}>
    <View style={styles.top}><View><Eyebrow>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</Eyebrow><Text style={styles.brand}>SPRINTLAB</Text></View><Pressable accessibilityLabel="Open athlete profile" onPress={() => router.push('/profile')} style={styles.avatar}><Text style={styles.avatarText}>{athlete?.name.trim().slice(0, 1).toUpperCase() || 'S'}</Text></Pressable></View>
    <ScreenTitle subtitle="Review your readiness and today’s scheduled session.">Today</ScreenTitle>

    {!readiness ? <Pressable onPress={() => router.push('/readiness')}><Card style={styles.emptyReadiness}>
      <View style={styles.iconCircle}><MaterialIcons name="monitor-heart" size={24} color={palette.accent} /></View>
      <View style={{ flex: 1 }}><Eyebrow>1 · Pre-workout check-in</Eyebrow><Text style={styles.cardTitle}>Complete readiness check-in</Text><Text style={styles.cardCopy}>Record recovery, focus, and any pain or tightness before today’s session.</Text></View>
      <MaterialIcons name="chevron-right" size={26} color={palette.muted} />
    </Card></Pressable> : <Pressable onPress={() => router.push('/readiness')}><Card style={{ ...styles.readyCard, ...(readiness.status === 'completed' ? { borderColor: readinessColor } : {}) }}>
      <View style={styles.cardHead}><View style={{ flex: 1 }}><Eyebrow>1 · Pre-workout check-in</Eyebrow>{readiness.status === 'completed' && readinessLevel ? <View style={styles.signalTitle}><View style={[styles.signalDot, { backgroundColor: readinessColor }]} /><Text style={[styles.signalLabel, { color: readinessColor }]}>{readinessLevelMeta[readinessLevel].label}</Text></View> : null}<Text style={styles.cardTitle}>{readiness.status === 'skipped' ? 'Check-in skipped' : readinessLevel ? readinessLevelMeta[readinessLevel].shortLabel : 'Check-in complete'}</Text></View><Text style={styles.edit}>{readiness.status === 'skipped' ? 'Complete' : 'Edit'}</Text></View>
      {readiness.status === 'completed' ? <><View style={styles.metrics}><View><Text style={styles.metricValue}>{readiness.sleep ?? '—'}h</Text><Text style={styles.metricLabel}>Sleep</Text></View><View><Text style={styles.metricValue}>{readiness.neuralReadiness ?? '—'}/10</Text><Text style={styles.metricLabel}>Explosive</Text></View><View><Text style={styles.metricValue}>{readiness.soreness ?? '—'}/5</Text><Text style={styles.metricLabel}>Soreness</Text></View></View><View style={styles.reasonList}>{readinessReasons.slice(0, 2).map(reason => <View key={reason} style={styles.reasonRow}><Text style={[styles.reasonBullet, { color: readinessColor }]}>•</Text><Text style={styles.reasonText}>{reason}</Text></View>)}</View></> : <Text style={styles.cardCopy}>No readiness details were recorded for today.</Text>}
    </Card></Pressable>}

    {scheduledDay?.kind === 'rest' ? <Card style={styles.restCard}>
      <View style={styles.restIcon}><MaterialIcons name="bedtime" size={22} color={palette.accent} /></View>
      <Eyebrow>Today’s schedule</Eyebrow>
      <Text style={styles.workoutTitle}>{scheduledDay.restTitle || 'Rest day'}</Text>
      <Text style={styles.cardCopy}>{scheduledDay.restNote || 'No training is scheduled today.'}</Text>
      <Pressable onPress={() => router.push('/plan')} style={styles.addRow}><MaterialIcons name="calendar-month" size={19} color={palette.accent} /><Text style={styles.addText}>Open weekly plan</Text></Pressable>
    </Card> : workout ? <>
      <Card style={styles.workoutCard}>
        <View style={styles.cardHead}><View style={{ flex: 1 }}><Eyebrow>2 · Today’s session</Eyebrow><Text style={styles.workoutTitle}>{workout.title}</Text></View><Pressable onPress={() => router.push({ pathname: '/workout-builder', params: { day: String(todayIndex) } })} style={styles.editButton}><MaterialIcons name="edit" size={17} color={palette.accent} /><Text style={styles.edit}>Edit</Text></Pressable></View>
        <Text style={styles.cardCopy}>{workout.purpose}</Text>
        <View style={styles.chips}><Text style={styles.chip}>◷ {workout.durationMinutes} min</Text><Text style={styles.chip}>{exerciseCount} exercises</Text></View>
        <View style={styles.divider} />
        {workout.sections.filter(section => section.exercises.length > 0).map(section => <View key={section.title} style={styles.sectionRow}><Text style={styles.sectionName}>{section.title}</Text><Text style={styles.sectionCount}>{section.exercises.length}</Text></View>)}
        <Pressable onPress={() => router.push({ pathname: '/workout-builder', params: { day: String(todayIndex) } })} style={styles.addRow}><MaterialIcons name="add" size={20} color={palette.accent} /><Text style={styles.addText}>Edit today’s session</Text></Pressable>
      </Card>
      <View style={styles.startBlock}><Eyebrow>3 · Begin session</Eyebrow><PrimaryButton title={activeSession ? 'Resume workout' : readiness ? 'Start workout' : 'Check-in required'} onPress={startWorkout} disabled={exerciseCount === 0 || (!readiness && !activeSession)} />{activeSession ? <Text style={styles.startHint}>Continue the workout already in progress.</Text> : !readiness ? <Text style={styles.startHint}>Complete the check-in above, or choose Skip on that screen, to begin.</Text> : null}</View>
    </> : null}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg }, page: { padding: 20, paddingBottom: 36, gap: 18 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, brand: { color: palette.text, fontWeight: '900', fontSize: 18, letterSpacing: 1 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border }, avatarText: { color: palette.text, fontWeight: '800' },
  emptyReadiness: { flexDirection: 'row', alignItems: 'center', gap: 13, borderStyle: 'dashed' }, iconCircle: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.accentDark, alignItems: 'center', justifyContent: 'center' },
  readyCard: { gap: 16, borderColor: '#405020' }, cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }, cardTitle: { color: palette.text, fontSize: 17, fontWeight: '900', marginTop: 4 }, cardCopy: { color: palette.muted, fontSize: 13, lineHeight: 19 }, edit: { color: palette.accent, fontSize: 13, fontWeight: '900' }, editButton: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingVertical: 5 },
  signalTitle: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8 }, signalDot: { width: 9, height: 9, borderRadius: 5 }, signalLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  metrics: { flexDirection: 'row', justifyContent: 'space-between' }, metricValue: { color: palette.text, fontSize: 19, fontWeight: '900' }, metricLabel: { color: palette.muted, fontSize: 11, marginTop: 3 },
  reasonList: { gap: 6, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 12 }, reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 }, reasonBullet: { fontSize: 17, lineHeight: 17, fontWeight: '900' }, reasonText: { flex: 1, color: palette.muted, fontSize: 12, lineHeight: 17 },
  workoutCard: { gap: 13 }, workoutTitle: { color: palette.text, fontSize: 23, lineHeight: 28, fontWeight: '900', marginTop: 5 }, chips: { flexDirection: 'row', gap: 8 }, chip: { color: palette.muted, backgroundColor: palette.surface2, borderRadius: 20, paddingVertical: 7, paddingHorizontal: 11, fontSize: 12, fontWeight: '700' }, divider: { height: 1, backgroundColor: palette.border },
  restCard: { gap: 12, borderColor: '#405020' }, restIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.accentDark, alignItems: 'center', justifyContent: 'center' },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 34 }, sectionName: { color: palette.text, fontSize: 14, fontWeight: '700' }, sectionCount: { color: palette.muted, backgroundColor: palette.surface2, minWidth: 26, textAlign: 'center', paddingVertical: 4, borderRadius: 10, fontSize: 11, fontWeight: '900' },
  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 42, borderRadius: 12, backgroundColor: palette.accentDark }, addText: { color: palette.accent, fontWeight: '900', fontSize: 13 }, startBlock: { gap: 9 }, startHint: { color: palette.muted, fontSize: 11, textAlign: 'center' },
});
