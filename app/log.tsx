import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Card, PrimaryButton } from '@/components/sprint-ui';
import { changeReasonLabels, repFeelingOptions } from '@/constants/logging';
import { Palette, useTheme } from '@/constants/sprintlab';
import { ActiveWorkoutSession, AthleteProfile, PostWorkoutReview } from '@/types';
import { getAthleteProfile } from '@/utils/athlete-profile';
import { buildManualTrainingLog, buildStructuredTrainingLog } from '@/utils/domain-adapters';
import { evaluatePrehab } from '@/utils/prehab-engine';
import { deriveSeasonPhase } from '@/utils/season-engine';
import { addCompletedWorkoutSession, addLog, addTrainingLog, clearActiveWorkoutSession, getActiveWorkoutSession, getCompletedWorkoutSessions, getReadiness, getScheduleHistory, getWeekSchedule } from '@/utils/storage';
import { findPlannedExercise, getSessionCoverage, withDerivedStatuses } from '@/utils/workout-session';
import { error, selection, success, tap } from '@/utils/haptics';
import { getWorkoutCompletionCelebrationState } from '@/utils/streaks';
import { WorkoutCompletionCelebration, type CelebrationPayload } from '@/components/workout-completion-celebration';

const dateKey = () => new Date().toLocaleDateString('en-CA');
const formatMinutes = (seconds: number) => `${Math.max(1, Math.round(seconds / 60))} min`;

