import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Card, Eyebrow, ScreenTitle } from '@/components/sprint-ui';
import { useIntroTarget } from '@/components/sprintlab-intro-context';
import { formatTrackConditions } from '@/constants/logging';
import { Palette, useTheme } from '@/constants/sprintlab';
import type { CompletedWorkoutSession, ScheduledDay, TrainingLogSummary } from '@/types';
import {
  buildRecoveryTrend,
  buildSprintSeries,
  buildTrainingVolumeSummary,
  buildWeeklyProgress,
  formatProgressDate,
  RecoveryDay,
  ScheduleHistoryEntry,
  sessionDateKey,
  SprintSeries,
  WeekDayProgress,
} from '@/utils/progress';
import { getCompletedWorkoutSessions, getLogs, getScheduleHistory, getWeekSchedule } from '@/utils/storage';
import { selection, tap } from '@/utils/haptics';
import {
  calculateConsistencyStreak,
  calculateCurrentWeekCompletion,
  calculatePlanConsistency,
  calculatePlanStreak,
  countPlannedWorkoutsCompleted,
} from '@/utils/streaks';
import { buildMilestoneCollection, type Milestone } from '@/utils/milestones';

type PeriodWeeks = 4 | 8 | 12;
type DetailKey = 'performance' | 'training' | 'recovery';

const createStatusMeta = (palette: Palette) => ({
  completed: { label: 'Completed', symbol: '✓', color: palette.accent, background: palette.accentDark },
  partial: { label: 'Partial', symbol: '◐', color: palette.orange, background: '#2A1B0C' },
  missed: { label: 'Missed', symbol: '×', color: palette.red, background: '#301719' },
  rest: { label: 'Rest', symbol: '–', color: palette.muted, background: palette.surface2 },
  today: { label: 'Today', symbol: '•', color: palette.accent, background: palette.surface2 },
  upcoming: { label: 'Future', symbol: '○', color: palette.muted, background: palette.surface2 },
  extra: { label: 'Extra', symbol: '+', color: palette.accent, background: palette.surface2 },
} as const);

const toDateKey = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const periodStartKey = (weeks: PeriodWeeks, now: Date) => {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  start.setDate(start.getDate() - ((weeks * 7) - 1));
  return toDateKey(start);
};

