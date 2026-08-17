import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Card, Eyebrow, PrimaryButton, ScreenTitle } from '@/components/sprint-ui';
import { AppFooter } from '@/components/app-footer';
import { Palette, useTheme } from '@/constants/sprintlab';
import type { AthleteProfile, CompletedWorkoutSession, ScheduledDay, SprintEvent, TrainingLog, WorkoutCategory, WorkoutCompletionStatus } from '@/types';
import { getAthleteProfile } from '@/utils/athlete-profile';
import { deriveSeasonPhase } from '@/utils/season-engine';
import { buildSprintSeries, buildWeeklyProgress, ScheduleHistoryEntry } from '@/utils/progress';
import { getCompletedWorkoutSessions, getScheduleHistory, getTrainingLogs, getWeekSchedule } from '@/utils/storage';
import { calculatePlanStreak } from '@/utils/streaks';
import {
  completionStatusDisplay,
  completionStatusLabels,
  defaultHistoryFilters,
  filterTrainingLogs,
  HistoryFilters,
  keySprintResult,
  readableDate,
  sorenessIndicator,
  workoutCategoryLabels,
} from '@/utils/training-history';
import { selection, tap } from '@/utils/haptics';

const categories = Object.keys(workoutCategoryLabels) as WorkoutCategory[];
const statuses = Object.keys(completionStatusLabels) as WorkoutCompletionStatus[];
const sprintEvents: SprintEvent[] = ['60m', '100m', '200m', '300m', '400m', '60m-hurdles', '100m-hurdles', '110m-hurdles', '400m-hurdles'];

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <Pressable onPress={() => { if (!selected) selection(); onPress(); }} style={[styles.filterChip, selected && styles.filterChipActive]}><Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>{label}</Text></Pressable>;
}

