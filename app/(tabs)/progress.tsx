import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Card, Eyebrow, ScreenTitle } from '@/components/sprint-ui';
import { formatTrackConditions } from '@/constants/logging';
import { palette } from '@/constants/sprintlab';
import { CompletedWorkoutSession, ScheduledDay, TrainingLogSummary } from '@/types';
import {
  buildRecentSessions,
  buildRecoveryTrend,
  buildScheduledSessionStreak,
  buildSprintSeries,
  buildWeeklyProgress,
  formatProgressDate,
  RecoveryDay,
  SprintSeries,
  WeekDayProgress,
} from '@/utils/progress';
import { getCompletedWorkoutSessions, getLogs, getWeekSchedule } from '@/utils/storage';

const statusMeta = {
  completed: { label: 'Done', symbol: '✓', color: palette.accent, background: palette.accentDark },
  partial: { label: 'Partial', symbol: '◐', color: palette.orange, background: '#2A1B0C' },
  missed: { label: 'Missed', symbol: '×', color: palette.red, background: '#301719' },
  rest: { label: 'Rest', symbol: '–', color: palette.muted, background: palette.surface2 },
  today: { label: 'Today', symbol: '•', color: palette.accent, background: palette.surface2 },
  upcoming: { label: 'Upcoming', symbol: '', color: palette.muted, background: palette.surface2 },
} as const;