function Scale({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <View style={styles.scale}>{Array.from({ length: max }, (_, index) => index + 1).map(number => <Pressable key={number} onPress={() => { if (value !== number) { selection(); onChange(number); } }} style={[styles.scaleItem, value === number && styles.scaleActive]}><Text style={[styles.scaleText, value === number && styles.scaleTextActive]}>{number}</Text></Pressable>)}</View>;
}

export default function LogScreen() {
  const router = useRouter();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [completed, setCompleted] = useState(false);
  const [rpe, setRpe] = useState(7);
  const [energy, setEnergy] = useState(4);
  const [sleep, setSleep] = useState('');
  const [hamstring, setHamstring] = useState(0);
  const [soreness, setSoreness] = useState(0);
  const [notes, setNotes] = useState('');
  const [session, setSession] = useState<ActiveWorkoutSession | null>(null);
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null);
  const [expandedRecovery, setExpandedRecovery] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [exercisesOpen, setExercisesOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [readinessCompleted, setReadinessCompleted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  // Stable across repeated save() calls (e.g. a double-tap on Finish) so storage-layer dedup can catch it.
  const logIdRef = useRef(Date.now().toString());
  const [celebration, setCelebration] = useState<CelebrationPayload | null>(null);
  const [savedLogId, setSavedLogId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(useCallback(() => {
    Promise.all([getActiveWorkoutSession(), getReadiness(dateKey()), getAthleteProfile()]).then(([active, decision, profile]) => {
      setSession(active);
      setAthlete(profile);
      if (active) {
        const coverage = getSessionCoverage(active);
        setCompleted(coverage.planned > 0 && coverage.completed === coverage.planned);
      } else {
        setCompleted(true);
      }
      if (decision?.status === 'completed') {
        setReadinessCompleted(true);
        setSleep(decision.sleep ? String(decision.sleep) : '');
        setEnergy(decision.energy ?? 4);
        setHamstring(decision.hamstring ?? 0);
        setSoreness(decision.soreness ?? 0);
      } else {
        setReadinessCompleted(false);
      }
      setSaved(false);
    });
  }, []));

  const coverage = useMemo(() => session ? getSessionCoverage(session) : null, [session]);
  const bestSprintTime = useMemo(() => session?.actualResults.flatMap(result => result.trackReps ?? []).map(rep => rep.timeSeconds).filter((value): value is number => value !== undefined).sort((a, b) => a - b)[0], [session]);
  const postSessionRecovery = useMemo(() => {
    if (!session) return null;
    const season = athlete ? deriveSeasonPhase(athlete) : null;
    const sessionCategory = session.plannedWorkoutSnapshot.category;
    return evaluatePrehab({
      readiness: session.readinessSnapshot,
      cautionAreas: athlete?.cautionAreas,
      medicalRestrictions: athlete?.medicalRestrictions,
      coachRestrictions: athlete?.coachRestrictions,
      sessionCategory,
      daysToPriorityMeet: season?.daysToNextAMeet ?? season?.daysToNextMeet,
    });
  }, [athlete, session]);

  const save = async () => {
    setSaving(true);
    try {
      const review: PostWorkoutReview = {
        completed,
        rpe,
        energy,
        sleep: Number(sleep) || 0,
        hamstring,
        soreness,
        notes,
      };
      const logId = logIdRef.current;
      if (session && coverage) {
        const [schedule, scheduleHistory, priorSessions] = await Promise.all([
          getWeekSchedule(),
          getScheduleHistory(),
          getCompletedWorkoutSessions(),
        ]);
        const finishedAt = new Date().toISOString();
        const finalSession = withDerivedStatuses(session);
        const finalized = {
          ...finalSession,
          finishedAt,
          review,
          structuredLog: buildStructuredTrainingLog(finalSession, review, finishedAt),
        };
        await addCompletedWorkoutSession(finalized);
        await addTrainingLog(finalized.structuredLog);
        await addLog({
          id: logId,
          sessionId: finalized.id,
          date: finalized.finishedAt,
          completed,
          rpe,
          energy,
          sleep: review.sleep,
          hamstring,
          soreness,
          sprintTime: bestSprintTime,
          bodyWeight: review.bodyWeight,
          notes,
          workoutTitle: finalized.plannedWorkoutSnapshot.title,
          exercisesCompleted: coverage.completed,
          exercisesPlanned: coverage.planned,
        });
        await clearActiveWorkoutSession();
        const state = getWorkoutCompletionCelebrationState(schedule, scheduleHistory, priorSessions, finalized, new Date());
        setSaved(true);
        setSavedLogId(finalized.structuredLog.id);
        setCelebration({ kind: state.kind, planStreak: state.planStreak, consistencyStreak: state.consistencyStreak, week: state.week });
      } else {
        const finishedAt = new Date().toISOString();
        const structuredLog = buildManualTrainingLog(review, finishedAt, undefined, logId);
        await addTrainingLog(structuredLog);
        await addLog({ id: logId, sessionId: logId, date: finishedAt, completed, rpe, energy, sleep: review.sleep, hamstring, soreness, bodyWeight: review.bodyWeight, notes, workoutTitle: 'Unplanned session' });
        setSaved(true);
        setSavedLogId(structuredLog.id);
        setCelebration({ kind: 'one-off' });
      }
      success();
    } catch {
      error();
      Alert.alert('Could not save workout', 'Your workout is still here. Please try saving it again.');
    } finally {
      setSaving(false);
    }
  };

  return <SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.shell}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <View style={styles.headerRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => { tap(); router.back(); }} style={styles.back}><MaterialIcons name="arrow-back" size={22} color={palette.text} /></Pressable>
            <Text style={styles.headerTitle}>{session ? 'Finish workout' : 'Log session'}</Text>
            <View style={styles.headerBalance} />
          </View>

          {session && coverage ? <>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryEyebrow}>Workout summary</Text>
              <Text style={styles.summaryTitle}>{session.plannedWorkoutSnapshot.title}</Text>
              <Text style={styles.summaryDetail}>{coverage.completed} of {coverage.planned} exercises completed · {formatMinutes(session.elapsedSeconds)}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: exercisesOpen }}
                onPress={() => { tap(); setExercisesOpen(current => !current); }}
                style={styles.quietAction}
              >
                <Text style={styles.quietActionText}>{exercisesOpen ? 'Hide exercise review' : 'Review exercises'}</Text>
                <MaterialIcons name={exercisesOpen ? 'expand-less' : 'chevron-right'} size={20} color={palette.muted} />
              </Pressable>
            </Card>

            {exercisesOpen ? <Card style={styles.resultsCard}>{session.actualResults.map(result => {
              const exercise = findPlannedExercise(session, result.exerciseId);
              if (!exercise) return null;
              const doneUnits = (result.trackReps ?? result.strengthSets)?.filter(unit => unit.status === 'completed').length;
              const totalUnits = (result.trackReps ?? result.strengthSets)?.length;
              const fastest = result.trackReps?.map(rep => rep.timeSeconds).filter((value): value is number => value !== undefined).sort((a, b) => a - b)[0];
              const topLoad = result.strengthSets?.map(set => set.load).filter((value): value is number => value !== undefined).sort((a, b) => b - a)[0];
              const feelings = repFeelingOptions.map(option => ({ label: option.label, count: result.trackReps?.filter(rep => rep.feeling === option.value).length ?? 0 })).filter(item => item.count > 0);
              const actual = totalUnits ? `${doneUnits}/${totalUnits} ${result.trackingKind === 'track' ? 'reps' : 'sets'}${fastest !== undefined ? ` · best ${fastest}s` : ''}${topLoad !== undefined ? ` · top ${topLoad}` : ''}` : result.status === 'completed' ? 'Completed' : result.status === 'skipped' ? 'Skipped' : 'Not marked';
              return <View key={result.exerciseId} style={styles.resultRow}><View style={[styles.resultDot, result.status === 'completed' && styles.resultDotDone, result.status === 'skipped' && styles.resultDotSkipped]} /><View style={styles.grow}><Text style={styles.resultName}>{exercise.name}</Text><Text style={styles.actualLine}>{actual}</Text>{feelings.length ? <Text style={styles.resultDetail}>Rep feel · {feelings.map(item => `${item.count} ${item.label.toLowerCase()}`).join(' · ')}</Text> : null}{result.changeReason ? <Text style={styles.changeLine}>Changed · {changeReasonLabels[result.changeReason]}{result.changeReasonNote ? ` — ${result.changeReasonNote}` : ''}</Text> : null}{result.notes ? <Text style={styles.resultNotes}>{result.notes}</Text> : null}</View></View>;
            })}</Card> : null}

            {coverage.completed < coverage.planned ? <View style={styles.partialNotice}><MaterialIcons name="info-outline" size={19} color={palette.orange} /><Text style={styles.partialText}>{coverage.planned - coverage.completed} exercises are still unmarked. You can review them, or save the workout as it happened.</Text></View> : null}
          </> : null}

          <Text style={styles.sectionLabel}>{session ? 'Post-workout feedback' : 'Session details'}</Text>
          <Card style={styles.feedbackCard}>
            <View style={styles.switchRow}><View style={styles.grow}><Text style={styles.label}>Session completed as scheduled</Text><Text style={styles.hint}>Turn off if it was partial or changed significantly.</Text></View><Switch value={completed} onValueChange={value => { selection(); setCompleted(value); }} trackColor={{ true: palette.accent }} /></View>
            <View style={styles.divider} />
            <View><Text style={styles.label}>Session RPE · {rpe}/10</Text><Text style={styles.hint}>1 = very easy · 10 = maximal</Text><Scale value={rpe} max={10} onChange={setRpe} /></View>
            <View style={styles.divider} />
            <View><Text style={styles.label}>Energy after training · {energy}/5</Text><Text style={styles.hint}>1 = drained · 5 = still fresh</Text><Scale value={energy} max={5} onChange={setEnergy} /></View>
            <View style={styles.divider} />
            <View><Text style={styles.label}>Hamstring soreness · {hamstring}/10</Text><Text style={styles.hint}>0 = none · 10 = severe</Text><Scale value={hamstring} max={10} onChange={setHamstring} /></View>
            <View style={styles.compactGap}><Text style={styles.label}>General soreness · {soreness}/10</Text><Text style={styles.hint}>0 = none · 10 = severe</Text><Scale value={soreness} max={10} onChange={setSoreness} /></View>
            <View style={styles.divider} />
            {readinessCompleted ? <View style={styles.recordedRow}><MaterialIcons name="check-circle" size={19} color={palette.accent} /><Text style={styles.recordedText}>Sleep recorded today · {sleep ? `${sleep} hr` : 'Readiness check completed'}</Text></View> : <Field label="Sleep (hours) · Optional" value={sleep} onChange={value => setSleep(cleanSleep(value))} />}
            <View style={styles.divider} />
            {notesOpen || notes ? <View><Text style={styles.label}>Notes</Text><TextInput value={notes} onChangeText={setNotes} multiline autoFocus={notesOpen && !notes} placeholder="What felt fast? What changed?" placeholderTextColor={palette.muted} style={[styles.input, styles.notes]} /></View> : <Pressable accessibilityRole="button" onPress={() => { tap(); setNotesOpen(true); }} style={styles.addNotesLink}><MaterialIcons name="add" size={18} color={palette.muted} /><Text style={styles.addNotesText}>Add notes</Text></Pressable>}
          </Card>

          {postSessionRecovery ? <Card style={{ ...styles.recoveryCard, ...(postSessionRecovery.gate === 'stop-refer' ? styles.recoveryStop : {}) }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: recoveryOpen }} onPress={() => { tap(); setRecoveryOpen(current => !current); }} style={styles.recoveryHead}>
              <View style={styles.recoveryIcon}><MaterialIcons name="self-improvement" size={22} color={postSessionRecovery.gate === 'stop-refer' ? palette.red : palette.accent} /></View>
              <View style={styles.grow}><Text style={styles.summaryEyebrow}>After today’s session</Text><Text style={styles.recoveryTitle}>{postSessionRecovery.title}</Text></View>
              <MaterialIcons name={recoveryOpen ? 'expand-less' : 'expand-more'} size={22} color={palette.muted} />
            </Pressable>
            {recoveryOpen ? <>
              <Text style={styles.hint}>{postSessionRecovery.explanation}</Text>
              {postSessionRecovery.recommendations.map(card => <View key={card.id} style={styles.recoveryRow}><View style={styles.grow}><Text style={styles.recoveryName}>{card.name} · {card.estimatedMinutes} min</Text><Text style={styles.hint}>{card.purpose}</Text>{expandedRecovery === card.id ? <><Text style={styles.recoveryDetail}>Exercises · {card.exercises.join(' · ')}</Text><Text style={styles.recoveryDose}>{card.dosage}</Text><Text style={styles.recoveryDetail}>Placement · {card.placement}</Text></> : null}</View><Pressable onPress={() => { tap(); setExpandedRecovery(current => current === card.id ? null : card.id); }} style={styles.recoveryView}><Text style={styles.recoveryViewText}>{expandedRecovery === card.id ? 'Hide' : 'View'}</Text></Pressable></View>)}
              {!postSessionRecovery.recommendations.length ? <Text style={styles.hint}>No exercise suggestion is shown. Follow the stop or restriction guidance above.</Text> : null}
              <Text style={styles.recoverySafety}>{postSessionRecovery.safetyMessage}</Text>
            </> : null}
          </Card> : null}
        </ScrollView>
        <View style={styles.stickyFooter}>
          <View style={styles.footerInner}>
            <PrimaryButton title={saving ? 'Saving…' : saved ? 'Workout saved' : session ? 'Finish and save workout' : 'Save session'} onPress={save} disabled={saved || saving} />
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
    {celebration ? <WorkoutCompletionCelebration
      payload={celebration}
      onViewSummary={() => router.replace(savedLogId ? { pathname: '/history-detail', params: { id: savedLogId } } : '/history')}
      onBackToToday={() => router.replace('/')}
    /> : null}
  </SafeAreaView>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <View style={{ flex: 1 }}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChange} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={palette.muted} style={styles.input} /></View>;
}