export default function ProgressScreen() {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [logs, setLogs] = useState<TrainingLogSummary[]>([]);
  const [sessions, setSessions] = useState<CompletedWorkoutSession[]>([]);
  const [schedule, setSchedule] = useState<ScheduledDay[]>([]);
  const [scheduleHistory, setScheduleHistory] = useState<ScheduleHistoryEntry[]>([]);
  const [selectedSeriesKey, setSelectedSeriesKey] = useState<string>();
  const [periodWeeks, setPeriodWeeks] = useState<PeriodWeeks>(4);
  const [expanded, setExpanded] = useState<Record<DetailKey, boolean>>({
    performance: false,
    training: false,
    recovery: false,
  });
  const now = useMemo(() => new Date(), []);
  const progressIntroTarget = useIntroTarget('progress-hero');

  useFocusEffect(useCallback(() => {
    Promise.all([getLogs(), getCompletedWorkoutSessions(), getWeekSchedule(), getScheduleHistory()])
      .then(([savedLogs, completedSessions, savedSchedule, history]) => {
        setLogs(savedLogs);
        setSessions(completedSessions);
        setSchedule(savedSchedule);
        setScheduleHistory(history);
      });
  }, []));

  const weekly = useMemo(
    () => buildWeeklyProgress(schedule, sessions, now, scheduleHistory),
    [now, schedule, scheduleHistory, sessions],
  );
  const planStreak = useMemo(
    () => calculatePlanStreak(schedule, sessions, now, scheduleHistory),
    [now, schedule, scheduleHistory, sessions],
  );
  const consistencyStreak = useMemo(
    () => calculateConsistencyStreak(schedule, sessions, now, scheduleHistory),
    [now, schedule, scheduleHistory, sessions],
  );
  const trainingCount = useMemo(
    () => countPlannedWorkoutsCompleted(schedule, sessions, scheduleHistory),
    [schedule, scheduleHistory, sessions],
  );
  const planConsistency30d = useMemo(
    () => calculatePlanConsistency(schedule, sessions, now, 30, scheduleHistory),
    [now, schedule, scheduleHistory, sessions],
  );
  const currentWeekCompletion = useMemo(
    () => calculateCurrentWeekCompletion(schedule, sessions, now, scheduleHistory),
    [now, schedule, scheduleHistory, sessions],
  );
  const cutoff = useMemo(() => periodStartKey(periodWeeks, now), [now, periodWeeks]);
  const periodSessions = useMemo(
    () => sessions.filter(session => sessionDateKey(session) >= cutoff),
    [cutoff, sessions],
  );
  const sprintSeries = useMemo(() => buildSprintSeries(periodSessions), [periodSessions]);
  // Milestones read from the athlete's whole history, not the period selector above — unlocking
  // "100 SESSIONS" shouldn't flicker back to locked just because the athlete switched to a 4-week view.
  const allTimeSprintSeries = useMemo(() => buildSprintSeries(sessions), [sessions]);
  const milestones = useMemo(
    () => buildMilestoneCollection({ trainingCount, consistencyStreak, currentWeek: currentWeekCompletion, sprintSeries: allTimeSprintSeries }),
    [trainingCount, consistencyStreak, currentWeekCompletion, allTimeSprintSeries],
  );
  const unlockedMilestoneCount = useMemo(() => milestones.filter(milestone => milestone.unlocked).length, [milestones]);
  const recovery = useMemo(() => buildRecoveryTrend(logs), [logs]);
  const periodVolume = useMemo(
    () => buildTrainingVolumeSummary(periodSessions, now),
    [now, periodSessions],
  );
  const strengthSessions = useMemo(() => periodSessions.filter(session =>
    session.actualResults.some(result =>
      result.trackingKind === 'strength'
      && (result.status === 'completed' || result.strengthSets?.some(set => set.status === 'completed')),
    ),
  ).length, [periodSessions]);

  useEffect(() => {
    if (!sprintSeries.length) {
      setSelectedSeriesKey(undefined);
      return;
    }
    if (!selectedSeriesKey || !sprintSeries.some(series => series.key === selectedSeriesKey)) {
      const strongest = sprintSeries.find(series => series.points.length >= 2) ?? sprintSeries[0];
      setSelectedSeriesKey(strongest.key);
    }
  }, [selectedSeriesKey, sprintSeries]);

  const selectedSeries = sprintSeries.find(series => series.key === selectedSeriesKey);
  const performanceChange = useMemo(
    () => selectedSeries && selectedSeries.points.length >= 2
      ? describePerformanceChange(selectedSeries)
      : undefined,
    [selectedSeries],
  );
  const hasRecoveryData = recovery.days.some(day =>
    day.sleep !== undefined || day.rpe !== undefined || day.soreness !== undefined,
  );
  const isNewAthlete = sessions.length === 0 && logs.length === 0;

  const toggleDetail = (key: DetailKey) => {
    tap();
    setExpanded(current => ({ ...current, [key]: !current[key] }));
  };

  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.page}>
      <Eyebrow>Training change over time</Eyebrow>
      <ScreenTitle subtitle="See whether your training, performance, and recovery are changing.">Progress</ScreenTitle>

      {/* The intro tour's Progress moment spotlights this exact region — whichever real card
          actually renders here (the new-athlete card or the live summary/milestones), never a
          recreated copy of it. */}
      <View ref={progressIntroTarget} collapsable={false}>
        {isNewAthlete ? <Card style={styles.onboardingCard}>
          <View style={styles.onboardingIcon}>
            <MaterialIcons name="insights" size={28} color={palette.accent} />
          </View>
          <Text style={styles.onboardingTitle}>Your trends will build here</Text>
          <Text style={styles.onboardingCopy}>Complete and log sessions to begin building your trends.</Text>
        </Card> : <>
          <SectionTitle eyebrow="Right now" title="Your Progress" />
          <Card style={styles.progressSummaryCard}>
            <View style={styles.streakHeadline}>
              <Text style={styles.streakHeadlineEmoji}>🔥</Text>
              <Text style={styles.streakHeadlineValue}>{planStreak}</Text>
              <Text style={styles.streakHeadlineLabel}>session streak</Text>
            </View>
            <View style={styles.progressStatsRow}>
              <ProgressStat value={`${trainingCount}`} label="workouts completed" />
              <ProgressStat value={planConsistency30d.required ? `${planConsistency30d.percentage}%` : '—'} label="plan consistency" />
              <ProgressStat value={`${unlockedMilestoneCount}`} label={unlockedMilestoneCount === 1 ? 'milestone unlocked' : 'milestones unlocked'} />
            </View>
            {performanceChange ? <View style={styles.changeRow}>
              <MaterialIcons name="trending-up" size={19} color={palette.accent} />
              <Text style={styles.changeText}>{performanceChange}</Text>
            </View> : null}
          </Card>

          <SectionTitle eyebrow="Milestones" title="Achievements" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.milestoneRow}>
            {milestones.map(milestone => <MilestoneCard key={milestone.id} milestone={milestone} />)}
          </ScrollView>
        </>}
      </View>

      {!isNewAthlete ? <>
        <SectionTitle eyebrow="Performance" title="Timed sprint trends" />
        {sprintSeries.length ? <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seriesTabs}>
            {sprintSeries.map(series => <Pressable
              key={series.key}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedSeriesKey === series.key }}
              onPress={() => { if (selectedSeriesKey !== series.key) selection(); setSelectedSeriesKey(series.key); }}
              style={[styles.seriesTab, selectedSeriesKey === series.key && styles.seriesTabActive]}>
              <Text style={[styles.seriesTabText, selectedSeriesKey === series.key && styles.seriesTabTextActive]}>{series.label}</Text>
            </Pressable>)}
          </ScrollView>
          {selectedSeries && selectedSeries.points.length >= 2
            ? <SprintHistory series={selectedSeries} expanded={expanded.performance} onToggle={() => toggleDetail('performance')} />
            : <EmptyCard
              icon="speed"
              title="No performance trend yet"
              copy="Record timed reps across multiple sessions to see changes."
            />}
        </> : <EmptyCard
          icon="speed"
          title="No performance trend yet"
          copy="Record timed reps across multiple sessions to see changes."
        />}

        <SectionTitle eyebrow="Training" title="Work completed" />
        <PeriodSelector value={periodWeeks} onChange={setPeriodWeeks} />
        <Card style={styles.trainingCard}>
          <View style={styles.metricGrid}>
            <SummaryMetric value={`${weekly.percentage}%`} label="Weekly completion" />
            <SummaryMetric value={`${periodVolume.completedSprintMeters.toLocaleString()}m`} label="Speed volume" />
            <SummaryMetric value={`${periodVolume.highIntensityMeters.toLocaleString()}m`} label="High intensity" />
            <SummaryMetric value={`${strengthSessions}`} label="Strength sessions" />
          </View>
          <View style={styles.weekDivider} />
          <View style={styles.weekDays}>{weekly.days.map(day => <WeekDay key={day.date} day={day} />)}</View>
          <WeekLegend />
          <Text style={styles.caption}>Future sessions and rest days do not count as missed work.</Text>
          <DisclosureButton
            open={expanded.training}
            openLabel="Hide training details"
            closedLabel="How these totals are counted"
            onPress={() => toggleDetail('training')}
          />
          {expanded.training ? <View style={styles.detailNote}>
            <Text style={styles.detailCopy}>Speed and high-intensity volume count only completed reps with recorded distance. Strength counts sessions with at least one completed strength exercise. Missing values are never guessed.</Text>
          </View> : null}
        </Card>

        <SectionTitle eyebrow="Recovery" title="Readiness patterns" />
        {hasRecoveryData ? <Card style={styles.recoveryCard}>
          <View style={styles.metricGrid}>
            <RecoveryMetric label="Sleep" value={recovery.latest.sleep} suffix="h" />
            <RecoveryMetric label="Session RPE" value={recovery.latest.rpe} suffix="/10" />
            <RecoveryMetric label="Soreness" value={recovery.latest.soreness} suffix="/10" />
          </View>
          <DisclosureButton
            open={expanded.recovery}
            openLabel="Hide recovery trends"
            closedLabel="View recovery trends"
            onPress={() => toggleDetail('recovery')}
          />
          {expanded.recovery ? <View style={styles.trendsWrap}>
            <TrendRow label="Sleep" suffix="h" max={12} values={recovery.days} dataKey="sleep" latest={recovery.latest.sleep} average={recovery.averages.sleep} color="#63C7FF" />
            <TrendRow label="Session RPE" suffix="/10" max={10} values={recovery.days} dataKey="rpe" latest={recovery.latest.rpe} average={recovery.averages.rpe} color={palette.orange} />
            <TrendRow label="General soreness" suffix="/10" max={10} values={recovery.days} dataKey="soreness" latest={recovery.latest.soreness} average={recovery.averages.soreness} color={palette.red} />
          </View> : null}
        </Card> : <EmptyCard
          icon="favorite-border"
          title="No recovery trend yet"
          copy="Readiness check-ins will build your sleep, effort, and soreness trends."
        />}
      </> : null}
    </ScrollView>
  </SafeAreaView>;
}

