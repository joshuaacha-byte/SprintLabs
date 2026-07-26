import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Card, Eyebrow, PrimaryButton, ScreenTitle } from '@/components/sprint-ui';
import { AppFooter } from '@/components/app-footer';
import { palette } from '@/constants/sprintlab';
import { ActiveWorkoutSession, AthleteProfile, ReadinessDecision, ScheduledDay, WeekdayIndex } from '@/types';
import { getAthleteProfile } from '@/utils/athlete-profile';
import { evaluateReadiness, readinessLevelMeta } from '@/utils/readiness';
import { evaluatePrehab } from '@/utils/prehab-engine';
import { getSavedPrehabChoices, recordPrehabChoice } from '@/utils/prehab-storage';
import { deriveSeasonPhase } from '@/utils/season-engine';
import { getActiveWorkoutSession, getReadiness, getScheduledDay, startWorkoutSession } from '@/utils/storage';

const dateKey = () => new Date().toLocaleDateString('en-CA');

export default function TodayScreen() {
  const router = useRouter();
  const todayIndex = new Date().getDay() as WeekdayIndex;
  const [scheduledDay, setScheduledDay] = useState<ScheduledDay | null>(null);
  const [readiness, setReadiness] = useState<ReadinessDecision | null>(null);
  const [activeSession, setActiveSession] = useState<ActiveWorkoutSession | null>(null);
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null);
  const [savedPrehab, setSavedPrehab] = useState<string[]>([]);
  const [dismissedPrehab, setDismissedPrehab] = useState<string[]>([]);
  const [expandedPrehab, setExpandedPrehab] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    Promise.all([getScheduledDay(todayIndex), getReadiness(dateKey()), getActiveWorkoutSession(), getAthleteProfile(), getSavedPrehabChoices()]).then(([day, decision, active, profile, choices]) => {
      setScheduledDay(day);
      setReadiness(decision);
      setActiveSession(active);
      setAthlete(profile);
      const todayChoices = choices.filter(choice => choice.date === dateKey());
      const latestByCard = new Map<string, (typeof todayChoices)[number]>();
      todayChoices.forEach(choice => {
        if (!latestByCard.has(choice.cardId)) latestByCard.set(choice.cardId, choice);
      });
      setSavedPrehab([...latestByCard.values()].filter(choice => choice.action === 'saved').map(choice => choice.cardId));
      setDismissedPrehab([...latestByCard.values()].filter(choice => choice.action === 'dismissed').map(choice => choice.cardId));
    });
  }, [todayIndex]));

  const workout = scheduledDay?.kind === 'workout' ? scheduledDay.workout ?? null : null;
  const exerciseCount = workout?.sections.reduce((sum, section) => sum + section.exercises.length, 0) ?? 0;
  const readinessEvaluation = readiness?.status === 'completed' ? evaluateReadiness(readiness) : null;
  const readinessLevel = readiness?.readinessLevel ?? readinessEvaluation?.level;
  const readinessReasons = readiness?.readinessReasons ?? readinessEvaluation?.reasons ?? [];
  const readinessColor = readinessLevel === 'red' ? palette.red : readinessLevel === 'yellow' ? palette.orange : palette.accent;
  const season = athlete ? deriveSeasonPhase(athlete) : null;
  const prehab = readiness?.status === 'completed' ? evaluatePrehab({
    readiness,
    cautionAreas: athlete?.cautionAreas,
    medicalRestrictions: athlete?.medicalRestrictions,
    coachRestrictions: athlete?.coachRestrictions,
    daysToPriorityMeet: season?.daysToNextAMeet ?? season?.daysToNextMeet,
  }) : null;
  const savePrehab = async (cardId: string) => {
    await recordPrehabChoice(cardId, dateKey(), 'saved');
    setSavedPrehab(current => [...new Set([...current, cardId])]);
  };
  const dismissPrehab = async (cardId: string) => {
    await recordPrehabChoice(cardId, dateKey(), 'dismissed');
    setDismissedPrehab(current => [...new Set([...current, cardId])]);
  };
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
    <View style={styles.top}><View><Eyebrow>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</Eyebrow><Text style={styles.brand}>SPRINTLAB</Text></View><Pressable accessibilityLabel="Open profile and settings" onPress={() => router.push('/settings')} style={styles.avatar}><Text style={styles.avatarText}>{athlete?.name.trim().slice(0, 1).toUpperCase() || 'S'}</Text></Pressable></View>
    <ScreenTitle subtitle="Review your readiness and today’s scheduled session.">Today</ScreenTitle>

    {!readiness ? <Pressable onPress={() => router.push('/readiness')}><Card style={styles.emptyReadiness}>
      <View style={styles.iconCircle}><MaterialIcons name="monitor-heart" size={24} color={palette.accent} /></View>
      <View style={{ flex: 1 }}><Eyebrow>1 · Pre-workout check-in</Eyebrow><Text style={styles.cardTitle}>Complete readiness check-in</Text><Text style={styles.cardCopy}>Record recovery, focus, and any pain or tightness before today’s session.</Text></View>
      <MaterialIcons name="chevron-right" size={26} color={palette.muted} />
    </Card></Pressable> : <Pressable onPress={() => router.push('/readiness')}><Card style={{ ...styles.readyCard, ...(readiness.status === 'completed' ? { borderColor: readinessColor } : {}) }}>
      <View style={styles.cardHead}><View style={{ flex: 1 }}><Eyebrow>1 · Pre-workout check-in</Eyebrow>{readiness.status === 'completed' && readinessLevel ? <View style={styles.signalTitle}><View style={[styles.signalDot, { backgroundColor: readinessColor }]} /><Text style={[styles.signalLabel, { color: readinessColor }]}>{readinessLevelMeta[readinessLevel].label}</Text></View> : null}<Text style={styles.cardTitle}>{readiness.status === 'skipped' ? 'Check-in skipped' : readinessLevel ? readinessLevelMeta[readinessLevel].shortLabel : 'Check-in complete'}</Text></View><Text style={styles.edit}>{readiness.status === 'skipped' ? 'Complete' : 'Edit'}</Text></View>
      {readiness.status === 'completed' ? <><View style={styles.metrics}><View><Text style={styles.metricValue}>{readiness.sleep ?? '—'}h</Text><Text style={styles.metricLabel}>Sleep</Text></View><View><Text style={styles.metricValue}>{readiness.neuralReadiness ?? '—'}/10</Text><Text style={styles.metricLabel}>Explosive</Text></View><View><Text style={styles.metricValue}>{readiness.soreness ?? '—'}/5</Text><Text style={styles.metricLabel}>Soreness</Text></View></View><View style={styles.reasonList}>{readinessReasons.slice(0, 2).map(reason => <View key={reason} style={styles.reasonRow}><Text style={[styles.reasonBullet, { color: readinessColor }]}>•</Text><Text style={styles.reasonText}>{reason}</Text></View>)}</View></> : <Text style={styles.cardCopy}>No readiness details were recorded for today.</Text>}
    </Card></Pressable>}

    {!readiness || readiness.status === 'skipped' ? <Pressable onPress={() => router.push('/readiness')}>
      <Card style={styles.prehabCard}>
        <View style={styles.reminderHeading}>
          <View style={styles.prehabIcon}><MaterialIcons name="health-and-safety" size={21} color={palette.accent} /></View>
          <View style={{ flex: 1 }}>
            <Eyebrow>Recovery & prehab</Eyebrow>
            <Text style={styles.cardTitle}>{readiness?.status === 'skipped' ? 'Check-in details needed' : 'Suggestions follow your check-in'}</Text>
            <Text style={styles.cardCopy}>{readiness?.status === 'skipped'
              ? 'SprintLab will not guess at movement recommendations when readiness was skipped.'
              : 'Complete readiness first. Split will then show optional support—or stop guidance when symptoms make exercise suggestions inappropriate.'}</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={palette.muted} />
        </View>
      </Card>
    </Pressable> : prehab ? <Card style={{ ...styles.prehabCard, ...(prehab.gate === 'stop-refer' ? styles.prehabStop : {}) }}>
      <View style={styles.reminderHeading}><View style={styles.prehabIcon}><MaterialIcons name="health-and-safety" size={21} color={prehab.gate === 'stop-refer' ? palette.red : palette.accent} /></View><View style={{ flex: 1 }}><Eyebrow>Recovery & prehab</Eyebrow><Text style={styles.cardTitle}>{prehab.title}</Text><Text style={styles.cardCopy}>{prehab.explanation}</Text></View></View>
      {prehab.recommendations.filter(card => !dismissedPrehab.includes(card.id)).map(card => <View key={card.id} style={styles.prehabRow}><View style={{ flex: 1 }}><Text style={styles.prehabName}>{card.name} · {card.estimatedMinutes} min</Text><Text style={styles.prehabDetail}>{card.purpose}</Text>{expandedPrehab === card.id ? <><Text style={styles.prehabDetail}>Exercises · {card.exercises.join(' · ')}</Text><Text style={styles.prehabDose}>{card.dosage}</Text><Text style={styles.prehabDetail}>Placement · {card.placement}</Text><Text style={styles.prehabEvidence}>Evidence links · {card.sourceIds.join(', ')}. Why this appeared: {prehab.explanation}</Text></> : null}<View style={styles.prehabActions}><Pressable onPress={() => setExpandedPrehab(current => current === card.id ? null : card.id)}><Text style={styles.prehabActionText}>{expandedPrehab === card.id ? 'Hide' : 'View'}</Text></Pressable><Pressable onPress={() => void savePrehab(card.id)}><Text style={styles.prehabActionText}>{savedPrehab.includes(card.id) ? 'Saved' : 'Save for later'}</Text></Pressable><Pressable onPress={() => void dismissPrehab(card.id)}><Text style={[styles.prehabActionText, { color: palette.muted }]}>Dismiss</Text></Pressable></View></View></View>)}
      {!prehab.recommendations.length ? <Text style={styles.prehabEmpty}>No exercise cards are shown for this check-in. Follow the guidance above.</Text> : null}
      {prehab.gate !== 'stop-refer' ? <Pressable onPress={() => router.push('/readiness')} style={styles.reportSymptoms}><MaterialIcons name="report-problem" size={17} color={palette.orange} /><Text style={styles.reportSymptomsText}>Report symptoms or update check-in</Text></Pressable> : null}
      <Text style={styles.prehabSafety}>{prehab.safetyMessage}</Text>
    </Card> : null}

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
    <AppFooter />
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg }, page: { padding: 20, paddingBottom: 36, gap: 18, width: '100%', maxWidth: 820, alignSelf: 'center' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, brand: { color: palette.text, fontWeight: '900', fontSize: 18, letterSpacing: 1 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border }, avatarText: { color: palette.text, fontWeight: '800' },
  emptyReadiness: { flexDirection: 'row', alignItems: 'center', gap: 13, borderStyle: 'dashed' }, iconCircle: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.accentDark, alignItems: 'center', justifyContent: 'center' },
  readyCard: { gap: 16, borderColor: '#405020' }, cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }, cardTitle: { color: palette.text, fontSize: 17, fontWeight: '900', marginTop: 4 }, cardCopy: { color: palette.muted, fontSize: 13, lineHeight: 19 }, edit: { color: palette.accent, fontSize: 13, fontWeight: '900' }, editButton: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingVertical: 5 },
  signalTitle: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8 }, signalDot: { width: 9, height: 9, borderRadius: 5 }, signalLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  metrics: { flexDirection: 'row', justifyContent: 'space-between' }, metricValue: { color: palette.text, fontSize: 19, fontWeight: '900' }, metricLabel: { color: palette.muted, fontSize: 11, marginTop: 3 },
  reasonList: { gap: 6, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 12 }, reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 }, reasonBullet: { fontSize: 17, lineHeight: 17, fontWeight: '900' }, reasonText: { flex: 1, color: palette.muted, fontSize: 12, lineHeight: 17 },
  workoutCard: { gap: 13 }, workoutTitle: { color: palette.text, fontSize: 23, lineHeight: 28, fontWeight: '900', marginTop: 5 }, chips: { flexDirection: 'row', gap: 8 }, chip: { color: palette.muted, backgroundColor: palette.surface2, borderRadius: 20, paddingVertical: 7, paddingHorizontal: 11, fontSize: 12, fontWeight: '700' }, divider: { height: 1, backgroundColor: palette.border },
  restCard: { gap: 12, borderColor: '#405020' }, restIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.accentDark, alignItems: 'center', justifyContent: 'center' },
  prehabCard: { gap: 13, borderColor: '#36500E' },
  prehabStop: { borderColor: '#54262A' },
  reminderHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  prehabIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface2 },
  prehabRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 11 },
  prehabName: { color: palette.text, fontSize: 13, fontWeight: '900' },
  prehabDetail: { color: palette.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  prehabDose: { color: palette.accent, fontSize: 10, lineHeight: 15, marginTop: 4 },
  prehabActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 9 },
  prehabActionText: { color: palette.accent, fontSize: 10, fontWeight: '900' },
  prehabEvidence: { color: palette.muted, fontSize: 9, lineHeight: 14, marginTop: 5 },
  prehabEmpty: { color: palette.muted, fontSize: 11, lineHeight: 16, paddingTop: 4 },
  reportSymptoms: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, backgroundColor: '#2A1B0C' },
  reportSymptomsText: { color: palette.orange, fontSize: 10, fontWeight: '900' },
  prehabSafety: { color: palette.muted, fontSize: 9, lineHeight: 14, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 10 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 34 }, sectionName: { color: palette.text, fontSize: 14, fontWeight: '700' }, sectionCount: { color: palette.muted, backgroundColor: palette.surface2, minWidth: 26, textAlign: 'center', paddingVertical: 4, borderRadius: 10, fontSize: 11, fontWeight: '900' },
  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 42, borderRadius: 12, backgroundColor: palette.accentDark }, addText: { color: palette.accent, fontWeight: '900', fontSize: 13 }, startBlock: { gap: 9 }, startHint: { color: palette.muted, fontSize: 11, textAlign: 'center' },
});
