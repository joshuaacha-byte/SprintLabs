import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Card, Eyebrow, PrimaryButton, SprintLabBrandLockup } from '@/components/sprint-ui';
import { useIntroTarget, useSprintLabIntro } from '@/components/sprintlab-intro-context';
import { Palette, useTheme } from '@/constants/sprintlab';
import { ActiveWorkoutSession, AthleteProfile, CompletedWorkoutSession, PlannedWorkout, ReadinessDecision, ScheduledDay, WeekdayIndex } from '@/types';
import { athleteFirstName, athleteInitial, getAthleteProfile, getTrainingWorkflow } from '@/utils/athlete-profile';
import { evaluateReadiness, readinessLevelMeta, workoutIncludesMaximalSprinting } from '@/utils/readiness';
import { sessionsForDate } from '@/utils/progress';
import { getActiveWorkoutSession, getCompletedWorkoutSessions, getReadiness, getScheduleHistory, getScheduledDay, getScheduledDayForDate, getWeekSchedule, hasSavedWeekSchedule, startWorkoutSession } from '@/utils/storage';
import { getSessionCoverage } from '@/utils/workout-session';
import { consumeSprintLabIntroLaunchRequest } from '@/utils/sprintlab-intro';
import { completeStep, error, tap } from '@/utils/haptics';
import { calculatePlanStreak } from '@/utils/streaks';
import { OPEN_DAY_RESTTITLE } from '@/data/workouts';

const dateKey = (date = new Date()) => date.toLocaleDateString('en-CA');

/** OPEN_DAY_RESTTITLE marks a day SprintLab genuinely has nothing scheduled for — either the
 * deterministic weekly-plan builder (utils/plan-selector.ts) leaving a slot open, or (per
 * utils/storage.ts's getWeekSchedule) every day for a coach-led/logging-only athlete who hasn't
 * added anything yet. Any OTHER rest day (the starter schedule's Sunday, or a day the athlete
 * explicitly marked as rest via Plan) keeps its own restTitle and is treated as planned recovery. */
function isIntentionalRestDay(day: ScheduledDay | null): boolean {
  return day?.kind === 'rest' && day.restTitle !== OPEN_DAY_RESTTITLE;
}

function greetingForHour(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

type NextUp = { date: string; dayLabel: string; workout: PlannedWorkout };

async function findNextScheduledWorkout(now: Date): Promise<NextUp | null> {
  for (let offset = 1; offset <= 6; offset += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + offset);
    const day = await getScheduledDayForDate(dateKey(date));
    if (day.kind === 'workout' && day.workout) {
      const dayLabel = offset === 1 ? 'Tomorrow' : date.toLocaleDateString(undefined, { weekday: 'long' });
      return { date: dateKey(date), dayLabel, workout: day.workout };
    }
  }
  return null;
}

