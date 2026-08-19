import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Card, Eyebrow, ScreenTitle } from '@/components/sprint-ui';
import { AppFooter } from '@/components/app-footer';
import { Palette, useTheme } from '@/constants/sprintlab';
import { defaultWeekSchedule, OPEN_DAY_RESTTITLE } from '@/data/workouts';
import { AthleteProfile, CompletedWorkoutSession, ScheduledDay, WeekdayIndex } from '@/types';
import { getAthleteProfile, getTrainingWorkflow } from '@/utils/athlete-profile';
import { getCompletedWorkoutSessions, getWeekSchedule, markDayAsRest, swapScheduledDays } from '@/utils/storage';
import { sessionDateKey, toLocalDateKey } from '@/utils/progress';
import { prepareWorkoutLaunch } from '@/utils/workout-launch';
import { completeStep, error, tap, warning } from '@/utils/haptics';

export default function PlanScreen() {
  const router = useRouter();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const todayIndex = new Date().getDay() as WeekdayIndex;
  const [schedule, setSchedule] = useState<ScheduledDay[]>(defaultWeekSchedule);
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null);
  const [selected, setSelected] = useState<WeekdayIndex>(todayIndex);
  const [choosingMoveTarget, setChoosingMoveTarget] = useState(false);
  const [weekSessions, setWeekSessions] = useState<CompletedWorkoutSession[]>([]);

  const loadSchedule = useCallback(() => getWeekSchedule().then(setSchedule), []);
  useFocusEffect(useCallback(() => {
    loadSchedule();
    void getAthleteProfile().then(setAthlete);
    void getCompletedWorkoutSessions().then(setWeekSessions);
  }, [loadSchedule]));

  const workflow = athlete ? getTrainingWorkflow(athlete) : null;

  // Logging-only athletes get an entirely different screen below — no generated/open weekly grid
  // at all, since even an honestly-empty seven-day list would still read as "SprintLab made you a
  // schedule." Everything past this point is unchanged for the other three workflows.
  if (workflow === 'log-only') {
    return <LogOnlyPlanView sessions={weekSessions} palette={palette} styles={styles} router={router} />;
  }

  const trainingDays = schedule.filter(day => day.kind === 'workout').length;
  const restDays = schedule.length - trainingDays;
  const selectedDay = schedule.find(day => day.dayIndex === selected);
  const manualWorkflow = workflow === 'coach-plan';
  const workflowTitle = workflow === 'coach-plan' ? 'Coach-led training' : 'Build from your speed profile';
  const workflowCopy = workflow === 'coach-plan'
    ? 'SprintLab tracks and analyzes your training without replacing your coach’s programming. Add a session to any day, or log one you’ve already completed.'
    : workflow === 'combined'
      ? 'Keep coach or manual sessions, then preview SprintLab recommendations for appropriate open days.'
      : 'Preview a deterministic week selected from Approved library workouts.';

  const editDay = (dayIndex: WeekdayIndex) => {
    tap();
    router.push({ pathname: '/workout-builder', params: { day: String(dayIndex) } });
  };
  const findSubstitute = (dayIndex: WeekdayIndex) => {
    tap();
    // "Find substitute" targets the next real calendar occurrence of this recurring weekday
    // (today itself if it's today) — a plan-change proposal always targets a specific date.
    const today = new Date();
    const offset = (dayIndex - today.getDay() + 7) % 7;
    const target = new Date(today);
    target.setDate(today.getDate() + offset);
    router.push({ pathname: '/library-substitute', params: { date: target.toLocaleDateString('en-CA') } });
  };
  const markRest = async (dayIndex: WeekdayIndex) => {
    try {
      await markDayAsRest(dayIndex);
      warning();
      setChoosingMoveTarget(false);
      await loadSchedule();
    } catch {
      error();
    }
  };
  const swapWith = async (target: WeekdayIndex) => {
    try {
      await swapScheduledDays(selected, target);
      completeStep();
      setChoosingMoveTarget(false);
      await loadSchedule();
    } catch {
      error();
    }
  };
  const startPlanned = async (day: ScheduledDay) => {
    if (!day.workout) return;
    if (day.dayIndex !== todayIndex) {
      return Alert.alert(
        `Start ${day.fullLabel}’s workout today?`,
        'It will be recorded as a one-off session today. Your weekly plan will stay unchanged.',
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Start today', onPress: () => void launch(day, false) }],
      );
    }
    await launch(day, true);
  };
  const launch = async (day: ScheduledDay, scheduled: boolean) => {
    if (!day.workout) return;
    const result = await prepareWorkoutLaunch(day.workout, 'plan', scheduled ? { scheduledDate: new Date().toLocaleDateString('en-CA'), scheduledDayIndex: day.dayIndex } : undefined);
    if (result === 'active-session') {
      error();
      return Alert.alert('Workout already in progress', 'Finish or discard the active workout before starting another.', [{ text: 'Open workout', onPress: () => router.push('/workout') }]);
    }
    completeStep();
    if (result === 'readiness-required') router.push({ pathname: '/readiness', params: { launch: 'pending' } });
    else router.push('/workout');
  };

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page}>
    <Eyebrow>Recurring weekly schedule</Eyebrow>
    <ScreenTitle subtitle="Each weekday has its own workout or rest day. Today follows this schedule automatically.">My training week</ScreenTitle>
    <Card style={styles.suggestionCard}>
      <View style={styles.suggestionHead}>
        <View style={styles.suggestionIcon}><MaterialIcons name={manualWorkflow ? 'shield' : 'auto-awesome'} size={21} color={palette.accent} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.suggestionTitle}>{workflowTitle}</Text>
          <Text style={styles.suggestionCopy}>{workflowCopy}</Text>
        </View>
      </View>
      {!manualWorkflow ? <Pressable onPress={() => { tap(); router.push('/plan-preview'); }} style={styles.previewButton}><Text style={styles.previewButtonText}>Preview suggested week</Text><MaterialIcons name="arrow-forward" size={18} color={palette.accent} /></Pressable> : null}
    </Card>
    <View style={styles.summary}>
      <View><Text style={styles.big}>{trainingDays}</Text><Text style={styles.small}>training days</Text></View>
      <View><Text style={styles.big}>{restDays}</Text><Text style={styles.small}>rest days</Text></View>
    </View>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Browse workout library"
      onPress={() => { tap(); router.push('/library'); }}
      style={styles.libraryAction}
    >
      <View style={styles.libraryIcon}><MaterialIcons name="library-books" size={19} color={palette.accent} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.libraryTitle}>Browse workout library</Text>
        <Text style={styles.libraryCopy}>Find a session to add, use once, or swap into your week.</Text>
      </View>
      <MaterialIcons name="chevron-right" size={21} color={palette.muted} />
    </Pressable>

    {schedule.map(day => {
      const isSelected = selected === day.dayIndex;
      const isToday = todayIndex === day.dayIndex;
      const title = day.kind === 'workout' ? day.workout?.title || 'Workout' : day.restTitle === OPEN_DAY_RESTTITLE ? 'Not scheduled' : day.restTitle || 'Rest day';
      const detail = day.kind === 'workout'
        ? `${day.workout?.durationMinutes ?? 0} min · ${day.workout?.sections.reduce((sum, section) => sum + section.exercises.length, 0) ?? 0} exercises`
        : day.restNote || 'No training scheduled';
      return <Pressable key={day.dayIndex} onPress={() => { if (selected !== day.dayIndex) tap(); setSelected(day.dayIndex); setChoosingMoveTarget(false); }}>
        <Card style={isSelected ? styles.selected : undefined}>
          <View style={styles.row}>
            <View style={[styles.day, isSelected && styles.daySelected]}><Text style={styles.dayText}>{day.shortLabel}</Text></View>
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}><Text style={styles.name}>{title}</Text>{isToday ? <Text style={styles.todayBadge}>TODAY</Text> : null}</View>
              <Text style={styles.detail}>{detail}</Text>
            </View>
            <MaterialIcons name={day.kind === 'rest' ? 'bedtime' : 'chevron-right'} size={22} color={palette.muted} />
          </View>

          {isSelected ? <View style={styles.expanded}>
            {day.kind === 'workout' && day.workout ? <>
              <Text style={styles.expandedText}>{day.workout.purpose}</Text>
              <View style={styles.actions}>
                <Pressable onPress={() => startPlanned(day)} style={styles.startAction}><MaterialIcons name="play-arrow" size={18} color="#0B1000" /><Text style={styles.startActionText}>{isToday ? 'Start today’s session' : 'Start today'}</Text></Pressable>
                <Pressable onPress={() => editDay(day.dayIndex)} style={styles.primaryAction}><MaterialIcons name="edit" size={17} color={palette.accent} /><Text style={styles.primaryActionText}>Edit session</Text></Pressable>
                <Pressable onPress={() => findSubstitute(day.dayIndex)} style={styles.primaryAction}><MaterialIcons name="swap-horiz" size={17} color={palette.accent} /><Text style={styles.primaryActionText}>Find substitute</Text></Pressable>
                <Pressable onPress={() => { tap(); setChoosingMoveTarget(value => !value); }} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Move</Text></Pressable>
                <Pressable onPress={() => markRest(day.dayIndex)} style={styles.secondaryAction}><Text style={styles.restActionText}>Make rest day</Text></Pressable>
              </View>
            </> : <>
              <Text style={styles.expandedText}>{day.restNote}</Text>
              <View style={styles.actions}>
                <Pressable onPress={() => editDay(day.dayIndex)} style={styles.primaryAction}><MaterialIcons name="add" size={18} color={palette.accent} /><Text style={styles.primaryActionText}>Plan a workout</Text></Pressable>
                <Pressable onPress={() => { tap(); setChoosingMoveTarget(value => !value); }} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Move</Text></Pressable>
              </View>
            </>}

            {choosingMoveTarget && selectedDay ? <View style={styles.movePanel}>
              <Text style={styles.moveTitle}>Swap {selectedDay.fullLabel} with:</Text>
              <View style={styles.moveDays}>{schedule.filter(target => target.dayIndex !== selected).map(target => <Pressable key={target.dayIndex} onPress={() => swapWith(target.dayIndex)} style={styles.moveDay}><Text style={styles.moveDayText}>{target.shortLabel}</Text></Pressable>)}</View>
              <Text style={styles.moveHint}>The two scheduled days will exchange places.</Text>
            </View> : null}
          </View> : null}
        </Card>
      </Pressable>;
    })}
    <AppFooter />
  </ScrollView></SafeAreaView>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  page: { padding: 20, paddingBottom: 36, gap: 14, width: '100%', maxWidth: 820, alignSelf: 'center' },
  suggestionCard: { gap: 13, borderColor: '#405020' },
  suggestionHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  suggestionIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: palette.accentDark, alignItems: 'center', justifyContent: 'center' },
  suggestionTitle: { color: palette.text, fontSize: 15, fontWeight: '900' },
  suggestionCopy: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  previewButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 10 },
  previewButtonText: { color: palette.accent, fontSize: 12, fontWeight: '900' },
  summary: { flexDirection: 'row', gap: 12, paddingVertical: 4 },
  big: { color: palette.accent, fontSize: 27, fontWeight: '900' },
  small: { color: palette.muted, fontSize: 12, marginTop: 2 },
  libraryAction: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 15, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: 13, paddingVertical: 11 },
  libraryIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: palette.accentDark, alignItems: 'center', justifyContent: 'center' },
  libraryTitle: { color: palette.text, fontSize: 13, fontWeight: '900' },
  libraryCopy: { color: palette.muted, fontSize: 10, lineHeight: 14, marginTop: 2 },
  selected: { borderColor: palette.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  day: { width: 48, height: 48, borderRadius: 12, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: palette.accentDark },
  dayText: { color: palette.accent, fontWeight: '900', fontSize: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  name: { color: palette.text, fontWeight: '800', fontSize: 16 },
  todayBadge: { color: '#0B1000', backgroundColor: palette.accent, borderRadius: 7, paddingVertical: 3, paddingHorizontal: 6, fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  detail: { color: palette.muted, marginTop: 4, fontSize: 12 },
  expanded: { borderTopWidth: 1, borderTopColor: palette.border, marginTop: 14, paddingTop: 14, gap: 12 },
  expandedText: { color: palette.muted, lineHeight: 19, fontSize: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryAction: { minHeight: 42, paddingHorizontal: 14, borderRadius: 12, backgroundColor: palette.accentDark, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  startAction: { minHeight: 42, paddingHorizontal: 14, borderRadius: 12, backgroundColor: palette.accent, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
  startActionText: { color: '#0B1000', fontWeight: '900', fontSize: 12 },
  primaryActionText: { color: palette.accent, fontWeight: '900', fontSize: 12 },
  secondaryAction: { minHeight: 42, paddingHorizontal: 13, borderRadius: 12, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' },
  secondaryActionText: { color: palette.text, fontWeight: '800', fontSize: 12 },
  restActionText: { color: palette.muted, fontWeight: '800', fontSize: 12 },
  movePanel: { backgroundColor: palette.surface2, borderRadius: 13, padding: 12, gap: 10 },
  moveTitle: { color: palette.text, fontSize: 12, fontWeight: '900' },
  moveDays: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  moveDay: { width: 42, height: 38, borderRadius: 10, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border },
  moveDayText: { color: palette.accent, fontSize: 10, fontWeight: '900' },
  moveHint: { color: palette.muted, fontSize: 10 },
  logActions: { gap: 10 },
  logAction: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 15, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: 14 },
  logActionIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: palette.accentDark, alignItems: 'center', justifyContent: 'center' },
  logActionText: { flex: 1, color: palette.text, fontWeight: '800', fontSize: 14 },
  logSessionRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12 },
  logSessionIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' },
  logSessionTitle: { color: palette.text, fontWeight: '800', fontSize: 13 },
  logSessionDate: { color: palette.muted, fontSize: 11, marginTop: 2 },
  logEmptyCard: { alignItems: 'center', gap: 6, paddingVertical: 26 },
  logEmptyTitle: { color: palette.text, fontSize: 14, fontWeight: '900' },
  logEmptyCopy: { color: palette.muted, fontSize: 12, textAlign: 'center', maxWidth: 260 },
});

/** The entire Plan experience for a logging-only athlete — deliberately not the weekday grid used
 * by the other three workflows, since even an honestly-empty seven-day list would still read as a
 * SprintLab-generated schedule. Shows only what the athlete has actually logged. */
function LogOnlyPlanView({ sessions, palette, styles, router }: {
  sessions: CompletedWorkoutSession[];
  palette: Palette;
  styles: ReturnType<typeof createStyles>;
  router: ReturnType<typeof useRouter>;
}) {
  const now = new Date();
  const monday = new Date(now);
  const isoWeekday = (now.getDay() + 6) % 7; // 0 = Monday
  monday.setDate(now.getDate() - isoWeekday);
  const mondayKey = toLocalDateKey(monday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const sundayKey = toLocalDateKey(sunday);

  const thisWeek = sessions
    .filter(session => {
      const key = sessionDateKey(session);
      return key >= mondayKey && key <= sundayKey;
    })
    .sort((a, b) => sessionDateKey(b).localeCompare(sessionDateKey(a)));

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page}>
    <Eyebrow>Training log</Eyebrow>
    <ScreenTitle subtitle="Train on your own schedule. Log sessions as you complete them and SprintLab will track your training and progress.">
      Log your training
    </ScreenTitle>

    <View style={styles.logActions}>
      <Pressable accessibilityRole="button" onPress={() => { tap(); router.push({ pathname: '/workout-builder', params: { mode: 'unplanned' } }); }} style={styles.logAction}>
        <View style={styles.logActionIcon}><MaterialIcons name="add" size={19} color={palette.accent} /></View>
        <Text style={styles.logActionText}>Log a workout</Text>
        <MaterialIcons name="chevron-right" size={21} color={palette.muted} />
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => { tap(); router.push('/library'); }} style={styles.logAction}>
        <View style={styles.logActionIcon}><MaterialIcons name="library-books" size={19} color={palette.accent} /></View>
        <Text style={styles.logActionText}>Browse workout library</Text>
        <MaterialIcons name="chevron-right" size={21} color={palette.muted} />
      </Pressable>
    </View>

    <Eyebrow>This week</Eyebrow>
    {thisWeek.length ? <Card style={{ gap: 4 }}>
      {thisWeek.map((session, index) => <View key={session.id} style={[styles.logSessionRow, index > 0 && { borderTopWidth: 1, borderTopColor: palette.border }]}>
        <View style={styles.logSessionIcon}><MaterialIcons name="check" size={17} color={palette.accent} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.logSessionTitle}>{session.plannedWorkoutSnapshot.title}</Text>
          <Text style={styles.logSessionDate}>{new Date(`${sessionDateKey(session)}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
        </View>
      </View>)}
    </Card> : <Card style={styles.logEmptyCard}>
      <MaterialIcons name="event-note" size={26} color={palette.muted} />
      <Text style={styles.logEmptyTitle}>No sessions yet this week</Text>
      <Text style={styles.logEmptyCopy}>Your workouts will appear here as you log them.</Text>
    </Card>}
    <AppFooter />
  </ScrollView></SafeAreaView>;
}