function cleanSleep(value: string) { const cleaned = value.replace(/[^0-9.]/g, ''); const [whole = '', ...decimals] = cleaned.split('.'); const result = `${whole.slice(0, 2)}${decimals.length ? `.${decimals.join('').slice(0, 1)}` : ''}`; return Number(result) > 14 ? '14' : result; }

const createStyles = (palette: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  flex: { flex: 1 },
  shell: { flex: 1 },
  grow: { flex: 1 },
  page: { padding: 20, paddingBottom: 132, gap: 14, width: '100%', maxWidth: 720, alignSelf: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: palette.text, fontSize: 22, fontWeight: '900' },
  headerBalance: { width: 44, height: 44 },
  back: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  stickyFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, backgroundColor: palette.bg, borderTopWidth: 1, borderTopColor: palette.border },
  footerInner: { width: '100%', maxWidth: 680, alignSelf: 'center' },
  summaryCard: { borderColor: palette.border, gap: 4 },
  summaryEyebrow: { color: palette.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 },
  summaryTitle: { color: palette.text, fontSize: 20, fontWeight: '900', marginTop: 2 },
  summaryDetail: { color: palette.muted, fontSize: 12, marginTop: 2 },
  quietAction: { minHeight: 44, marginTop: 6, borderTopWidth: 1, borderTopColor: palette.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quietActionText: { color: palette.muted, fontSize: 13, fontWeight: '800' },
  sectionLabel: { color: palette.muted, fontWeight: '900', fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase', marginTop: 2 },
  feedbackCard: { gap: 14 },
  divider: { height: 1, backgroundColor: palette.border },
  compactGap: { marginTop: 16 },
  recordedRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  recordedText: { color: palette.muted, fontSize: 13, fontWeight: '700' },
  recoveryCard: { gap: 12, borderColor: '#405020' }, recoveryStop: { borderColor: '#55282D' }, recoveryHead: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, recoveryIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }, recoveryTitle: { color: palette.text, fontSize: 16, fontWeight: '900', marginTop: 3, marginBottom: 4 }, recoveryRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 11 }, recoveryName: { color: palette.text, fontSize: 13, fontWeight: '900', marginBottom: 3 }, recoveryDetail: { color: palette.muted, fontSize: 10, lineHeight: 15, marginTop: 5 }, recoveryDose: { color: palette.accent, fontSize: 10, lineHeight: 15, marginTop: 5 }, recoveryView: { minHeight: 34, paddingHorizontal: 10, borderRadius: 9, backgroundColor: palette.accentDark, alignItems: 'center', justifyContent: 'center' }, recoveryViewText: { color: palette.accent, fontSize: 10, fontWeight: '900' }, recoverySafety: { color: palette.muted, fontSize: 9, lineHeight: 14, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 9 },
  resultsCard: { paddingVertical: 5 }, resultRow: { flexDirection: 'row', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: palette.border }, resultDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.surface2, marginTop: 5 }, resultDotDone: { backgroundColor: palette.accent }, resultDotSkipped: { backgroundColor: palette.red }, resultName: { color: palette.text, fontSize: 14, fontWeight: '900' }, actualLine: { color: palette.accent, fontSize: 11, fontWeight: '800', marginTop: 3 }, resultDetail: { color: palette.text, fontSize: 10, marginTop: 4 }, changeLine: { color: palette.orange, fontSize: 10, fontWeight: '800', marginTop: 4 }, resultNotes: { color: palette.muted, fontSize: 11, fontStyle: 'italic', marginTop: 4 }, partialNotice: { flexDirection: 'row', gap: 9, alignItems: 'center', paddingHorizontal: 4 }, partialText: { color: palette.muted, fontSize: 12, lineHeight: 17, flex: 1 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, label: { color: palette.text, fontWeight: '800', fontSize: 14, marginBottom: 6 }, hint: { color: palette.muted, fontSize: 12, lineHeight: 17 }, scale: { flexDirection: 'row', gap: 5, marginTop: 14 }, scaleItem: { flex: 1, height: 32, minWidth: 25, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface2 }, scaleActive: { backgroundColor: palette.accent }, scaleText: { color: palette.muted, fontSize: 12, fontWeight: '800' }, scaleTextActive: { color: '#0B1000' }, two: { flexDirection: 'row', gap: 12 }, input: { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, borderRadius: 13, minHeight: 50, color: palette.text, paddingHorizontal: 14, fontSize: 16 }, notes: { minHeight: 110, paddingTop: 14, textAlignVertical: 'top' },
  addNotesLink: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }, addNotesText: { color: palette.muted, fontSize: 13, fontWeight: '700' },
});