export default function TodayScreen() {
  const router = useRouter();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const now = useMemo(() => new Date(), []);
  const todayIndex = now.getDay() as WeekdayIndex;
  const [scheduledDay, setScheduledDay] = useState<ScheduledDay | null>(null);
  const [readiness, setReadiness] = useState<ReadinessDecision | null>(null);
  const [activeSession, setActiveSession] = useState<ActiveWorkoutSession | null>(null);
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null);
  const [savedSchedule, setSavedSchedule] = useState(true);
  const [completedToday, setCompletedToday] = useState<CompletedWorkoutSession | null>(null);
  // A session exists for today but wasn't marked fully completed (ended early / abandoned) — kept
  // distinct from completedToday so Today never silently presents the day as untouched.
  const [partialToday, setPartialToday] = useState<CompletedWorkoutSession | null>(null);
  const [planStreak, setPlanStreak] = useState(0);
  const [nextUp, setNextUp] = useState<NextUp | null>(null);
  const { start: startIntroTour, registerStartWorkoutAction } = useSprintLabIntro();
  const heroCardTarget = useIntroTarget('today-hero-card');
  const readinessTarget = useIntroTarget('today-readiness');
  // Re-runs on every focus (including the return trip from Workout Mode / Log), so "has today's
  // scheduled workout already been completed?" is answered fresh from the same saved-session
  // records History/Progress/Streaks already trust (utils/progress.ts's sessionsForDate) rather
  // than a separate flag that could drift out of sync with what actually got persisted.
  useFocusEffect(useCallback(() => {
    Promise.all([
      getScheduledDay(todayIndex),
      getReadiness(dateKey()),
      getActiveWorkoutSession(),
      getAthleteProfile(),
      hasSavedWeekSchedule(),
      getCompletedWorkoutSessions(),
      getWeekSchedule(),
      getScheduleHistory(),
      findNextScheduledWorkout(now),
    ]).then(([day, decision, active, profile, saved, sessions, weekSchedule, scheduleHistory, upcoming]) => {
      setScheduledDay(day);
      setReadiness(decision);
      setActiveSession(active);
      setAthlete(profile);
      setSavedSchedule(saved);
      const todaySessions = sessionsForDate(sessions, dateKey());
      const completed = todaySessions.find(session => session.review.completed) ?? null;
      setCompletedToday(completed);
      setPartialToday(completed ? null : todaySessions[0] ?? null);
      // Same calculatePlanStreak used by Progress and the workout-completion celebration —
      // Today never derives its own number, so the three surfaces can't disagree.
      setPlanStreak(calculatePlanStreak(weekSchedule, sessions, new Date(), scheduleHistory));
      setNextUp(upcoming);
    });
  }, [todayIndex, now]));

  // One-shot handoff from app/plan-preview.tsx (first plan ever generated) or the Settings replay
  // entry — consumeSprintLabIntroLaunchRequest atomically clears the flag, so a re-focus (e.g.
  // backing out of a modal) can never re-trigger it.
  useFocusEffect(useCallback(() => {
    void consumeSprintLabIntroLaunchRequest().then(requested => {
      if (requested) startIntroTour();
    });
  }, [startIntroTour]));

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
  // "Full go" reads like an instruction to train — quieter on any day with no training prescribed.
  const readinessLabel = readiness?.status === 'completed' && readinessLevel === 'green' && !workout
    ? 'No readiness concerns'
    : readinessLevel ? readinessLevelMeta[readinessLevel].shortLabel : undefined;
  const startWorkout = async () => {
    if (completedToday) return; // already completed today — never re-create a session through this action
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
  // Lets the intro tour's final reveal trigger this exact function (never a second, parallel
  // "start a workout" implementation) — always the freshest closure, re-registered every render.
  useEffect(() => {
    registerStartWorkoutAction(startWorkout);
    return () => registerStartWorkoutAction(null);
  });
  const primaryLabel = activeSession
    ? `Resume ${workout?.title ?? 'workout'}`
    : readinessBlocksWorkout
      ? 'Modify session before starting'
      : readiness
        ? `Start ${workout?.title ?? 'workout'}`
        : 'Complete check-in to start';

  const isIntentionalRest = isIntentionalRestDay(scheduledDay);
  const athleteName = athleteFirstName(athlete);
  const greeting = athleteName ? `${greetingForHour(now.getHours())}, ${athleteName}` : undefined;

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page}>
    <View style={styles.headerText}>
      {greeting ? <Text style={styles.greeting}>{greeting}</Text> : null}
      <Eyebrow>{now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</Eyebrow>
    </View>
    <View style={styles.brandRow}>
      <SprintLabBrandLockup />
      <View style={styles.topRight}>
        {planStreak > 0 ? <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${planStreak} workout streak${isIntentionalRest ? ', protected today by your planned rest day' : ''}. Open Progress.`}
          onPress={() => { tap(); router.push('/progress'); }}
          style={styles.streakPill}
        >
          <Text style={styles.streakEmoji}>🔥</Text>
          <Text style={styles.streakValue}>{planStreak}</Text>
          {isIntentionalRest ? <MaterialIcons name="shield" size={12} color={palette.muted} style={styles.streakShield} /> : null}
        </Pressable> : null}
        <Pressable accessibilityLabel="Open profile and settings" onPress={() => { tap(); router.push('/settings'); }} style={styles.avatar}><Text style={styles.avatarText}>{athleteInitial(athlete)}</Text></Pressable>
      </View>
    </View>

    {needsPlanSetup ? <Pressable onPress={() => { tap(); router.push('/plan-preview'); }}><Card style={styles.setupCard}>
      <View style={styles.iconCircle}><MaterialIcons name="auto-awesome" size={22} color={palette.accent} /></View>
      <View style={{ flex: 1 }}><Text style={styles.cardTitle}>Finish building your plan</Text><Text style={styles.cardCopy}>The schedule below is a starting example, not your personalized week yet.</Text></View>
      <MaterialIcons name="chevron-right" size={26} color={palette.muted} />
    </Card></Pressable> : null}

    <View ref={readinessTarget} collapsable={false}>
      {!readiness ? <Pressable onPress={() => { tap(); router.push('/readiness'); }}><Card style={styles.emptyReadiness}>
        <View style={styles.iconCircle}><MaterialIcons name="monitor-heart" size={24} color={palette.accent} /></View>
        <View style={{ flex: 1 }}><Text style={styles.cardTitle}>Check in before training</Text><Text style={styles.cardCopy}>Record recovery, focus, and anything affecting today’s training.</Text></View>
        <MaterialIcons name="chevron-right" size={26} color={palette.muted} />
      </Card></Pressable> : <Pressable onPress={() => { tap(); router.push('/readiness'); }}><View style={styles.readinessLine}>
        {readiness.status === 'completed' && readinessLevel ? <View style={[styles.signalDot, { backgroundColor: readinessColor }]} /> : null}
        <Text style={styles.readinessLineText}>{readiness.status === 'skipped' ? 'Check-in skipped' : readinessLabel}{readiness.status === 'completed' && readinessLevel !== 'green' && readinessReasons[0] ? ` — ${readinessReasons[0]}` : ''}</Text>
        <Text style={styles.readinessLineEdit}>{readiness.status === 'skipped' ? 'Complete' : 'Edit'}</Text>
      </View></Pressable>}
    </View>

    {/* PRIMARY: today's scheduled training or recovery state — always the hero, always above the secondary unplanned-workout action. */}
    <View ref={heroCardTarget} collapsable={false}>
    {workout ? <Card style={styles.workoutCard}>
      <View style={styles.cardHead}><View style={{ flex: 1 }}><View style={styles.eyebrowRow}><Eyebrow>Today’s session</Eyebrow>{completedToday ? <View style={styles.completedBadge}><MaterialIcons name="check" size={12} color={palette.success} /><Text style={styles.completedBadgeText}>Completed</Text></View> : partialToday ? <View style={styles.partialBadge}><MaterialIcons name="pause-circle-outline" size={12} color={palette.orange} /><Text style={styles.partialBadgeText}>Ended early</Text></View> : null}</View><Text style={styles.workoutTitle}>{workout.title}</Text><Text style={styles.purposeLine}>{workout.purpose}</Text></View><View style={styles.headActions}>{!completedToday ? <Pressable accessibilityRole="button" accessibilityLabel="Find a substitute for today's session" onPress={() => { tap(); router.push({ pathname: '/library-substitute', params: { date: dateKey() } }); }} style={styles.editButton}><MaterialIcons name="swap-horiz" size={18} color={palette.muted} /></Pressable> : null}<Pressable accessibilityRole="button" accessibilityLabel="Edit today's session" onPress={() => { tap(); router.push({ pathname: '/workout-builder', params: { day: String(todayIndex) } }); }} style={styles.editButton}><MaterialIcons name="edit" size={17} color={palette.muted} /></Pressable></View></View>
      <View style={styles.chips}><Text style={styles.chip}>◷ {workout.durationMinutes} min</Text><Text style={styles.chip}>{exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'}</Text></View>
      <View style={styles.divider} />
      {workout.sections.filter(section => section.exercises.length > 0).map(section => <View key={section.title} style={styles.sectionRow}><Text style={styles.sectionName}>{section.title}</Text><Text style={styles.sectionCount}>{section.exercises.length}</Text></View>)}
      {completedToday ? <Pressable accessibilityRole="button" onPress={() => { tap(); router.push('/history'); }} style={styles.completedRow}>
        <MaterialIcons name="check-circle" size={18} color={palette.success} />
        <Text style={styles.completedRowText}>Workout completed</Text>
        <Text style={styles.completedRowLink}>View in Logbook</Text>
      </Pressable> : <>
        {partialToday ? <Pressable accessibilityRole="button" onPress={() => { tap(); router.push('/history'); }} style={styles.partialRow}>
          <MaterialIcons name="info-outline" size={17} color={palette.orange} />
          <Text style={styles.partialRowText}>Ended early · {getSessionCoverage(partialToday).completed} of {getSessionCoverage(partialToday).planned} completed</Text>
          <Text style={styles.completedRowLink}>View in Logbook</Text>
        </Pressable> : null}
        <PrimaryButton title={primaryLabel} onPress={startWorkout} disabled={exerciseCount === 0 || (!readiness && !activeSession) || Boolean(readinessBlocksWorkout && !activeSession)} />
        {activeSession ? <Text style={styles.startHint}>Continue the workout already in progress.</Text> : !readiness ? <Text style={styles.startHint}>Complete the check-in above, or choose Skip on that screen, to begin.</Text> : readinessBlocksWorkout ? <Text style={[styles.startHint, { color: palette.red }]}>Today’s check-in doesn’t support this maximal sprint prescription. Edit the session or follow coach/medical guidance.</Text> : null}
      </>}
    </Card> : isIntentionalRest ? <Card style={styles.recoveryCard}>
      <View style={styles.iconCircle}><MaterialIcons name="bedtime" size={22} color={palette.accent} /></View>
      <Eyebrow>Today’s schedule</Eyebrow>
      <Text style={styles.openDayTitle}>{scheduledDay?.restTitle || 'Recovery Day'}</Text>
      <Text style={styles.cardCopy}>{nextUp ? `No training is scheduled. Recover today — next up is ${nextUp.dayLabel}’s ${nextUp.workout.title}.` : (scheduledDay?.restNote || 'No training is scheduled. Focus on recovery today.')}</Text>
    </Card> : <Card style={styles.restCard}>
      <Eyebrow>Today’s schedule</Eyebrow>
      <Text style={styles.openDayTitle}>No SprintLab workout planned</Text>
      <Text style={styles.cardCopy}>Coach training, team practice, recovery, or an independent session can still be logged today.</Text>
      <Pressable accessibilityRole="button" onPress={() => { tap(); router.push('/plan'); }} style={styles.planLink}>
        <Text style={styles.planLinkText}>View weekly plan</Text>
        <MaterialIcons name="arrow-forward" size={16} color={palette.muted} />
      </Pressable>
    </Card>}
    </View>

    {/* SECONDARY: unplanned workout — available on every day, never visually competing with the plan above. */}
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Start an unplanned workout"
      onPress={() => { tap(); router.push({ pathname: '/workout-builder', params: { mode: 'unplanned' } }); }}
      style={styles.unplannedAction}
    >
      <View style={styles.unplannedIcon}><MaterialIcons name="add" size={18} color={palette.muted} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.unplannedTitle}>Start an unplanned workout</Text>
        <Text style={styles.unplannedCopy}>Log a coach-assigned, changed, or independent session without altering your weekly plan.</Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color={palette.muted} />
    </Pressable>

    {/* Fills otherwise-empty space on a non-training day with one compact, real preview. */}
    {!workout && nextUp ? <Pressable onPress={() => { tap(); router.push('/plan'); }}><Card style={styles.nextUpCard}>
      <Eyebrow>Next up</Eyebrow>
      <Text style={styles.nextUpTitle}>{nextUp.workout.title}</Text>
      <Text style={styles.nextUpMeta}>{nextUp.dayLabel} · {nextUp.workout.durationMinutes} min</Text>
      <Text style={styles.nextUpCopy} numberOfLines={2}>{nextUp.workout.purpose}</Text>
      <View style={styles.nextUpLink}><Text style={styles.nextUpLinkText}>View workout</Text><MaterialIcons name="arrow-forward" size={15} color={palette.muted} /></View>
    </Card></Pressable> : null}
  </ScrollView></SafeAreaView>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg }, page: { padding: 20, paddingBottom: 36, gap: 18, width: '100%', maxWidth: 820, alignSelf: 'center' },
  headerText: { gap: 4 },
  greeting: { color: palette.text, fontSize: 16, fontWeight: '700' },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  streakPill: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 34, borderRadius: 17, paddingHorizontal: 10, backgroundColor: palette.surface2, borderWidth: 1, borderColor: palette.border },
  streakEmoji: { fontSize: 13 },
  streakValue: { color: palette.text, fontSize: 13, fontWeight: '900' },
  streakShield: { marginLeft: 1 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border }, avatarText: { color: palette.text, fontWeight: '800' },
  emptyReadiness: { flexDirection: 'row', alignItems: 'center', gap: 12, borderStyle: 'dashed', paddingVertical: 12 }, iconCircle: { width: 40, height: 40, borderRadius: 12, backgroundColor: palette.accentDark, alignItems: 'center', justifyContent: 'center' },
  setupCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: palette.accentDark },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }, cardTitle: { color: palette.text, fontSize: 17, fontWeight: '900' }, cardCopy: { color: palette.muted, fontSize: 13, lineHeight: 19 }, headActions: { flexDirection: 'row' }, editButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  completedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: palette.accentDark },
  completedBadgeText: { color: palette.success, fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
  completedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }, completedRowText: { flex: 1, color: palette.text, fontSize: 14, fontWeight: '700' }, completedRowLink: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  partialBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: '#2A1B0C' },
  partialBadgeText: { color: palette.orange, fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
  partialRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, marginBottom: 2 }, partialRowText: { flex: 1, color: palette.text, fontSize: 12, fontWeight: '700' },
  readinessLine: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30 }, signalDot: { width: 8, height: 8, borderRadius: 4 }, readinessLineText: { flex: 1, color: palette.muted, fontSize: 13, fontWeight: '600' }, readinessLineEdit: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  unplannedAction: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 15, borderWidth: 1, borderColor: palette.border, backgroundColor: 'transparent', padding: 12 },
  unplannedIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface2 },
  unplannedTitle: { color: palette.text, fontSize: 13, fontWeight: '800' },
  unplannedCopy: { color: palette.muted, fontSize: 11, lineHeight: 15, marginTop: 2 },
  workoutCard: { gap: 14 }, workoutTitle: { color: palette.text, fontSize: 26, lineHeight: 30, fontWeight: '900', marginTop: 4 }, purposeLine: { color: palette.muted, fontSize: 14, lineHeight: 20, marginTop: 4 }, chips: { flexDirection: 'row', gap: 8 }, chip: { color: palette.muted, backgroundColor: palette.surface2, borderRadius: 20, paddingVertical: 7, paddingHorizontal: 11, fontSize: 12, fontWeight: '700' }, divider: { height: 1, backgroundColor: palette.border },
  recoveryCard: { gap: 6, alignItems: 'flex-start' },
  restCard: { gap: 8 }, openDayTitle: { color: palette.text, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 34 }, sectionName: { color: palette.text, fontSize: 14, fontWeight: '700' }, sectionCount: { color: palette.muted, backgroundColor: palette.surface2, minWidth: 26, textAlign: 'center', paddingVertical: 4, borderRadius: 10, fontSize: 11, fontWeight: '900' },
  planLink: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', minHeight: 44 }, planLinkText: { color: palette.muted, fontWeight: '800', fontSize: 13 }, startHint: { color: palette.muted, fontSize: 11, textAlign: 'center' },
  nextUpCard: { gap: 4 },
  nextUpTitle: { color: palette.text, fontSize: 17, fontWeight: '900', marginTop: 2 },
  nextUpMeta: { color: palette.accent, fontSize: 11, fontWeight: '800' },
  nextUpCopy: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  nextUpLink: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  nextUpLinkText: { color: palette.muted, fontSize: 12, fontWeight: '800' },
});