function describePerformanceChange(series: SprintSeries) {
  const first = series.points[0];
  const latest = series.points[series.points.length - 1];
  const difference = latest.timeSeconds - first.timeSeconds;
  if (Math.abs(difference) < 0.005) return `${series.label} is stable across this period.`;
  return `${series.label}: your latest result is ${Math.abs(difference).toFixed(2)}s ${difference < 0 ? 'faster' : 'slower'} than your first result in this period.`;
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <View style={styles.sectionHead}>
    <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
    <Text style={styles.sectionTitle}>{title}</Text>
  </View>;
}

function SummaryMetric({ value, label }: { value: string; label: string }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <View style={styles.summaryMetric}>
    <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    <Text style={styles.summaryLabel}>{label}</Text>
  </View>;
}

function RecoveryMetric({ label, value, suffix }: { label: string; value?: number; suffix: string }) {
  return <SummaryMetric value={value === undefined ? '—' : `${value.toFixed(1)}${suffix}`} label={`Latest ${label.toLowerCase()}`} />;
}

function PeriodSelector({ value, onChange }: { value: PeriodWeeks; onChange: (value: PeriodWeeks) => void }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <View style={styles.periodSelector}>
    {([4, 8, 12] as PeriodWeeks[]).map(period => <Pressable
      key={period}
      accessibilityRole="button"
      accessibilityState={{ selected: value === period }}
      onPress={() => { if (value !== period) selection(); onChange(period); }}
      style={[styles.periodChip, value === period && styles.periodChipActive]}>
      <Text style={[styles.periodText, value === period && styles.periodTextActive]}>{period} weeks</Text>
    </Pressable>)}
  </View>;
}

