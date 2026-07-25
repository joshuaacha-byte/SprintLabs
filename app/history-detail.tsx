import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ComponentProps, useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Card, Eyebrow, PrimaryButton, ScreenTitle } from '@/components/sprint-ui';
import { palette } from '@/constants/sprintlab';
import type { Exercise, ExerciseResult, TrainingLog, WorkoutCompletionStatus } from '@/types';
import { deleteTrainingLog, getTrainingLog, saveFutureWorkoutOverride, updateTrainingLog } from '@/utils/storage';
import { completionStatusLabels, exerciseResultFor, keySprintResult, readableDate, sorenessIndicator, workoutCategoryLabels, workoutToPlannedSnapshot } from '@/utils/training-history';

const completionStatuses = Object.keys(completionStatusLabels) as WorkoutCompletionStatus[];
const painLabels = { 'minor-tightness': 'Minor tightness', 'lingering-niggle': 'Lingering niggle', 'severe-acute': 'Severe / acute', 'not-recorded': 'Not recorded' } as const;

const numberOrNull = (value: string) => {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
};

function DetailChip({ children, warning }: { children: string; warning?: boolean }) {
  return <Text style={[styles.chip, warning && styles.warningChip]}>{children}</Text>;
}

export default function HistoryDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [log, setLog] = useState<TrainingLog | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicateDate, setDuplicateDate] = useState(() => {
    const next = new Date(); next.setDate(next.getDate() + 1); return next.toISOString().slice(0, 10);
  });

  const load = useCallback(() => { if (id) getTrainingLog(id).then(setLog); }, [id]);
  useFocusEffect(load);
  const keyResult = useMemo(() => log ? keySprintResult(log) : null, [log]);

  const update = (change: (current: TrainingLog) => TrainingLog) => setLog(current => current ? change(current) : current);
  const saveEdits = async () => {
    if (!log) return;
    setSaving(true);
    const saved = await updateTrainingLog(log);
    setLog(saved);
    setEditMode(false);
    setSaving(false);
  };
  const duplicate = async () => {
    if (!log) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(duplicateDate) || duplicateDate <= new Date().toISOString().slice(0, 10)) {
      Alert.alert('Choose a future date', 'Use YYYY-MM-DD and choose a date after today.');
      return;
    }
    await saveFutureWorkoutOverride(workoutToPlannedSnapshot(log), duplicateDate, log.id);
    Alert.alert('Workout scheduled', `${log.plannedWorkout.name} was copied to ${readableDate(duplicateDate)}.`);
  };
  const remove = () => {
    if (!log) return;
    Alert.alert('Delete this training log?', 'This removes the saved workout from History and Progress on this device. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete log', style: 'destructive', onPress: async () => { await deleteTrainingLog(log.id); router.replace('/history'); } },
    ]);
  };

  if (!log) return <SafeAreaView style={styles.safe}><View style={styles.notFound}><MaterialIcons name="history" color={palette.muted} size={32} /><Text style={styles.notFoundTitle}>Training log not found</Text><Pressable onPress={() => router.replace('/history')}><Text style={styles.link}>Back to History</Text></Pressable></View></SafeAreaView>;

  const soreness = sorenessIndicator(log);
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Pressable onPress={() => router.back()} style={styles.back}><MaterialIcons name="arrow-back" size={22} color={palette.text} /></Pressable>
    <Eyebrow>Completed training log</Eyebrow>
    <ScreenTitle subtitle={`${readableDate(log.date)} · ${workoutCategoryLabels[log.plannedWorkout.trainingCategory]}`}>{log.plannedWorkout.name}</ScreenTitle>

    <Card style={styles.summary}><View style={styles.summaryTop}><View style={{ flex: 1 }}><Text style={styles.summaryStatus}>{completionStatusLabels[log.completionStatus]}</Text><Text style={styles.summaryPurpose}>{log.plannedWorkout.purpose}</Text></View><View style={styles.rpe}><Text style={styles.rpeValue}>{log.sessionRpe ?? '—'}</Text><Text style={styles.rpeLabel}>RPE</Text></View></View><View style={styles.chips}><DetailChip>{keyResult ? `Best · ${keyResult}` : 'No timed sprint'}</DetailChip><DetailChip warning={soreness.level === 'high' || soreness.level === 'moderate'}>{`Soreness · ${soreness.label}`}</DetailChip><DetailChip>{`${log.plannedWorkout.estimatedDurationMinutes || '—'} min planned`}</DetailChip></View></Card>

    <View style={styles.actionRow}><Pressable onPress={() => setEditMode(current => !current)} style={styles.outlineAction}><MaterialIcons name="edit" size={18} color={palette.accent} /><Text style={styles.outlineText}>{editMode ? 'Cancel editing' : 'Edit log'}</Text></Pressable><Pressable onPress={remove} style={styles.deleteAction}><MaterialIcons name="delete-outline" size={18} color={palette.red} /><Text style={styles.deleteText}>Delete</Text></Pressable></View>

    {editMode && <Card style={styles.editCard}>
      <Text style={styles.cardTitle}>Edit actual session data</Text><Text style={styles.hint}>The planned workout stays frozen. Update the recorded outcome if you need to correct it.</Text>
      <Text style={styles.fieldLabel}>Completion status</Text><View style={styles.chips}>{completionStatuses.map(status => <Pressable key={status} onPress={() => update(current => ({ ...current, completionStatus: status }))} style={[styles.choice, log.completionStatus === status && styles.choiceSelected]}><Text style={[styles.choiceText, log.completionStatus === status && styles.choiceTextSelected]}>{completionStatusLabels[status]}</Text></Pressable>)}</View>
      <View style={styles.inputRow}><LabeledInput label="Session RPE" value={log.sessionRpe?.toString() ?? ''} onChangeText={value => update(current => ({ ...current, sessionRpe: numberOrNull(value) as TrainingLog['sessionRpe'] }))} /><LabeledInput label="Body weight" value={log.bodyWeight?.toString() ?? ''} onChangeText={value => update(current => ({ ...current, bodyWeight: numberOrNull(value) }))} /></View>
      <View style={styles.inputRow}><LabeledInput label="Sleep hours" value={log.readiness.sleepHours?.toString() ?? ''} onChangeText={value => update(current => ({ ...current, readiness: { ...current.readiness, sleepHours: numberOrNull(value) } }))} /><LabeledInput label="General soreness" value={log.readiness.generalSoreness?.toString() ?? ''} onChangeText={value => update(current => ({ ...current, readiness: { ...current.readiness, generalSoreness: numberOrNull(value) as TrainingLog['readiness']['generalSoreness'] } }))} /></View>
      <LabeledInput label="Hamstring soreness" value={log.readiness.hamstringSoreness?.toString() ?? ''} onChangeText={value => update(current => ({ ...current, readiness: { ...current.readiness, hamstringSoreness: numberOrNull(value) as TrainingLog['readiness']['hamstringSoreness'] } }))} />
      <Text style={styles.fieldLabel}>Session notes</Text><TextInput value={log.generalNotes} onChangeText={generalNotes => update(current => ({ ...current, generalNotes }))} multiline placeholder="Notes from training" placeholderTextColor="#647382" style={[styles.textInput, styles.notesInput]} />
      <PrimaryButton title={saving ? 'Saving…' : 'Save edits'} onPress={saveEdits} disabled={saving} />
    </Card>}

    <SectionTitle icon="favorite-border" title="Readiness and recovery" />
    <Card style={styles.readinessCard}><View style={styles.readinessGrid}><ReadinessMetric label="Sleep" value={log.readiness.sleepHours ? `${log.readiness.sleepHours}h` : '—'} /><ReadinessMetric label="Sleep quality" value={log.readiness.sleepQuality ? `${log.readiness.sleepQuality}/5` : '—'} /><ReadinessMetric label="Explosive energy" value={log.readiness.energy ? `${log.readiness.energy}/10` : '—'} /><ReadinessMetric label="Focus" value={log.readiness.focus ? `${log.readiness.focus}/5` : '—'} /><ReadinessMetric label="Motivation" value={log.readiness.motivation ? `${log.readiness.motivation}/5` : '—'} /><ReadinessMetric label="Stress" value={log.readiness.stress ? `${log.readiness.stress}/5` : '—'} /><ReadinessMetric label="Fuel / hydration" value={log.readiness.fuelHydrated == null ? '—' : log.readiness.fuelHydrated ? 'Enough' : 'Not enough'} /><ReadinessMetric label="General soreness" value={log.readiness.generalSoreness != null ? `${log.readiness.generalSoreness}/10` : '—'} /><ReadinessMetric label="Hamstring" value={log.readiness.hamstringSoreness != null ? `${log.readiness.hamstringSoreness}/10` : '—'} /><ReadinessMetric label="Achilles" value={log.readiness.achillesSoreness != null ? `${log.readiness.achillesSoreness}/10` : '—'} /><ReadinessMetric label="Warm-up feel" value={(log.readiness.warmupFeeling ?? 'not-recorded').replaceAll('-', ' ')} /></View>{log.readiness.painAreas.length ? <View style={styles.painBlock}><Text style={styles.fieldLabel}>Pain / tightness areas</Text>{log.readiness.painAreas.map((pain, index) => <Text key={`${pain.area}-${index}`} style={styles.painText}>{pain.area.replaceAll('-', ' ')} · {pain.severity ?? '—'}/10 · {painLabels[pain.classification]}{pain.description ? ` · ${pain.description}` : ''}</Text>)}</View> : <Text style={styles.noneText}>No localized pain or tightness was recorded.</Text>}{log.readiness.notes ? <Text style={styles.noteText}>{log.readiness.notes}</Text> : null}</Card>

    <SectionTitle icon="compare-arrows" title="Planned versus actual" />
    <Card style={styles.planCard}>{log.plannedWorkout.sections.map(section => <View key={section.id} style={styles.planSection}><Text style={styles.sectionName}>{section.title}</Text>{section.exercises.map(exercise => <ExerciseComparison key={exercise.id} exercise={exercise} result={exerciseResultFor(log, exercise.id)} editMode={editMode} onChange={result => update(current => ({ ...current, exerciseResults: current.exerciseResults.map(item => item.exerciseId === result.exerciseId ? result : item) }))} />)}</View>)}</Card>

    <SectionTitle icon="summarize" title="Session summary" />
    <Card style={styles.contextCard}><Text style={styles.contextLine}>Surface · {log.surface.replaceAll('-', ' ')}</Text><Text style={styles.contextLine}>Footwear · {log.footwear.replaceAll('-', ' ')}</Text><Text style={styles.contextLine}>Wind · {log.wind.type}{log.wind.measuredMetersPerSecond !== null ? ` ${log.wind.measuredMetersPerSecond > 0 ? '+' : ''}${log.wind.measuredMetersPerSecond} m/s` : ''}</Text><Text style={styles.contextLine}>Weather · {log.weather.type}{log.weather.temperatureCelsius !== null ? ` · ${log.weather.temperatureCelsius}°C` : ''}</Text>{log.generalNotes ? <Text style={styles.noteText}>{log.generalNotes}</Text> : <Text style={styles.noneText}>No session notes were recorded.</Text>}</Card>

    <SectionTitle icon="content-copy" title="Plan this workout again" />
    <Card style={styles.duplicateCard}><Text style={styles.hint}>Copy the planned workout to one specific future date. It will take priority over the normal weekday plan on that date.</Text><LabeledInput label="Future date · YYYY-MM-DD" value={duplicateDate} onChangeText={setDuplicateDate} text /><PrimaryButton title="Duplicate to this date" onPress={duplicate} /></Card>
  </ScrollView></SafeAreaView>;
}

