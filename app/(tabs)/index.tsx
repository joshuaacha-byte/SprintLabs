import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Card, Eyebrow, PrimaryButton, SprintLabBrandLockup } from '@/components/sprint-ui';
import { Palette, useTheme } from '@/constants/sprintlab';
import { ActiveWorkoutSession, AthleteProfile, ReadinessDecision, ScheduledDay, WeekdayIndex } from '@/types';
import { getAthleteProfile, getTrainingWorkflow } from '@/utils/athlete-profile';
import { evaluateReadiness, readinessLevelMeta, workoutIncludesMaximalSprinting } from '@/utils/readiness';
import { getActiveWorkoutSession, getReadiness, getScheduledDay, hasSavedWeekSchedule, startWorkoutSession } from '@/utils/storage';
import { completeStep, error, tap } from '@/utils/haptics';

const dateKey = () => new Date().toLocaleDateString('en-CA');

export default function TodayScreen() {
  const router = useRouter();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const todayIndex = new Date().getDay() as WeekdayIndex;
  const [scheduledDay, setScheduledDay] = useState<ScheduledDay | null>(null);
  const [readiness, setReadiness] = useState<ReadinessDecision | null>(null);
  const [activeSession, setActiveSession] = useState<ActiveWorkoutSession | null>(null);
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null);
  const [savedSchedule, setSavedSchedule] = useState(true);
  useFocusEffect(useCallback(() => {
    Promise.all([getScheduledDay(todayIndex), getReadiness(dateKey()), getActiveWorkoutSession(), getAthleteProfile(), hasSavedWeekSchedule()]).then(([day, decision, active, profile, saved]) => {
      setScheduledDay(day);
      setReadiness(decision);
      setActiveSession(active);
      setAthlete(profile);
      setSavedSchedule(saved);
    });
  }, [todayIndex]));

  const workflow = athlete ? getTrainingWorkflow(athlete) : null;
  // Until the athlete saves a suggested week, Today would otherwise silently show the generic starter
  // schedule as if it were their real plan — make that gap visible instead of presenting it as-is.
  const needsPlanSetup = !savedSchedule && (workflow === 'sprintlab-plan' || workflow === 'combined');

  const workout = scheduledDay?.kind === 'workout' ? scheduledDay.workout ?? null : null;
  const exerciseCount = workout?.sections.reduce((sum, section) => sum + section.exercises.length, 0) ?? 0;
  const readinessEvaluation = readiness?.status === 'completed' ? evaluateReadiness(readiness) : null;
  const readinessLevel = readiness?.readinessLevel ?? readinessEvaluation?.level;
  const readinessReasons = readiness?.readinessReasons ?? readinessEvaluation?.reasons ?? [];
  const readinessColor = readinessLevel === 'red' ? palette.red : readinessLevel === 'yellow' ? palette.orange : palette.accent;
  const maximalSprintRestricted = readiness?.maximalSprintRestricted ?? readinessEvaluation?.maximalSprintRestricted ?? false;
  const readinessBlocksWorkout = readiness?.status === 'completed'
    && (readinessLevel === 'red' || (maximalSprintRestricted && workoutIncludesMaximalSprinting(workout)));
  const startWorkout = async () => {
    if (activeSession) {
      tap();
      router.push('/workout');
      return;
    }
    if (!readiness) return;
    if (readinessBlocksWorkout) return;
    if (!workout || exerciseCount === 0) return;
    try {
      await startWorkoutSession(workout, readiness, {
        scheduledDate: dateKey(),
        scheduledDayIndex: todayIndex,
      });
      completeStep();
      router.push('/workout');
    } catch {
      error();
    }
  };
  const primaryLabel = activeSession
    ? `Resume ${workout?.title ?? 'workout'}`
    : readinessBlocksWorkout
      ? 'Modify session before starting'
      : readiness
        ? `Start ${workout?.title ?? 'workout'}`
        : 'Complete check-in to start';
  const unplannedWorkoutAction = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Start an unplanned workout"
      onPress={() => { tap(); router.push({ pathname: '/workout-builder', params: { mode: 'unplanned' } }); }}
      style={[styles.unplannedAction, !workout && styles.unplannedActionPrimary]}
    >
      <View style={[styles.unplannedIcon, !workout && styles.unplannedIconPrimary]}>
        <MaterialIcons name="add" size={20} color={!workout ? palette.accent : palette.muted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.unplannedTitle}>Start an unplanned workout</Text>
        <Text style={styles.unplannedCopy}>Log a coach-assigned, changed, or independent session without altering your weekly plan.</Text>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={!workout ? palette.accent : palette.muted} />
    </Pressable>
  );

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page}>
    <View style={styles.top}><View style={styles.brandColumn}><Eyebrow>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</Eyebrow><SprintLabBrandLockup /></View><Pressable accessibilityLabel="Open profile and settings" onPress={() => { tap(); router.push('/settings'); }} style={styles.avatar}><Text style={styles.avatarText}>{athlete?.name.trim().slice(0, 1).toUpperCase() || 'S'}</Text></Pressable></View>

    {needsPlanSetup ? <Pressable onPress={() => { tap(); router.push('/plan-preview'); }}><Card style={styles.setupCard}>
      <View style={styles.iconCircle}><MaterialIcons name="auto-awesome" size={22} color={palette.accent} /></View>
      <View style={{ flex: 1 }}><Text style={styles.cardTitle}>Finish building your plan</Text><Text style={styles.cardCopy}>The schedule below is a starting example, not your personalized week yet.</Text></View>
      <MaterialIcons name="chevron-right" size={26} color={palette.muted} />
    </Card></Pressable> : null}

    {!readiness ? <Pressable onPress={() => { tap(); router.push('/readiness'); }}><Card style={styles.emptyReadiness}>
      <View style={styles.iconCircle}><MaterialIcons name="monitor-heart" size={24} color={palette.accent} /></View>
      <View style={{ flex: 1 }}><Text style={styles.cardTitle}>Check in before training</Text><Text style={styles.cardCopy}>Record recovery, focus, and anything affecting today’s training.</Text></View>
      <MaterialIcons name="chevron-right" size={26} color={palette.muted} />
    </Card></Pressable> : <Pressable onPress={() => { tap(); router.push('/readiness'); }}><View style={styles.readinessLine}>
      {readiness.status === 'completed' && readinessLevel ? <View style={[styles.signalDot, { backgroundColor: readinessColor }]} /> : null}
      <Text style={styles.readinessLineText}>{readiness.status === 'skipped' ? 'Check-in skipped' : readinessLevel ? readinessLevelMeta[readinessLevel].shortLabel : 'Check-in complete'}{readiness.status === 'completed' && readinessReasons[0] ? ` — ${readinessReasons[0]}` : ''}</Text>
      <Text style={styles.readinessLineEdit}>{readiness.status === 'skipped' ? 'Complete' : 'Edit'}</Text>
    </View></Pressable>}

    {!workout ? unplannedWorkoutAction : null}

    {!workout ? <Card style={styles.restCard}>
      <Eyebrow>Today’s schedule</Eyebrow>
      <Text style={styles.openDayTitle}>No SprintLab workout planned</Text>
      <Text style={styles.cardCopy}>Coach training, team practice, recovery, or an independent session can still be logged today.</Text>
      <Pressable accessibilityRole="button" onPress={() => { tap(); router.push('/plan'); }} style={styles.planLink}>
        <Text style={styles.planLinkText}>View weekly plan</Text>
        <MaterialIcons name="arrow-forward" size={16} color={palette.muted} />
      </Pressable>
    </Card> : <>
      <Card style={styles.workoutCard}>
        <View style={styles.cardHead}><View style={{ flex: 1 }}><Eyebrow>Today’s session</Eyebrow><Text style={styles.workoutTitle}>{workout.title}</Text><Text style={styles.purposeLine}>{workout.purpose}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Edit today's session" onPress={() => { tap(); router.push({ pathname: '/workout-builder', params: { day: String(todayIndex) } }); }} style={styles.editButton}><MaterialIcons name="edit" size={17} color={palette.muted} /></Pressable></View>
        <View style={styles.chips}><Text style={styles.chip}>◷ {workout.durationMinutes} min</Text><Text style={styles.chip}>{exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'}</Text></View>
        <View style={styles.divider} />
        {workout.sections.filter(section => section.exercises.length > 0).map(section => <View key={section.title} style={styles.sectionRow}><Text style={styles.sectionName}>{section.title}</Text><Text style={styles.sectionCount}>{section.exercises.length}</Text></View>)}
        <PrimaryButton title={primaryLabel} onPress={startWorkout} disabled={exerciseCount === 0 || (!readiness && !activeSession) || Boolean(readinessBlocksWorkout && !activeSession)} />
        {activeSession ? <Text style={styles.startHint}>Continue the workout already in progress.</Text> : !readiness ? <Text style={styles.startHint}>Complete the check-in above, or choose Skip on that screen, to begin.</Text> : readinessBlocksWorkout ? <Text style={[styles.startHint, { color: palette.red }]}>Today’s check-in doesn’t support this maximal sprint prescription. Edit the session or follow coach/medical guidance.</Text> : null}
      </Card>
      {unplannedWorkoutAction}
    </>}
  </ScrollView></SafeAreaView>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg }, page: { padding: 20, paddingBottom: 36, gap: 18, width: '100%', maxWidth: 820, alignSelf: 'center' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, brandColumn: { gap: 5 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border }, avatarText: { color: palette.text, fontWeight: '800' },
  emptyReadiness: { flexDirection: 'row', alignItems: 'center', gap: 12, borderStyle: 'dashed', paddingVertical: 12 }, iconCircle: { width: 40, height: 40, borderRadius: 12, backgroundColor: palette.accentDark, alignItems: 'center', justifyContent: 'center' },
  setupCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: palette.accentDark },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }, cardTitle: { color: palette.text, fontSize: 17, fontWeight: '900' }, cardCopy: { color: palette.muted, fontSize: 13, lineHeight: 19 }, editButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  readinessLine: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30 }, signalDot: { width: 8, height: 8, borderRadius: 4 }, readinessLineText: { flex: 1, color: palette.muted, fontSize: 13, fontWeight: '600' }, readinessLineEdit: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  unplannedAction: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 17, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, padding: 14 },
  unplannedActionPrimary: { borderColor: palette.accent, backgroundColor: palette.accentDark },
  unplannedIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface2 },
  unplannedIconPrimary: { backgroundColor: palette.bg },
  unplannedTitle: { color: palette.text, fontSize: 14, fontWeight: '800' },
  unplannedCopy: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  workoutCard: { gap: 14 }, workoutTitle: { color: palette.text, fontSize: 26, lineHeight: 30, fontWeight: '900', marginTop: 4 }, purposeLine: { color: palette.muted, fontSize: 14, lineHeight: 20, marginTop: 4 }, chips: { flexDirection: 'row', gap: 8 }, chip: { color: palette.muted, backgroundColor: palette.surface2, borderRadius: 20, paddingVertical: 7, paddingHorizontal: 11, fontSize: 12, fontWeight: '700' }, divider: { height: 1, backgroundColor: palette.border },
  restCard: { gap: 8 }, openDayTitle: { color: palette.text, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 34 }, sectionName: { color: palette.text, fontSize: 14, fontWeight: '700' }, sectionCount: { color: palette.muted, backgroundColor: palette.surface2, minWidth: 26, textAlign: 'center', paddingVertical: 4, borderRadius: 10, fontSize: 11, fontWeight: '900' },
  planLink: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', minHeight: 44 }, planLinkText: { color: palette.muted, fontWeight: '800', fontSize: 13 }, startHint: { color: palette.muted, fontSize: 11, textAlign: 'center' },
});