export default function HistoryScreen() {
  const router = useRouter();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [logs, setLogs] = useState<TrainingLog[]>([]);
  const [sessions, setSessions] = useState<CompletedWorkoutSession[]>([]);
  const [schedule, setSchedule] = useState<ScheduledDay[]>([]);
  const [scheduleHistory, setScheduleHistory] = useState<ScheduleHistoryEntry[]>([]);
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null);
  const [filters, setFilters] = useState<HistoryFilters>(defaultHistoryFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const load = useCallback(() => {
    Promise.all([getTrainingLogs(), getCompletedWorkoutSessions(), getWeekSchedule(), getScheduleHistory(), getAthleteProfile()])
      .then(([savedLogs, completedSessions, savedSchedule, history, profile]) => {
        setLogs(savedLogs);
        setSessions(completedSessions);
        setSchedule(savedSchedule);
        setScheduleHistory(history);
        setAthlete(profile);
      });
  }, []);
  useFocusEffect(load);
  const visibleLogs = useMemo(() => filterTrainingLogs(logs, filters), [filters, logs]);
  const hasFilters = Object.entries(filters).some(([key, value]) => key !== 'query' && value !== '');

  const weekly = useMemo(() => buildWeeklyProgress(schedule, sessions, new Date(), scheduleHistory), [schedule, sessions, scheduleHistory]);
  const streak = useMemo(() => calculatePlanStreak(schedule, sessions, new Date(), scheduleHistory), [schedule, sessions, scheduleHistory]);
  const season = athlete ? deriveSeasonPhase(athlete) : null;
  const bestSeries = useMemo(() => {
    const series = buildSprintSeries(sessions);
    const recent = series
      .map(item => ({ ...item, recentlyImproved: item.latest.id === item.best.id && item.points.length > 1 }))
      .find(item => item.recentlyImproved);
    return recent ?? null;
  }, [sessions]);
  const takeaway = weekly.due === 0
    ? null
    : bestSeries
      ? `Your most recent ${bestSeries.label} rep (${bestSeries.latest.timeSeconds}s) is your session-best for that distance.`
      : weekly.completed === weekly.due && weekly.due > 0
        ? 'Every scheduled session this week is accounted for.'
        : weekly.completed > 0
          ? `${weekly.completed} of ${weekly.due} scheduled sessions done so far this week.`
          : null;

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Eyebrow>Your training record</Eyebrow>
    <ScreenTitle subtitle="Review completed workouts, manual entries, and how each session went.">Logbook</ScreenTitle>

    {logs.length ? <Card style={styles.storyCard}>
      <View style={styles.storyRow}>
        <View style={styles.storyMetric}><Text style={styles.storyValue}>{weekly.completed}/{weekly.due}</Text><Text style={styles.storyLabel}>This week</Text></View>
        <View style={styles.storyDivider} />
        <View style={styles.storyMetric}><Text style={styles.storyValue}>{streak}</Text><Text style={styles.storyLabel}>Plan Streak</Text></View>
        {season ? <><View style={styles.storyDivider} /><View style={styles.storyMetric}><Text style={styles.storyValue} numberOfLines={1} adjustsFontSizeToFit>{season.phase.replaceAll('-', ' ')}</Text><Text style={styles.storyLabel}>Phase</Text></View></> : null}
      </View>
      {takeaway ? <Text style={styles.storyTakeaway}>{takeaway}</Text> : null}
    </Card> : null}

    <View style={styles.actionRow}>
      <Pressable onPress={() => { tap(); router.push('/log'); }} style={styles.manual}><MaterialIcons name="add" size={20} color={palette.accent} /><Text style={styles.manualText}>Log a session</Text></Pressable>
      <Pressable onPress={() => { tap(); setFiltersOpen(current => !current); }} style={[styles.filterButton, filtersOpen && styles.filterButtonActive]}><MaterialIcons name="tune" size={19} color={filtersOpen ? '#0B1000' : palette.accent} /><Text style={[styles.filterButtonText, filtersOpen && styles.filterButtonTextActive]}>Filters</Text></Pressable>
    </View>

    <View style={styles.searchWrap}><MaterialIcons name="search" size={20} color={palette.muted} /><TextInput value={filters.query} onChangeText={query => setFilters(current => ({ ...current, query }))} placeholder="Search workout names or notes" placeholderTextColor={palette.muted} style={styles.search} /></View>

    {filtersOpen && <Card style={styles.filtersCard}>
      <View style={styles.filterHead}><Text style={styles.filterTitle}>Filter history</Text>{hasFilters ? <Pressable onPress={() => { selection(); setFilters(defaultHistoryFilters); }}><Text style={styles.clearText}>Clear filters</Text></Pressable> : null}</View>
      <Text style={styles.filterLabel}>Date range · YYYY-MM-DD</Text>
      <View style={styles.dateRow}><TextInput value={filters.dateFrom} onChangeText={dateFrom => setFilters(current => ({ ...current, dateFrom }))} placeholder="From" placeholderTextColor={palette.muted} autoCapitalize="none" style={styles.dateInput} /><TextInput value={filters.dateTo} onChangeText={dateTo => setFilters(current => ({ ...current, dateTo }))} placeholder="To" placeholderTextColor={palette.muted} autoCapitalize="none" style={styles.dateInput} /></View>
      <Text style={styles.filterLabel}>Workout category</Text>
      <View style={styles.chips}><FilterChip label="All" selected={filters.category === 'all'} onPress={() => setFilters(current => ({ ...current, category: 'all' }))} />{categories.map(category => <FilterChip key={category} label={workoutCategoryLabels[category]} selected={filters.category === category} onPress={() => setFilters(current => ({ ...current, category }))} />)}</View>
      <Text style={styles.filterLabel}>Completion</Text>
      <View style={styles.chips}><FilterChip label="All" selected={filters.completionStatus === 'all'} onPress={() => setFilters(current => ({ ...current, completionStatus: 'all' }))} />{statuses.map(status => <FilterChip key={status} label={completionStatusLabels[status]} selected={filters.completionStatus === status} onPress={() => setFilters(current => ({ ...current, completionStatus: status }))} />)}</View>
      <Text style={styles.filterLabel}>Track event pathway</Text>
      <View style={styles.chips}><FilterChip label="All" selected={filters.pathway === 'all'} onPress={() => setFilters(current => ({ ...current, pathway: 'all' }))} />{sprintEvents.map(event => <FilterChip key={event} label={event} selected={filters.pathway === event} onPress={() => setFilters(current => ({ ...current, pathway: event }))} />)}</View>
    </Card>}

    <Text style={styles.resultsLabel}>{visibleLogs.length} {visibleLogs.length === 1 ? 'session' : 'sessions'}</Text>
    {visibleLogs.length ? visibleLogs.map(log => <HistoryRow key={log.id} log={log} onPress={() => { tap(); router.push({ pathname: '/history-detail', params: { id: log.id } }); }} />) : <EmptyHistory filtered={Boolean(logs.length)} onToday={() => { tap(); router.push('/'); }} onLog={() => { tap(); router.push('/log'); }} />}
    <AppFooter />
  </ScrollView></SafeAreaView>;
}

function HistoryRow({ log, onPress }: { log: TrainingLog; onPress: () => void }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const sprint = keySprintResult(log);
  const soreness = sorenessIndicator(log);
  const completed = log.completionStatus.startsWith('completed');
  return <Pressable onPress={onPress}><Card style={styles.logCard}><View style={styles.logTop}><View style={[styles.statusDot, completed ? styles.statusComplete : styles.statusPartial]} /><View style={{ flex: 1 }}><Text style={styles.date}>{readableDate(log.date)}</Text><Text style={styles.workoutName}>{log.plannedWorkout.name}</Text></View><MaterialIcons name="chevron-right" size={22} color={palette.muted} /></View><View style={styles.metaRow}><Text style={styles.category}>{workoutCategoryLabels[log.plannedWorkout.trainingCategory]}</Text><Text style={[styles.completion, completed ? styles.completeText : styles.partialText]}>{completionStatusDisplay(log)}</Text></View><View style={styles.metrics}><Metric label="RPE" value={log.sessionRpe ? `${log.sessionRpe}/10` : '—'} /><Metric label="Best sprint" value={sprint ?? '—'} /><Metric label="Soreness" value={soreness.label} tone={soreness.level} /></View></Card></Pressable>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'low' | 'moderate' | 'high' | 'unknown' }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, tone === 'high' && { color: palette.red }, tone === 'moderate' && { color: palette.orange }, tone === 'low' && { color: palette.accent }]} numberOfLines={1}>{value}</Text></View>;
}

