import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Card, Eyebrow, PrimaryButton, ScreenTitle } from '@/components/sprint-ui';
import { SplitMoment } from '@/components/split-moment';
import { changeReasonLabels, formatTrackConditions, repFeelingOptions } from '@/constants/logging';
import { palette } from '@/constants/sprintlab';
import { ActiveWorkoutSession, PostWorkoutReview } from '@/types';
import { buildManualTrainingLog, buildStructuredTrainingLog } from '@/utils/domain-adapters';
import { addCompletedWorkoutSession, addLog, addTrainingLog, clearActiveWorkoutSession, getActiveWorkoutSession, getReadiness } from '@/utils/storage';
import { findPlannedExercise, getSessionCoverage, withDerivedStatuses } from '@/utils/workout-session';
import { locationLabels } from '@/utils/readiness';

const dateKey = () => new Date().toLocaleDateString('en-CA');
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

function Scale({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  return <View style={styles.scale}>{Array.from({ length: max }, (_, index) => index + 1).map(number => <Pressable key={number} onPress={() => onChange(number)} style={[styles.scaleItem, value === number && styles.scaleActive]}><Text style={[styles.scaleText, value === number && styles.scaleTextActive]}>{number}</Text></Pressable>)}</View>;
}

export default function LogScreen() {
  const router = useRouter();
  const [completed, setCompleted] = useState(false);
  const [rpe, setRpe] = useState(7);
  const [energy, setEnergy] = useState(4);
  const [sleep, setSleep] = useState('');
  const [hamstring, setHamstring] = useState(0);
  const [soreness, setSoreness] = useState(0);
  const [notes, setNotes] = useState('');
  const [session, setSession] = useState<ActiveWorkoutSession | null>(null);
  const [saved, setSaved] = useState(false);

  useFocusEffect(useCallback(() => {
    Promise.all([getActiveWorkoutSession(), getReadiness(dateKey())]).then(([active, decision]) => {
      setSession(active);
      if (active) {
        const coverage = getSessionCoverage(active);
        setCompleted(coverage.planned > 0 && coverage.completed === coverage.planned);
      } else {
        setCompleted(true);
      }
      if (decision?.status === 'completed') {
        setSleep(decision.sleep ? String(decision.sleep) : '');
        setEnergy(decision.energy ?? 4);
        setHamstring(decision.hamstring ?? 0);
        setSoreness(decision.soreness ?? 0);
      }
      setSaved(false);
    });
  }, []));

  const coverage = useMemo(() => session ? getSessionCoverage(session) : null, [session]);
  const bestSprintTime = useMemo(() => session?.actualResults.flatMap(result => result.trackReps ?? []).map(rep => rep.timeSeconds).filter((value): value is number => value !== undefined).sort((a, b) => a - b)[0], [session]);
  const readinessArea = useMemo(() => {
    const readiness = session?.readinessSnapshot;
    if (!readiness?.hasLocalizedIssue) return null;
    if (readiness.location === 'other' && readiness.otherLocationDetail) return readiness.otherLocationDetail;
    return readiness.location ? locationLabels[readiness.location] : 'Localized issue';
  }, [session]);

  const save = async () => {
    const review: PostWorkoutReview = {
      completed,
      rpe,
      energy,
      sleep: Number(sleep) || 0,
      hamstring,
      soreness,
      notes,
    };
    const logId = Date.now().toString();
    if (session && coverage) {
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
    } else {
      const finishedAt = new Date().toISOString();
      await addTrainingLog(buildManualTrainingLog(review, finishedAt, undefined, logId));
      await addLog({ id: logId, sessionId: logId, date: finishedAt, completed, rpe, energy, sleep: review.sleep, hamstring, soreness, bodyWeight: review.bodyWeight, notes, workoutTitle: 'Unplanned session' });
    }
    setSaved(true);
    Alert.alert('Workout saved', 'The completed session was added to History.');
    router.replace('/history');
  };

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Pressable onPress={() => router.back()} style={styles.back}><MaterialIcons name="arrow-back" size={22} color={palette.text} /></Pressable>
    <Eyebrow>{session ? 'Final review' : 'Manual entry'}</Eyebrow><ScreenTitle subtitle={session ? 'Review the session before adding it to History.' : 'Record an unplanned or past training session.'}>{session ? 'Review workout' : 'Log session'}</ScreenTitle>

    {session && coverage && <>
      {coverage.planned > 0 && coverage.completed === coverage.planned ? (
        <SplitMoment
          title="Session work is accounted for."
          message="Review the results honestly, add any useful context, and save the workout when it matches what happened."
          pose="celebration"
        />
      ) : null}
      <Card style={styles.summaryCard}><View style={styles.summaryHead}><View style={{ flex: 1 }}><Text style={styles.summaryEyebrow}>SCHEDULED SESSION</Text><Text style={styles.summaryTitle}>{session.plannedWorkoutSnapshot.title}</Text><Text style={styles.summaryDetail}>{formatTime(session.elapsedSeconds)} elapsed · {session.readinessStatus === 'skipped' ? 'readiness skipped' : 'readiness completed'}</Text><View style={styles.summaryChips}>{session.actualResults.some(result => result.trackingKind === 'track') ? <Text style={styles.summaryChip}>Conditions · {formatTrackConditions(session.trackConditions)}</Text> : null}{readinessArea ? <Text style={[styles.summaryChip, styles.warningChip]}>Readiness area · {readinessArea}</Text> : null}</View></View><View style={styles.percent}><Text style={styles.percentValue}>{coverage.planned ? Math.round(coverage.completed / coverage.planned * 100) : 0}%</Text><Text style={styles.percentLabel}>complete</Text></View></View></Card>
      <Text style={styles.sectionLabel}>SESSION REVIEW</Text>
      <Card style={styles.resultsCard}>{session.actualResults.map(result => {
        const exercise = findPlannedExercise(session, result.exerciseId);
        if (!exercise) return null;
        const doneUnits = (result.trackReps ?? result.strengthSets)?.filter(unit => unit.status === 'completed').length;
        const totalUnits = (result.trackReps ?? result.strengthSets)?.length;
        const fastest = result.trackReps?.map(rep => rep.timeSeconds).filter((value): value is number => value !== undefined).sort((a, b) => a - b)[0];
        const topLoad = result.strengthSets?.map(set => set.load).filter((value): value is number => value !== undefined).sort((a, b) => b - a)[0];
        const feelings = repFeelingOptions.map(option => ({ label: option.label, count: result.trackReps?.filter(rep => rep.feeling === option.value).length ?? 0 })).filter(item => item.count > 0);
        const overrides = result.trackReps?.filter(rep => rep.windOverride || rep.wind !== undefined).length ?? 0;
        const actual = totalUnits ? `${doneUnits}/${totalUnits} ${result.trackingKind === 'track' ? 'reps' : 'sets'}${fastest !== undefined ? ` · best ${fastest}s` : ''}${topLoad !== undefined ? ` · top ${topLoad}` : ''}` : result.status === 'completed' ? 'Completed' : result.status === 'skipped' ? 'Skipped' : 'Not marked';
        return <View key={result.exerciseId} style={styles.resultRow}><View style={[styles.resultDot, result.status === 'completed' && styles.resultDotDone, result.status === 'skipped' && styles.resultDotSkipped]} /><View style={{ flex: 1 }}><Text style={styles.resultName}>{exercise.name}</Text><Text style={styles.planLine}>{result.origin === 'added' ? 'Added during workout' : `Scheduled · ${exercise.detail || 'Complete exercise'}`}</Text><Text style={styles.actualLine}>Actual · {actual}</Text>{feelings.length ? <Text style={styles.resultDetail}>Rep feel · {feelings.map(item => `${item.count} ${item.label.toLowerCase()}`).join(' · ')}</Text> : null}{overrides ? <Text style={styles.resultDetail}>Conditions · {overrides} rep {overrides === 1 ? 'override' : 'overrides'}</Text> : null}{result.changeReason ? <Text style={styles.changeLine}>Change reason · {changeReasonLabels[result.changeReason]}{result.changeReasonNote ? ` — ${result.changeReasonNote}` : ''}</Text> : null}{result.notes ? <Text style={styles.resultNotes}>{result.notes}</Text> : null}</View></View>;
      })}</Card>
      {coverage.completed < coverage.planned && <Card style={styles.partialNotice}><MaterialIcons name="info-outline" size={20} color={palette.accent} /><Text style={styles.partialText}>Some work is still unmarked. Go back to update it, or save the session as it happened.</Text></Card>}
    </>}

    <Card><View style={styles.switchRow}><View style={{ flex: 1 }}><Text style={styles.label}>Session completed as scheduled</Text><Text style={styles.hint}>Turn this off if the session was partial or changed significantly.</Text></View><Switch value={completed} onValueChange={setCompleted} trackColor={{ true: palette.accent }} /></View></Card>
    <Card><Text style={styles.label}>Session RPE · {rpe}/10</Text><Text style={styles.hint}>1 = very easy · 10 = maximal effort for the whole session.</Text><Scale value={rpe} max={10} onChange={setRpe} /></Card>
    <Card><Text style={styles.label}>Energy after training · {energy}/5</Text><Text style={styles.hint}>1 = drained · 5 = still fresh.</Text><Scale value={energy} max={5} onChange={setEnergy} /></Card>
    <Card><Text style={styles.label}>Hamstring soreness · {hamstring}/10</Text><Text style={styles.hint}>0 = none · 10 = severe.</Text><Scale value={hamstring} max={10} onChange={setHamstring} /><Text style={[styles.label, { marginTop: 20 }]}>General soreness · {soreness}/10</Text><Text style={styles.hint}>0 = none · 10 = severe.</Text><Scale value={soreness} max={10} onChange={setSoreness} /></Card>
    <Field label="Sleep (hours)" value={sleep} onChange={value => setSleep(cleanSleep(value))} />
    <View><Text style={styles.label}>Session notes</Text><TextInput value={notes} onChangeText={setNotes} multiline placeholder="What felt fast? What changed? Any pain or tightness?" placeholderTextColor="#647382" style={[styles.input, styles.notes]} /></View>
    <PrimaryButton title={saved ? 'Workout saved' : session ? 'Finish and save workout' : 'Save session'} onPress={save} disabled={saved} />
  </ScrollView></SafeAreaView>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <View style={{ flex: 1 }}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChange} keyboardType="decimal-pad" placeholder="—" placeholderTextColor="#647382" style={styles.input} /></View>;
}