function WeekDay({ day }: { day: WeekDayProgress }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const statusMeta = useMemo(() => createStatusMeta(palette), [palette]);
  const meta = statusMeta[day.status];
  return <View style={styles.dayWrap} accessibilityLabel={`${day.shortLabel}, ${meta.label}`}>
    <View style={[styles.dayDot, {
      backgroundColor: meta.background,
      borderColor: day.status === 'today' ? palette.accent : palette.border,
    }]}>
      <Text style={[styles.daySymbol, { color: meta.color }]}>{meta.symbol}</Text>
    </View>
    <Text style={styles.dayLabel}>{day.shortLabel}</Text>
  </View>;
}

function WeekLegend() {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const statusMeta = useMemo(() => createStatusMeta(palette), [palette]);
  return <View style={styles.weekLegend}>
    {(['completed', 'partial', 'missed', 'rest', 'upcoming'] as const).map(status => <View key={status} style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: statusMeta[status].color }]} />
      <Text style={styles.legendText}>{statusMeta[status].label}</Text>
    </View>)}
  </View>;
}

function DisclosureButton({ open, openLabel, closedLabel, onPress }: {
  open: boolean;
  openLabel: string;
  closedLabel: string;
  onPress: () => void;
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onPress} style={styles.disclosure}>
    <Text style={styles.disclosureText}>{open ? openLabel : closedLabel}</Text>
    <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={21} color={palette.accent} />
  </Pressable>;
}