export default function ProgressScreen() {
  const [logs, setLogs] = useState<TrainingLogSummary[]>([]);
  const [sessions, setSessions] = useState<CompletedWorkoutSession[]>([]);
  const [schedule, setSchedule] = useState<ScheduledDay[]>([]);
  const [selectedSeriesKey, setSelectedSeriesKey] = useState<string>();

  useFocusEffect(useCallback(() => {
    Promise.all([getLogs(), getCompletedWorkoutSessions(), getWeekSchedule()])
      .then(([savedLogs, completedSessions, savedSchedule]) => {
        setLogs(savedLogs);
        setSessions(completedSessions);
        setSchedule(savedSchedule);
      });
  }, []));

  const weekly = useMemo(() => buildWeeklyProgress(schedule, sessions), [schedule, sessions]);
  const streak = useMemo(() => buildScheduledSessionStreak(schedule, sessions), [schedule, sessions]);
  const sprintSeries = useMemo(() => buildSprintSeries(sessions), [sessions]);
  const recovery = useMemo(() => buildRecoveryTrend(logs), [logs]);
  const recent = useMemo(() => buildRecentSessions(logs, sessions), [logs, sessions]);

  useEffect(() => {
    if (!sprintSeries.length) {
      setSelectedSeriesKey(undefined);
      return;
    }
    if (!selectedSeriesKey || !sprintSeries.some(series => series.key === selectedSeriesKey)) {
      setSelectedSeriesKey(sprintSeries[0].key);
    }
  }, [selectedSeriesKey, sprintSeries]);

  const selectedSeries = sprintSeries.find(series => series.key === selectedSeriesKey);

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page}>
    <Eyebrow>Your training data</Eyebrow>
    <ScreenTitle subtitle="See whether the plan is getting done and how your training is changing.">Progress</ScreenTitle>

    <Card style={styles.weekCard}>
      <View style={styles.weekHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardEyebrow}>THIS WEEK</Text>
          <View style={styles.completionLine}><Text style={styles.heroValue}>{weekly.completed}</Text><Text style={styles.heroDivider}> / {weekly.due}</Text></View>
          <Text style={styles.heroText}>scheduled sessions completed</Text>
        </View>
        <View style={styles.percentBadge}><Text style={styles.percentValue}>{weekly.percentage}%</Text><Text style={styles.percentLabel}>complete</Text></View>
      </View>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${weekly.percentage}%` }]} /></View>
      {weekly.partial > 0 ? <Text style={styles.partialCopy}>{weekly.partial} partial {weekly.partial === 1 ? 'session is' : 'sessions are'} recorded separately.</Text> : null}
      <View style={styles.weekDays}>{weekly.days.map(day => <WeekDay key={day.date} day={day} />)}</View>
      <View style={styles.weekLegend}>
        {(['completed', 'partial', 'missed', 'rest'] as const).map(status => <View key={status} style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: statusMeta[status].color }]} /><Text style={styles.legendText}>{statusMeta[status].label}</Text></View>)}
      </View>
      <Text style={styles.planCaption}>Based on your current weekly plan. Rest and future days are excluded.</Text>
    </Card>

    <Card style={styles.streakCard}>
      <View style={styles.streakIcon}><MaterialIcons name="local-fire-department" size={25} color={palette.accent} /></View>
      <View style={{ flex: 1 }}><Text style={styles.streakValue}>{streak}</Text><Text style={styles.streakTitle}>scheduled {streak === 1 ? 'session' : 'sessions'} in a row</Text><Text style={styles.streakCopy}>Rest days never increase or break this consistency streak.</Text></View>
    </Card>

    <SectionTitle title="Speed performance" subtitle="Session-best timed efforts, kept separate by distance and exercise." />
    {sprintSeries.length ? <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seriesTabs}>
        {sprintSeries.map(series => <Pressable key={series.key} onPress={() => setSelectedSeriesKey(series.key)} style={[styles.seriesTab, selectedSeriesKey === series.key && styles.seriesTabActive]}><Text style={[styles.seriesTabText, selectedSeriesKey === series.key && styles.seriesTabTextActive]}>{series.label}</Text></Pressable>)}
      </ScrollView>
      {selectedSeries ? <SprintHistory series={selectedSeries} /> : null}
    </> : <EmptyCard icon="speed" title="No timed performance history yet" copy="Complete a speed rep and record its time to create the first distance-specific series." />}

    <SectionTitle title="Recovery trends" subtitle="Daily values from the last 14 days. Missing sleep is not counted as zero." />
    <Card style={styles.trendsCard}>
      <TrendRow label="Sleep" suffix="h" max={12} values={recovery.days} dataKey="sleep" latest={recovery.latest.sleep} average={recovery.averages.sleep} color="#63C7FF" />
      <TrendRow label="Session RPE" suffix="/10" max={10} values={recovery.days} dataKey="rpe" latest={recovery.latest.rpe} average={recovery.averages.rpe} color={palette.orange} />
      <TrendRow label="General soreness" suffix="/10" max={10} values={recovery.days} dataKey="soreness" latest={recovery.latest.soreness} average={recovery.averages.soreness} color={palette.red} />
    </Card>

    <SectionTitle title="Recent sessions" subtitle="The latest saved workouts and manual entries." />
    {recent.length ? recent.map(item => <Card key={item.id} style={styles.recentCard}>
      <View style={styles.recentRow}>
        <View style={[styles.sessionStatus, item.completed && styles.sessionStatusDone]}><Text style={styles.sessionStatusText}>{item.completed ? '✓' : '–'}</Text></View>
        <View style={{ flex: 1 }}>
          <View style={styles.recentTitleRow}><Text style={styles.recentTitle}>{item.title}</Text>{item.manual ? <Text style={styles.manualChip}>MANUAL</Text> : null}</View>
          <Text style={styles.recentMeta}>{new Date(item.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · RPE {item.rpe}{item.sleep ? ` · ${item.sleep}h sleep` : ''}</Text>
          {item.exercisesPlanned ? <Text style={styles.recentCoverage}>{item.exercisesCompleted ?? 0}/{item.exercisesPlanned} exercises completed</Text> : null}
          {item.bestSprintTime ? <Text style={styles.recentSprint}>{item.bestSprintDistance ? `${item.bestSprintDistance}m · ` : ''}{item.bestSprintTime}s · {formatTrackConditions(item.conditions)}</Text> : null}
        </View>
      </View>
    </Card>) : <EmptyCard icon="history" title="No saved sessions yet" copy="Finish a workout or log a past session to begin building progress." />}
  </ScrollView></SafeAreaView>;
}

function WeekDay({ day }: { day: WeekDayProgress }) {
  const meta = statusMeta[day.status];
  return <View style={styles.dayWrap}>
    <View style={[styles.dayDot, { backgroundColor: meta.background, borderColor: day.status === 'today' ? palette.accent : meta.background }]}><Text style={[styles.daySymbol, { color: meta.color }]}>{meta.symbol}</Text></View>
    <Text style={styles.dayLabel}>{day.shortLabel}</Text>
  </View>;
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <View style={styles.sectionHead}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionCopy}>{subtitle}</Text></View>;
}

function SprintHistory({ series }: { series: SprintSeries }) {
  const chartPoints = series.points.slice(-6);
  const values = chartPoints.map(point => point.timeSeconds);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return <Card style={styles.sprintCard}>
    <View style={styles.sprintMetrics}>
      <View><Text style={styles.metricLabel}>BEST</Text><Text style={styles.metricValue}>{series.best.timeSeconds}s</Text><Text style={styles.metricNote}>{formatProgressDate(series.best.date)}</Text></View>
      <View><Text style={styles.metricLabel}>LATEST</Text><Text style={styles.metricValue}>{series.latest.timeSeconds}s</Text><Text style={styles.metricNote}>{formatProgressDate(series.latest.date)}</Text></View>
      <View><Text style={styles.metricLabel}>SESSIONS</Text><Text style={styles.metricValue}>{series.points.length}</Text><Text style={styles.metricNote}>timed</Text></View>
    </View>
    <View style={styles.chart}>
      {chartPoints.map(point => {
        const height = min === max ? 56 : 34 + ((max - point.timeSeconds) / (max - min)) * 42;
        const best = point.id === series.best.id;
        return <View key={point.id} style={styles.chartPoint}><Text style={[styles.chartValue, best && { color: palette.accent }]}>{point.timeSeconds}</Text><View style={[styles.chartBar, { height, backgroundColor: best ? palette.accent : '#3D586C' }]} /><Text style={styles.chartDate}>{formatProgressDate(point.date, { month: 'numeric', day: 'numeric' })}</Text></View>;
      })}
    </View>
    <Text style={styles.fasterNote}>Higher bars indicate faster session-best times.</Text>
    <View style={styles.resultList}>{[...series.points].reverse().slice(0, 4).map(point => <View key={point.id} style={styles.resultRow}>
      <View><Text style={styles.resultTime}>{point.timeSeconds}s</Text><Text style={styles.resultDate}>{formatProgressDate(point.date, { weekday: 'short', month: 'short', day: 'numeric' })}</Text></View>
      <View style={{ flex: 1, alignItems: 'flex-end' }}><Text style={styles.resultConditions}>{formatTrackConditions(point.conditions)}</Text>{point.feeling ? <Text style={styles.resultFeeling}>{point.feeling.charAt(0).toUpperCase() + point.feeling.slice(1)}</Text> : null}</View>
    </View>)}</View>
  </Card>;
}

function TrendRow({ label, suffix, max, values, dataKey, latest, average, color }: { label: string; suffix: string; max: number; values: RecoveryDay[]; dataKey: 'sleep' | 'rpe' | 'soreness'; latest?: number; average?: number; color: string }) {
  const format = (value?: number) => value === undefined ? '—' : `${value.toFixed(1)}${suffix}`;
  return <View style={styles.trendRow}>
    <View style={styles.trendHead}><Text style={styles.trendLabel}>{label}</Text><View style={styles.trendNumbers}><Text style={[styles.trendLatest, { color }]}>Latest {format(latest)}</Text><Text style={styles.trendAverage}>Avg {format(average)}</Text></View></View>
    <View style={styles.trendBars}>{values.map(day => {
      const value = day[dataKey];
      const height = value === undefined ? 3 : Math.max(5, Math.min(42, (value / max) * 42));
      return <View key={day.date} style={styles.trendBarSlot}><View style={[styles.trendBar, { height, backgroundColor: value === undefined ? palette.surface2 : color, opacity: value === undefined ? 0.6 : 1 }]} /></View>;
    })}</View>
    <View style={styles.trendAxis}><Text style={styles.axisText}>14 days ago</Text><Text style={styles.axisText}>Today</Text></View>
  </View>;
}

function EmptyCard({ icon, title, copy }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; copy: string }) {
  return <Card style={styles.emptyCard}><MaterialIcons name={icon} size={27} color={palette.muted} /><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyCopy}>{copy}</Text></Card>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  page: { padding: 20, paddingBottom: 40, gap: 16, width: '100%', maxWidth: 900, alignSelf: 'center' },
  cardEyebrow: { color: palette.accent, fontWeight: '900', letterSpacing: 1.4, fontSize: 10 },
  weekCard: { gap: 15, borderColor: '#405020' },
  weekHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  completionLine: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  heroValue: { color: palette.text, fontSize: 43, lineHeight: 49, fontWeight: '900' },
  heroDivider: { color: palette.muted, fontSize: 23, fontWeight: '900' },
  heroText: { color: palette.muted, fontSize: 12 },
  percentBadge: { width: 70, height: 70, borderRadius: 23, backgroundColor: palette.accentDark, alignItems: 'center', justifyContent: 'center' },
  percentValue: { color: palette.accent, fontSize: 19, fontWeight: '900' },
  percentLabel: { color: palette.muted, fontSize: 9, marginTop: 2 },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: palette.surface2, overflow: 'hidden' },
  progressFill: { height: 7, borderRadius: 4, backgroundColor: palette.accent },
  partialCopy: { color: palette.orange, fontSize: 11, fontWeight: '700' },
  weekDays: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  dayWrap: { flex: 1, minWidth: 0, alignItems: 'center', gap: 5 },
  dayDot: { width: 31, height: 31, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  daySymbol: { fontSize: 14, fontWeight: '900' },
  dayLabel: { color: palette.text, fontSize: 10, fontWeight: '900' },
  weekLegend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { color: palette.muted, fontSize: 8, fontWeight: '800' },
  planCaption: { color: palette.muted, fontSize: 10, lineHeight: 15, textAlign: 'center' },
  streakCard: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  streakIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: palette.accentDark, alignItems: 'center', justifyContent: 'center' },
  streakValue: { color: palette.text, fontSize: 26, fontWeight: '900' },
  streakTitle: { color: palette.text, fontSize: 13, fontWeight: '900' },
  streakCopy: { color: palette.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  sectionHead: { gap: 4, marginTop: 6 },
  sectionTitle: { color: palette.text, fontSize: 20, fontWeight: '900' },
  sectionCopy: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  seriesTabs: { gap: 7, paddingRight: 20 },
  seriesTab: { minHeight: 38, borderRadius: 11, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, justifyContent: 'center', paddingHorizontal: 12 },
  seriesTabActive: { borderColor: palette.accent, backgroundColor: palette.accentDark },
  seriesTabText: { color: palette.muted, fontSize: 11, fontWeight: '800' },
  seriesTabTextActive: { color: palette.accent },
  sprintCard: { gap: 15 },
  sprintMetrics: { flexDirection: 'row', justifyContent: 'space-between' },
  metricLabel: { color: palette.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  metricValue: { color: palette.text, fontSize: 21, fontWeight: '900', marginTop: 3 },
  metricNote: { color: palette.muted, fontSize: 9, marginTop: 2 },
  chart: { height: 112, flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderBottomWidth: 1, borderBottomColor: palette.border, paddingBottom: 22 },
  chartPoint: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 90 },
  chartValue: { color: palette.muted, fontSize: 8, fontWeight: '800', marginBottom: 4 },
  chartBar: { width: '68%', minWidth: 15, maxWidth: 34, borderTopLeftRadius: 7, borderTopRightRadius: 7 },
  chartDate: { position: 'absolute', bottom: -17, color: palette.muted, fontSize: 8 },
  fasterNote: { color: palette.muted, fontSize: 9, textAlign: 'center' },
  resultList: { borderTopWidth: 1, borderTopColor: palette.border },
  resultRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderBottomColor: palette.border },
  resultTime: { color: palette.text, fontSize: 14, fontWeight: '900' },
  resultDate: { color: palette.muted, fontSize: 9, marginTop: 2 },
  resultConditions: { color: palette.text, fontSize: 10, fontWeight: '800', textAlign: 'right' },
  resultFeeling: { color: palette.accent, fontSize: 9, marginTop: 3 },
  trendsCard: { gap: 0, paddingVertical: 3 },
  trendRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.border, gap: 8 },
  trendHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  trendLabel: { color: palette.text, fontSize: 13, fontWeight: '900' },
  trendNumbers: { flexDirection: 'row', gap: 10 },
  trendLatest: { fontSize: 10, fontWeight: '900' },
  trendAverage: { color: palette.muted, fontSize: 10, fontWeight: '800' },
  trendBars: { height: 44, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  trendBarSlot: { flex: 1, height: 44, justifyContent: 'flex-end' },
  trendBar: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  trendAxis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisText: { color: palette.muted, fontSize: 8 },
  recentCard: { gap: 10 },
  recentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  sessionStatus: { width: 40, height: 40, borderRadius: 12, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' },
  sessionStatusDone: { backgroundColor: palette.accentDark },
  sessionStatusText: { color: palette.accent, fontSize: 17, fontWeight: '900' },
  recentTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  recentTitle: { color: palette.text, fontSize: 15, fontWeight: '900' },
  manualChip: { color: palette.muted, backgroundColor: palette.surface2, borderRadius: 7, paddingVertical: 3, paddingHorizontal: 5, fontSize: 7, fontWeight: '900', letterSpacing: 0.6 },
  recentMeta: { color: palette.muted, fontSize: 10, marginTop: 4 },
  recentCoverage: { color: palette.accent, fontSize: 10, fontWeight: '800', marginTop: 5 },
  recentSprint: { color: palette.text, fontSize: 10, fontWeight: '800', marginTop: 5 },
  emptyCard: { alignItems: 'center', gap: 7, paddingVertical: 28 },
  emptyTitle: { color: palette.text, fontSize: 15, fontWeight: '900' },
  emptyCopy: { color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 290 },
});