function ExerciseComparison({ exercise, result, editMode, onChange }: { exercise: Exercise; result?: ExerciseResult; editMode: boolean; onChange: (result: ExerciseResult) => void }) {
  const planned = exercise.distanceMeters ? `${exercise.plannedReps ?? exercise.plannedSets ?? 1} × ${exercise.distanceMeters}m${exercise.intensityPercent ? ` at ${exercise.intensityPercent}%` : ''}${exercise.restBetweenRepsSeconds ? ` · ${exercise.restBetweenRepsSeconds}s rest` : ''}` : exercise.plannedSets || exercise.plannedReps ? `${exercise.plannedSets ?? ''}${exercise.plannedSets && exercise.plannedReps ? ' × ' : ''}${exercise.plannedReps ?? ''}` : exercise.description || 'Completion-based';
  return <View style={styles.exercise}><Text style={styles.exerciseName}>{exercise.name}</Text><Text style={styles.plannedLine}>Planned · {planned}</Text>{!result ? <Text style={styles.noneText}>No actual result recorded.</Text> : <><Text style={styles.actualLine}>Actual · {result.completed ? 'Completed' : 'Not completed'}{result.actualDistance ? ` · ${result.actualDistance}m total` : ''}{result.actualSets ? ` · ${result.actualSets} sets` : ''}{result.actualReps ? ` · ${result.actualReps} reps` : ''}{result.actualWeight ? ` · ${result.actualWeight} load` : ''}</Text>{result.repTimes.length ? <View style={styles.repList}>{result.repTimes.map(rep => <View key={rep.repNumber} style={styles.repRow}><Text style={styles.repText}>Rep {rep.repNumber} · {rep.status}{rep.distanceMeters ? ` · ${rep.distanceMeters}m` : ''}{rep.intensityTargetPercent ? ` · ${rep.intensityTargetPercent}%` : ''}{rep.restBeforeRepSeconds ? ` · ${rep.restBeforeRepSeconds}s rest` : ''}</Text>{editMode ? <TextInput value={rep.timeSeconds?.toString() ?? ''} onChangeText={value => onChange({ ...result, repTimes: result.repTimes.map(item => item.repNumber === rep.repNumber ? { ...item, timeSeconds: numberOrNull(value) } : item) })} keyboardType="decimal-pad" placeholder="time" placeholderTextColor="#647382" style={styles.repInput} /> : <Text style={styles.repTime}>{rep.timeSeconds !== null ? `${rep.timeSeconds.toFixed(2)}s` : '—'}</Text>}</View>)}</View> : null}{editMode && (exercise.category === 'strength' || result.actualSets !== null) ? <View style={styles.inputRow}><LabeledInput label="Actual sets" value={result.actualSets?.toString() ?? ''} onChangeText={value => onChange({ ...result, actualSets: numberOrNull(value) })} /><LabeledInput label="Actual reps" value={result.actualReps?.toString() ?? ''} onChangeText={value => onChange({ ...result, actualReps: numberOrNull(value) })} /><LabeledInput label="Load" value={result.actualWeight?.toString() ?? ''} onChangeText={value => onChange({ ...result, actualWeight: numberOrNull(value) })} /></View> : null}{result.modificationReason ? <Text style={styles.modification}>Change · {result.modificationReason.replaceAll('-', ' ')}</Text> : null}{result.notes ? <Text style={styles.noteText}>{result.notes}</Text> : null}</>}</View>;
}