function cleanSleep(value: string) { const cleaned = value.replace(/[^0-9.]/g, ''); const [whole = '', ...decimals] = cleaned.split('.'); const result = `${whole.slice(0, 2)}${decimals.length ? `.${decimals.join('').slice(0, 1)}` : ''}`; return Number(result) > 24 ? '24' : result; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg }, page: { padding: 20, paddingBottom: 36, gap: 16, width: '100%', maxWidth: 820, alignSelf: 'center' }, back: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  summaryCard: { borderColor: '#405020' }, summaryHead: { flexDirection: 'row', alignItems: 'center', gap: 12 }, summaryEyebrow: { color: palette.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 }, summaryTitle: { color: palette.text, fontSize: 19, fontWeight: '900', marginTop: 4 }, summaryDetail: { color: palette.muted, fontSize: 11, marginTop: 5 }, summaryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 }, summaryChip: { color: palette.text, backgroundColor: palette.surface2, borderRadius: 9, paddingVertical: 5, paddingHorizontal: 7, fontSize: 9, fontWeight: '800' }, warningChip: { color: palette.orange, backgroundColor: '#2A1B0C' }, percent: { width: 66, height: 66, borderRadius: 22, backgroundColor: palette.accentDark, alignItems: 'center', justifyContent: 'center' }, percentValue: { color: palette.accent, fontSize: 19, fontWeight: '900' }, percentLabel: { color: palette.muted, fontSize: 9, marginTop: 1 }, sectionLabel: { color: palette.muted, fontWeight: '900', fontSize: 11, letterSpacing: 1.1 },
  resultsCard: { paddingVertical: 5 }, resultRow: { flexDirection: 'row', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: palette.border }, resultDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.surface2, marginTop: 5 }, resultDotDone: { backgroundColor: palette.accent }, resultDotSkipped: { backgroundColor: palette.red }, resultName: { color: palette.text, fontSize: 14, fontWeight: '900' }, planLine: { color: palette.muted, fontSize: 11, marginTop: 3 }, actualLine: { color: palette.accent, fontSize: 11, fontWeight: '800', marginTop: 3 }, resultDetail: { color: palette.text, fontSize: 10, marginTop: 4 }, changeLine: { color: palette.orange, fontSize: 10, fontWeight: '800', marginTop: 4 }, resultNotes: { color: palette.muted, fontSize: 11, fontStyle: 'italic', marginTop: 4 }, partialNotice: { flexDirection: 'row', gap: 9, alignItems: 'center', borderStyle: 'dashed' }, partialText: { color: palette.muted, fontSize: 12, lineHeight: 17, flex: 1 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, label: { color: palette.text, fontWeight: '800', fontSize: 14, marginBottom: 6 }, hint: { color: palette.muted, fontSize: 12, lineHeight: 17 }, scale: { flexDirection: 'row', gap: 5, marginTop: 14 }, scaleItem: { flex: 1, height: 32, minWidth: 25, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface2 }, scaleActive: { backgroundColor: palette.accent }, scaleText: { color: palette.muted, fontSize: 12, fontWeight: '800' }, scaleTextActive: { color: '#0B1000' }, two: { flexDirection: 'row', gap: 12 }, input: { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, borderRadius: 13, minHeight: 50, color: palette.text, paddingHorizontal: 14, fontSize: 16 }, notes: { minHeight: 110, paddingTop: 14, textAlignVertical: 'top' },
});