function SprintHistory({ series, expanded, onToggle }: { series: SprintSeries; expanded: boolean; onToggle: () => void }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const chartPoints = series.points.slice(-6);
  const values = chartPoints.map(point => point.timeSeconds);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return <Card style={styles.sprintCard}>
    <View style={styles.metricGrid}>
      <SummaryMetric value={`${series.best.timeSeconds}s`} label="Best" />
      <SummaryMetric value={`${series.latest.timeSeconds}s`} label="Latest" />
      <SummaryMetric value={`${series.points.length}`} label="Comparable results" />
    </View>
    <View style={styles.chart}>
      {chartPoints.map(point => {
        const height = min === max ? 52 : 30 + ((max - point.timeSeconds) / (max - min)) * 46;
        const best = point.id === series.best.id;
        return <View key={point.id} style={styles.chartPoint}>
          <Text style={[styles.chartValue, best && { color: palette.accent }]}>{point.timeSeconds}</Text>
          <View style={[styles.chartBar, { height, backgroundColor: best ? palette.accent : palette.border }]} />
          <Text style={styles.chartDate}>{formatProgressDate(point.date, { month: 'numeric', day: 'numeric' })}</Text>
        </View>;
      })}
    </View>
    <Text style={styles.caption}>Higher bars indicate faster session-best times.</Text>
    <DisclosureButton
      open={expanded}
      openLabel="Hide timed results"
      closedLabel="View timed results"
      onPress={onToggle}
    />
    {expanded ? <View style={styles.resultList}>
      {[...series.points].reverse().slice(0, 6).map(point => <View key={point.id} style={styles.resultRow}>
        <View>
          <Text style={styles.resultTime}>{point.timeSeconds}s</Text>
          <Text style={styles.resultDate}>{formatProgressDate(point.date, { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
        </View>
        <View style={styles.resultMeta}>
          <Text style={styles.resultConditions}>{formatTrackConditions(point.conditions)}</Text>
          {point.feeling ? <Text style={styles.resultFeeling}>{point.feeling.charAt(0).toUpperCase() + point.feeling.slice(1)}</Text> : null}
        </View>
      </View>)}
    </View> : null}
  </Card>;
}

function TrendRow({ label, suffix, max, values, dataKey, latest, average, color }: {
  label: string;
  suffix: string;
  max: number;
  values: RecoveryDay[];
  dataKey: 'sleep' | 'rpe' | 'soreness';
  latest?: number;
  average?: number;
  color: string;
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const format = (value?: number) => value === undefined ? '—' : `${value.toFixed(1)}${suffix}`;
  return <View style={styles.trendRow}>
    <View style={styles.trendHead}>
      <Text style={styles.trendLabel}>{label}</Text>
      <View style={styles.trendNumbers}>
        <Text style={[styles.trendLatest, { color }]}>Latest {format(latest)}</Text>
        <Text style={styles.trendAverage}>Avg {format(average)}</Text>
      </View>
    </View>
    <View style={styles.trendBars}>{values.map(day => {
      const value = day[dataKey];
      const height = value === undefined ? 3 : Math.max(5, Math.min(42, (value / max) * 42));
      return <View key={day.date} style={styles.trendBarSlot}>
        <View style={[styles.trendBar, {
          height,
          backgroundColor: value === undefined ? palette.surface2 : color,
          opacity: value === undefined ? 0.6 : 1,
        }]} />
      </View>;
    })}</View>
    <View style={styles.trendAxis}><Text style={styles.axisText}>14 days ago</Text><Text style={styles.axisText}>Today</Text></View>
  </View>;
}

function ProgressStat({ value, label }: { value: string; label: string }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <View style={styles.progressStat}>
    <Text style={styles.progressStatValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    <Text style={styles.progressStatLabel}>{label}</Text>
  </View>;
}

/** A locked card always shows the same plain lock glyph — the milestone's own icon (bolt,
 * trending-up, etc.) is reserved for the unlocked state, so unlocking one visibly reveals
 * something distinct rather than just recoloring the same icon. */
function MilestoneCard({ milestone }: { milestone: Milestone }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const locked = !milestone.unlocked;
  const progressPercent = milestone.progress ? Math.min(100, Math.round((milestone.progress.current / milestone.progress.target) * 100)) : 0;
  return <View style={[styles.milestoneCard, locked && styles.milestoneCardLocked]}>
    <View style={[styles.milestoneIcon, !locked && styles.milestoneIconUnlocked]}>
      <MaterialIcons name={locked ? 'lock-outline' : (milestone.icon as keyof typeof MaterialIcons.glyphMap)} size={20} color={locked ? palette.muted : palette.accent} />
    </View>
    <Text style={[styles.milestoneTitle, locked && styles.milestoneTitleLocked]}>{milestone.title}</Text>
    <Text style={styles.milestoneDescription} numberOfLines={2}>{milestone.description}</Text>
    <View style={styles.milestoneFooter}>
      {milestone.progress ? (
        milestone.unlocked
          ? <Text style={styles.milestoneUnlockedText}>Unlocked</Text>
          : <>
            <View style={styles.milestoneTrack}><View style={[styles.milestoneFill, { width: `${progressPercent}%` }]} /></View>
            <Text style={styles.milestoneProgressText}>{milestone.progress.current.toLocaleString()} / {milestone.progress.target.toLocaleString()}</Text>
          </>
      ) : <Text style={locked ? styles.milestoneLockedText : styles.milestoneUnlockedText}>{locked ? 'Locked' : 'Unlocked'}</Text>}
    </View>
  </View>;
}

function EmptyCard({ icon, title, copy }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; copy: string }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <Card style={styles.emptyCard}>
    <MaterialIcons name={icon} size={25} color={palette.muted} />
    <View style={styles.emptyText}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyCopy}>{copy}</Text>
    </View>
  </Card>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  page: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 20, paddingBottom: 42, gap: 14 },
  onboardingCard: { alignItems: 'center', gap: 8, paddingVertical: 30 },
  onboardingIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentDark },
  onboardingTitle: { color: palette.text, fontSize: 18, fontWeight: '900', marginTop: 3 },
  onboardingCopy: { color: palette.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 330 },
  sectionHead: { gap: 3, marginTop: 8 },
  sectionEyebrow: { color: palette.accent, fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1.7, textTransform: 'uppercase' },
  sectionTitle: { color: palette.text, fontSize: 21, lineHeight: 27, fontWeight: '900' },
  progressSummaryCard: { gap: 16 },
  streakHeadline: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  streakHeadlineEmoji: { fontSize: 22 },
  streakHeadlineValue: { color: palette.text, fontSize: 32, lineHeight: 36, fontWeight: '900' },
  streakHeadlineLabel: { color: palette.muted, fontSize: 13, fontWeight: '700' },
  progressStatsRow: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 14 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryMetric: { flexGrow: 1, flexBasis: 130, minHeight: 72, borderRadius: 14, backgroundColor: palette.surface2, padding: 11, justifyContent: 'center' },
  summaryValue: { color: palette.text, fontSize: 21, lineHeight: 26, fontWeight: '900' },
  summaryLabel: { color: palette.muted, fontSize: 9, lineHeight: 13, fontWeight: '700', marginTop: 3 },
  changeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 12 },
  changeText: { flex: 1, color: palette.text, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  seriesTabs: { gap: 7, paddingRight: 20 },
  seriesTab: { minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, justifyContent: 'center', paddingHorizontal: 13 },
  seriesTabActive: { borderColor: palette.accent, backgroundColor: palette.accentDark },
  seriesTabText: { color: palette.muted, fontSize: 11, fontWeight: '800' },
  seriesTabTextActive: { color: palette.accent },
  sprintCard: { gap: 14 },
  chart: { height: 116, flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderBottomWidth: 1, borderBottomColor: palette.border, paddingBottom: 22 },
  chartPoint: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 92 },
  chartValue: { color: palette.muted, fontSize: 8, fontWeight: '800', marginBottom: 4 },
  chartBar: { width: '68%', minWidth: 15, maxWidth: 34, borderTopLeftRadius: 7, borderTopRightRadius: 7 },
  chartDate: { position: 'absolute', bottom: -17, color: palette.muted, fontSize: 8 },
  caption: { color: palette.muted, fontSize: 9, lineHeight: 14, textAlign: 'center' },
  disclosure: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 10 },
  disclosureText: { color: palette.accent, fontSize: 11, fontWeight: '900' },
  resultList: { borderTopWidth: 1, borderTopColor: palette.border },
  resultRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderBottomColor: palette.border },
  resultTime: { color: palette.text, fontSize: 14, fontWeight: '900' },
  resultDate: { color: palette.muted, fontSize: 9, marginTop: 2 },
  resultMeta: { flex: 1, alignItems: 'flex-end' },
  resultConditions: { color: palette.text, fontSize: 10, fontWeight: '800', textAlign: 'right' },
  resultFeeling: { color: palette.accent, fontSize: 9, marginTop: 3 },
  periodSelector: { flexDirection: 'row', gap: 7 },
  periodChip: { minHeight: 39, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  periodChipActive: { borderColor: palette.accent, backgroundColor: palette.accentDark },
  periodText: { color: palette.muted, fontSize: 11, fontWeight: '800' },
  periodTextActive: { color: palette.accent },
  trainingCard: { gap: 13 },
  weekDivider: { height: 1, backgroundColor: palette.border },
  weekDays: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  dayWrap: { flex: 1, minWidth: 0, alignItems: 'center', gap: 5 },
  dayDot: { width: 31, height: 31, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  daySymbol: { fontSize: 14, fontWeight: '900' },
  dayLabel: { color: palette.text, fontSize: 10, fontWeight: '900' },
  weekLegend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { color: palette.muted, fontSize: 8, fontWeight: '800' },
  detailNote: { borderRadius: 12, backgroundColor: palette.surface2, padding: 11 },
  detailCopy: { color: palette.muted, fontSize: 10, lineHeight: 16 },
  recoveryCard: { gap: 13 },
  trendsWrap: { borderTopWidth: 1, borderTopColor: palette.border },
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
  progressStat: { flex: 1, gap: 3 },
  progressStatValue: { color: palette.text, fontSize: 17, lineHeight: 21, fontWeight: '900' },
  progressStatLabel: { color: palette.muted, fontSize: 9, lineHeight: 13, fontWeight: '700' },
  milestoneRow: { gap: 10, paddingRight: 20 },
  milestoneCard: { width: 168, minHeight: 168, borderRadius: 16, borderWidth: 1, borderColor: palette.accentDark, backgroundColor: palette.surface, padding: 13, gap: 6, justifyContent: 'space-between' },
  milestoneCardLocked: { borderColor: palette.border },
  milestoneIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' },
  milestoneIconUnlocked: { backgroundColor: palette.accentDark },
  milestoneTitle: { color: palette.text, fontSize: 13, fontWeight: '900', letterSpacing: 0.3, marginTop: 2 },
  milestoneTitleLocked: { color: palette.muted },
  milestoneDescription: { color: palette.muted, fontSize: 11, lineHeight: 15, flexGrow: 1 },
  milestoneFooter: { gap: 5 },
  milestoneTrack: { height: 5, borderRadius: 3, backgroundColor: palette.surface2, overflow: 'hidden' },
  milestoneFill: { height: 5, borderRadius: 3, backgroundColor: palette.accent },
  milestoneProgressText: { color: palette.muted, fontSize: 10, fontWeight: '800' },
  milestoneUnlockedText: { color: palette.accent, fontSize: 10, fontWeight: '900', letterSpacing: 0.4, textTransform: 'uppercase' },
  milestoneLockedText: { color: palette.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  emptyCard: { minHeight: 94, flexDirection: 'row', alignItems: 'center', gap: 12 },
  emptyText: { flex: 1, gap: 3 },
  emptyTitle: { color: palette.text, fontSize: 14, fontWeight: '900' },
  emptyCopy: { color: palette.muted, fontSize: 11, lineHeight: 17 },
});