function LabeledInput({ label, value, onChangeText, text = false }: { label: string; value: string; onChangeText: (value: string) => void; text?: boolean }) {
  return <View style={styles.inputWrap}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} keyboardType={text ? 'default' : 'decimal-pad'} placeholder="—" placeholderTextColor="#647382" style={styles.textInput} /></View>;
}

function ReadinessMetric({ label, value }: { label: string; value: string }) { return <View style={styles.readinessMetric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.readinessValue}>{value}</Text></View>; }
function SectionTitle({ icon, title }: { icon: ComponentProps<typeof MaterialIcons>['name']; title: string }) { return <View style={styles.sectionTitle}><MaterialIcons name={icon} size={18} color={palette.accent} /><Text style={styles.sectionTitleText}>{title}</Text></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg }, page: { padding: 20, paddingBottom: 40, gap: 15 }, back: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' }, notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 30 }, notFoundTitle: { color: palette.text, fontSize: 18, fontWeight: '900' }, link: { color: palette.accent, fontWeight: '900' }, summary: { borderColor: '#405020', gap: 10 }, summaryTop: { flexDirection: 'row', gap: 12 }, summaryStatus: { color: palette.accent, fontSize: 12, fontWeight: '900' }, summaryPurpose: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 5 }, rpe: { width: 60, height: 60, borderRadius: 18, backgroundColor: palette.accentDark, justifyContent: 'center', alignItems: 'center' }, rpeValue: { color: palette.accent, fontSize: 21, fontWeight: '900' }, rpeLabel: { color: palette.muted, fontSize: 9, fontWeight: '900' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, chip: { backgroundColor: palette.surface2, color: palette.text, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9, overflow: 'hidden', fontSize: 10, fontWeight: '800' }, warningChip: { color: palette.orange, backgroundColor: '#2A1B0C' }, actionRow: { flexDirection: 'row', gap: 10 }, outlineAction: { flex: 1, minHeight: 46, borderRadius: 13, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }, outlineText: { color: palette.accent, fontSize: 12, fontWeight: '900' }, deleteAction: { minHeight: 46, borderRadius: 13, borderWidth: 1, borderColor: '#55282D', paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }, deleteText: { color: palette.red, fontSize: 12, fontWeight: '900' }, editCard: { gap: 11, borderColor: '#405020' }, cardTitle: { color: palette.text, fontSize: 16, fontWeight: '900' }, hint: { color: palette.muted, fontSize: 12, lineHeight: 17 }, fieldLabel: { color: palette.muted, fontSize: 10, fontWeight: '900', letterSpacing: .5, marginTop: 2 }, choice: { minHeight: 32, borderRadius: 10, paddingHorizontal: 9, justifyContent: 'center', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface2 }, choiceSelected: { borderColor: palette.accent, backgroundColor: palette.accentDark }, choiceText: { color: palette.muted, fontSize: 10, fontWeight: '800' }, choiceTextSelected: { color: palette.accent }, inputRow: { flexDirection: 'row', gap: 8 }, inputWrap: { flex: 1, gap: 5 }, textInput: { minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface2, color: palette.text, paddingHorizontal: 10, fontSize: 13 }, notesInput: { minHeight: 88, paddingTop: 10, textAlignVertical: 'top' }, sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 }, sectionTitleText: { color: palette.text, fontSize: 16, fontWeight: '900' }, readinessCard: { gap: 12 }, readinessGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, readinessMetric: { width: '31%', backgroundColor: palette.surface2, borderRadius: 11, padding: 9, minHeight: 57 }, metricLabel: { color: palette.muted, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' }, readinessValue: { color: palette.text, fontSize: 12, fontWeight: '900', marginTop: 4, textTransform: 'capitalize' }, painBlock: { gap: 6, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 11 }, painText: { color: palette.orange, fontSize: 11, lineHeight: 16, textTransform: 'capitalize' }, noneText: { color: palette.muted, fontSize: 11, lineHeight: 16, fontStyle: 'italic', marginTop: 5 }, noteText: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 4 }, planCard: { paddingVertical: 5 }, planSection: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.border }, sectionName: { color: palette.accent, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: .7, paddingHorizontal: 11 }, exercise: { paddingHorizontal: 11, paddingTop: 10, gap: 3 }, exerciseName: { color: palette.text, fontSize: 14, fontWeight: '900' }, plannedLine: { color: palette.muted, fontSize: 11, lineHeight: 16 }, actualLine: { color: palette.accent, fontSize: 11, lineHeight: 16, fontWeight: '800' }, repList: { backgroundColor: palette.surface2, borderRadius: 10, marginTop: 5, overflow: 'hidden' }, repRow: { minHeight: 36, paddingHorizontal: 9, borderBottomWidth: 1, borderBottomColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 8 }, repText: { color: palette.muted, flex: 1, fontSize: 10 }, repTime: { color: palette.text, fontWeight: '900', fontSize: 11 }, repInput: { minHeight: 28, width: 56, borderRadius: 8, backgroundColor: palette.bg, color: palette.text, textAlign: 'center', fontSize: 11 }, modification: { color: palette.orange, fontSize: 10, fontWeight: '800', textTransform: 'capitalize', marginTop: 3 }, contextCard: { gap: 6 }, contextLine: { color: palette.text, fontSize: 12, textTransform: 'capitalize' }, duplicateCard: { gap: 11 },
});
