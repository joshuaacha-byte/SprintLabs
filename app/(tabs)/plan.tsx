import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Card, Eyebrow, ScreenTitle } from '@/components/sprint-ui';
import { AppFooter } from '@/components/app-footer';
import { palette } from '@/constants/sprintlab';
import { defaultWeekSchedule } from '@/data/workouts';
import { AthleteProfile, ScheduledDay, WeekdayIndex } from '@/types';
import { getAthleteProfile } from '@/utils/athlete-profile';
import { getWeekSchedule, markDayAsRest, swapScheduledDays } from '@/utils/storage';
import { prepareWorkoutLaunch } from '@/utils/workout-launch';

export default function PlanScreen() {
  const router = useRouter();
  const todayIndex = new Date().getDay() as WeekdayIndex;
  const [schedule, setSchedule] = useState<ScheduledDay[]>(defaultWeekSchedule);
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null);
  const [selected, setSelected] = useState<WeekdayIndex>(todayIndex);
  const [choosingMoveTarget, setChoosingMoveTarget] = useState(false);

  const loadSchedule = useCallback(() => getWeekSchedule().then(setSchedule), []);
  useFocusEffect(useCallback(() => {
    loadSchedule();
    void getAthleteProfile().then(setAthlete);
  }, [loadSchedule]));

  const trainingDays = schedule.filter(day => day.kind === 'workout').length;
  const restDays = schedule.length - trainingDays;
  const selectedDay = schedule.find(day => day.dayIndex === selected);

  const editDay = (dayIndex: WeekdayIndex) => {
    router.push({ pathname: '/workout-builder', params: { day: String(dayIndex) } });
  };
  const markRest = async (dayIndex: WeekdayIndex) => {
    await markDayAsRest(dayIndex);
    setChoosingMoveTarget(false);
    await loadSchedule();
  };
  const swapWith = async (target: WeekdayIndex) => {
    await swapScheduledDays(selected, target);
    setChoosingMoveTarget(false);
    await loadSchedule();
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
    if (result === 'active-session') return Alert.alert('Workout already in progress', 'Finish or discard the active workout before starting another.', [{ text: 'Open workout', onPress: () => router.push('/workout') }]);
    if (result === 'readiness-required') router.push({ pathname: '/readiness', params: { launch: 'pending' } });
    else router.push('/workout');
  };

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page}>
    <Eyebrow>Recurring weekly schedule</Eyebrow>
    <ScreenTitle subtitle="Each weekday has its own workout or rest day. Today follows this schedule automatically.">My training week</ScreenTitle>
    <Card style={styles.suggestionCard}>
      <View style={styles.suggestionHead}>
        <View style={styles.suggestionIcon}><MaterialIcons name={athlete?.trainingPlanMode === 'log-coach-plan' ? 'shield' : 'auto-awesome'} size={21} color={palette.accent} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.suggestionTitle}>{athlete?.trainingPlanMode === 'log-coach-plan' ? 'Coach plan protected' : 'Build from your speed profile'}</Text>
          <Text style={styles.suggestionCopy}>{athlete?.trainingPlanMode === 'log-coach-plan' ? 'SprintLab will not replace your coach’s plan. Keep editing the schedule manually.' : 'Preview a deterministic week selected only from Approved track workouts.'}</Text>
        </View>
      </View>
      {athlete?.trainingPlanMode !== 'log-coach-plan' ? <Pressable onPress={() => router.push('/plan-preview')} style={styles.previewButton}><Text style={styles.previewButtonText}>Preview suggested week</Text><MaterialIcons name="arrow-forward" size={18} color={palette.accent} /></Pressable> : null}
    </Card>
    <View style={styles.summary}>
      <View><Text style={styles.big}>{trainingDays}</Text><Text style={styles.small}>training days</Text></View>
      <View><Text style={styles.big}>{restDays}</Text><Text style={styles.small}>rest days</Text></View>
    </View>

    {schedule.map(day => {
      const isSelected = selected === day.dayIndex;
      const isToday = todayIndex === day.dayIndex;
      const title = day.kind === 'workout' ? day.workout?.title || 'Workout' : day.restTitle || 'Rest day';
      const detail = day.kind === 'workout'
        ? `${day.workout?.durationMinutes ?? 0} min · ${day.workout?.sections.reduce((sum, section) => sum + section.exercises.length, 0) ?? 0} exercises`
        : day.restNote || 'No training scheduled';
      return <Pressable key={day.dayIndex} onPress={() => { setSelected(day.dayIndex); setChoosingMoveTarget(false); }}>
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
                <Pressable onPress={() => setChoosingMoveTarget(value => !value)} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Move</Text></Pressable>
                <Pressable onPress={() => markRest(day.dayIndex)} style={styles.secondaryAction}><Text style={styles.restActionText}>Make rest day</Text></Pressable>
              </View>
            </> : <>
              <Text style={styles.expandedText}>{day.restNote}</Text>
              <View style={styles.actions}>
                <Pressable onPress={() => editDay(day.dayIndex)} style={styles.primaryAction}><MaterialIcons name="add" size={18} color={palette.accent} /><Text style={styles.primaryActionText}>Plan a workout</Text></Pressable>
                <Pressable onPress={() => setChoosingMoveTarget(value => !value)} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Move</Text></Pressable>
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

const styles = StyleSheet.create({
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
});