function EmptyHistory({ filtered, onToday, onLog }: { filtered: boolean; onToday: () => void; onLog: () => void }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <Card style={styles.empty}><MaterialIcons name="history" size={34} color={palette.muted} /><Text style={styles.emptyTitle}>{filtered ? 'No sessions match those filters' : 'Your completed workouts will appear here'}</Text><Text style={styles.emptyCopy}>{filtered ? 'Clear or adjust the filters to see more of your record.' : 'Finish a workout from Today, or add a past session to start building a useful training record.'}</Text><View style={styles.emptyActions}><Pressable onPress={onToday} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Go to Today</Text></Pressable><PrimaryButton title="Log a session" onPress={onLog} /></View></Card>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg }, page: { padding: 20, paddingBottom: 36, gap: 14 },
  storyCard: { gap: 12, borderColor: '#405020' }, storyRow: { flexDirection: 'row', alignItems: 'center' }, storyMetric: { flex: 1, alignItems: 'center', gap: 3 }, storyValue: { color: palette.text, fontSize: 18, fontWeight: '900', textTransform: 'capitalize' }, storyLabel: { color: palette.muted, fontSize: 11, fontWeight: '700' }, storyDivider: { width: 1, height: 30, backgroundColor: palette.border }, storyTakeaway: { color: palette.muted, fontSize: 12, lineHeight: 17, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 11, textAlign: 'center' },
  actionRow: { flexDirection: 'row', gap: 10 }, manual: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.border, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' }, manualText: { color: palette.accent, fontSize: 12, fontWeight: '900' }, filterButton: { minHeight: 48, borderRadius: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 6 }, filterButtonActive: { backgroundColor: palette.accent, borderColor: palette.accent }, filterButtonText: { color: palette.accent, fontSize: 12, fontWeight: '900' }, filterButtonTextActive: { color: '#0B1000' }, searchWrap: { minHeight: 50, borderRadius: 14, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', gap: 9, alignItems: 'center', paddingHorizontal: 13 }, search: { flex: 1, color: palette.text, fontSize: 14, minHeight: 48 }, filtersCard: { gap: 10 }, filterHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, filterTitle: { color: palette.text, fontSize: 15, fontWeight: '900' }, clearText: { color: palette.accent, fontWeight: '800', fontSize: 12 }, filterLabel: { color: palette.muted, fontWeight: '900', fontSize: 10, letterSpacing: .7, marginTop: 4 }, dateRow: { flexDirection: 'row', gap: 8 }, dateInput: { flex: 1, minHeight: 44, borderRadius: 11, paddingHorizontal: 11, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface2, color: palette.text, fontSize: 13 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, filterChip: { minHeight: 32, borderRadius: 10, paddingHorizontal: 9, justifyContent: 'center', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface2 }, filterChipActive: { backgroundColor: palette.accentDark, borderColor: palette.accent }, filterChipText: { color: palette.muted, fontSize: 10, fontWeight: '800' }, filterChipTextActive: { color: palette.accent }, resultsLabel: { color: palette.muted, fontSize: 11, fontWeight: '900', letterSpacing: .8, marginTop: 2 }, logCard: { gap: 9 }, logTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, statusDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 }, statusComplete: { backgroundColor: palette.accent }, statusPartial: { backgroundColor: palette.orange }, date: { color: palette.muted, fontSize: 11, fontWeight: '800' }, workoutName: { color: palette.text, fontSize: 16, fontWeight: '900', marginTop: 3 }, metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, category: { color: palette.accent, backgroundColor: palette.accentDark, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, fontSize: 10, fontWeight: '900' }, completion: { fontSize: 10, fontWeight: '800', textAlign: 'right', flexShrink: 1 }, completeText: { color: palette.accent }, partialText: { color: palette.orange }, metrics: { flexDirection: 'row', gap: 8 }, metric: { flex: 1, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 8 }, metricLabel: { color: palette.muted, fontSize: 9, fontWeight: '800', textTransform: 'capitalize' }, metricValue: { color: palette.text, fontSize: 11, fontWeight: '900', marginTop: 3 }, empty: { alignItems: 'center', gap: 9, paddingVertical: 34 }, emptyTitle: { color: palette.text, textAlign: 'center', fontSize: 17, fontWeight: '900' }, emptyCopy: { color: palette.muted, textAlign: 'center', fontSize: 13, lineHeight: 19, maxWidth: 300 }, emptyActions: { width: '100%', gap: 10, marginTop: 8 }, secondaryAction: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: palette.border }, secondaryActionText: { color: palette.text, fontSize: 14, fontWeight: '900' },
});
