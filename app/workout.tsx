import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Card, PrimaryButton } from '@/components/sprint-ui';
import {
  formatTrackConditions,
  repFeelingOptions,
  resultChangeReasonOptions,
  trackConditionOptions,
} from '@/constants/logging';
import { palette } from '@/constants/sprintlab';
import { exerciseSuggestions } from '@/data/workouts';
import {
  ActiveWorkoutSession,
  ActualExerciseResult,
  PlannedExercise,
  RepFeeling,
  ResultChangeReason,
  ResultStatus,
  TrackConditions,
  TrackConditionType,
} from '@/types';
import { getActiveWorkoutSession, saveActiveWorkoutSession } from '@/utils/storage';
import { createExerciseResult, getSessionCoverage, inferTracking, withDerivedStatuses } from '@/utils/workout-session';

const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

function StatusButtons({ status, onChange }: { status: ResultStatus; onChange: (status: ResultStatus) => void }) {
  return <View style={styles.statusButtons}>
    <Pressable onPress={() => onChange(status === 'completed' ? 'pending' : 'completed')} style={[styles.statusButton, status === 'completed' && styles.doneButton]}><Text style={[styles.statusButtonText, status === 'completed' && styles.doneButtonText]}>{status === 'completed' ? 'Done ✓' : 'Done'}</Text></Pressable>
    <Pressable onPress={() => onChange(status === 'skipped' ? 'pending' : 'skipped')} style={[styles.statusButton, status === 'skipped' && styles.skipButton]}><Text style={[styles.statusButtonText, status === 'skipped' && styles.skipButtonText]}>Skip</Text></Pressable>
  </View>;
}

function Field({ placeholder, value, onChange, signed = false }: { placeholder: string; value?: number; onChange: (value?: number) => void; signed?: boolean }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  return <TextInput value={text} onChangeText={next => { setText(next); const parsed = Number(next); onChange(Number.isFinite(parsed) && next.trim() && next !== '-' ? parsed : undefined); }} keyboardType={signed ? 'numbers-and-punctuation' : 'decimal-pad'} placeholder={placeholder} placeholderTextColor="#647382" style={styles.resultInput} />;
}

function ChoiceChips<T extends string>({ value, options, onChange }: { value?: T; options: { value: T; label: string }[]; onChange: (value?: T) => void }) {
  return <View style={styles.choiceChips}>{options.map(option => {
    const selected = value === option.value;
    return <Pressable key={option.value} onPress={() => onChange(selected ? undefined : option.value)} style={[styles.choiceChip, selected && styles.choiceChipSelected]}><Text style={[styles.choiceChipText, selected && styles.choiceChipTextSelected]}>{option.label}</Text></Pressable>;
  })}</View>;
}

function ConditionsEditor({ value, onChange, compact = false }: { value?: TrackConditions; onChange: (value?: TrackConditions) => void; compact?: boolean }) {
  const select = (type?: TrackConditionType) => {
    if (!type) {
      onChange(undefined);
      return;
    }
    onChange({ type, measuredWind: type === 'measured' ? value?.measuredWind : undefined });
  };
  return <View style={compact ? styles.compactEditor : styles.conditionsEditor}>
    <ChoiceChips value={value?.type} options={trackConditionOptions} onChange={select} />
    {value?.type === 'measured' ? <View style={styles.measuredRow}><Text style={styles.miniLabel}>WIND READING</Text><Field signed placeholder="+1.2 m/s" value={value.measuredWind} onChange={measuredWind => onChange({ type: 'measured', measuredWind })} /></View> : null}
  </View>;
}

function ChangeReasonEditor({ result, update }: { result: ActualExerciseResult; update: (change: (result: ActualExerciseResult) => ActualExerciseResult) => void }) {
  const [expanded, setExpanded] = useState(Boolean(result.changeReason));
  const hasSkippedUnit = [...(result.trackReps ?? []), ...(result.strengthSets ?? [])].some(unit => unit.status === 'skipped');
  const visible = expanded || result.status === 'skipped' || hasSkippedUnit || Boolean(result.changeReason);
  if (!visible) {
    return <Pressable onPress={() => setExpanded(true)} style={styles.reasonLink}><MaterialIcons name="edit-note" size={16} color={palette.muted} /><Text style={styles.reasonLinkText}>Record why this changed</Text></Pressable>;
  }
  return <View style={styles.reasonEditor}>
    <View style={styles.reasonHead}><Text style={styles.miniLabel}>{result.status === 'skipped' || hasSkippedUnit ? 'WHY WAS WORK SKIPPED OR CHANGED?' : 'WHY DID THIS CHANGE?'}</Text>{expanded && !result.changeReason ? <Pressable onPress={() => setExpanded(false)}><Text style={styles.clearText}>Hide</Text></Pressable> : null}</View>
    <ChoiceChips<ResultChangeReason> value={result.changeReason} options={resultChangeReasonOptions} onChange={changeReason => update(current => ({ ...current, changeReason, changeReasonNote: changeReason === 'other' ? current.changeReasonNote : undefined }))} />
    {result.changeReason === 'other' ? <TextInput value={result.changeReasonNote ?? ''} onChangeText={changeReasonNote => update(current => ({ ...current, changeReasonNote }))} placeholder="What caused the change?" placeholderTextColor="#647382" style={styles.reasonInput} /> : null}
    {result.changeReason ? <Pressable onPress={() => update(current => ({ ...current, changeReason: undefined, changeReasonNote: undefined }))}><Text style={styles.clearText}>Clear reason</Text></Pressable> : null}
  </View>;
}

export default function WorkoutScreen() {
  const router = useRouter();
  const [session, setSession] = useState<ActiveWorkoutSession | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [rest, setRest] = useState(0);
  const [restRunning, setRestRunning] = useState(false);
  const [addingSection, setAddingSection] = useState<string | null>(null);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [newExerciseDetail, setNewExerciseDetail] = useState('');

  useFocusEffect(useCallback(() => {
    getActiveWorkoutSession().then(value => {
      if (!value) {
        router.replace('/');
        return;
      }
      setSession(value);
      setElapsed(Math.max(value.elapsedSeconds, Math.floor((Date.now() - new Date(value.startedAt).getTime()) / 1000)));
    });
  }, [router]));

  const startedAt = session?.startedAt;
  useEffect(() => {
    if (!startedAt) return;
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  useEffect(() => {
    if (!restRunning) return;
    const timer = setInterval(() => setRest(value => {
      if (value <= 1) {
        setRestRunning(false);
        return 0;
      }
      return value - 1;
    }), 1000);
    return () => clearInterval(timer);
  }, [restRunning]);

  const updateSession = (change: (current: ActiveWorkoutSession) => ActiveWorkoutSession) => {
    setSession(current => {
      if (!current) return current;
      const next = withDerivedStatuses(change(current));
      saveActiveWorkoutSession(next);
      return next;
    });
  };

  const updateResult = (exerciseId: string, change: (result: ActualExerciseResult) => ActualExerciseResult) => updateSession(current => ({
    ...current,
    actualResults: current.actualResults.map(result => result.exerciseId === exerciseId ? change(result) : result),
  }));

  const addExercise = (sectionTitle: string, exercise: Omit<PlannedExercise, 'id'>) => {
    const plannedExercise: PlannedExercise = {
      ...exercise,
      id: `added-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };
    updateSession(current => ({
      ...current,
      actualResults: [
        ...current.actualResults,
        createExerciseResult(sectionTitle, plannedExercise, 'added'),
      ],
    }));
    setNewExerciseName('');
    setNewExerciseDetail('');
    setAddingSection(null);
  };

  const addCustomExercise = (sectionTitle: string) => {
    const name = newExerciseName.trim();
    const detail = newExerciseDetail.trim();
    if (!name) return;
    addExercise(sectionTitle, {
      name,
      detail: detail || undefined,
      tracking: inferTracking(sectionTitle, detail),
    });
  };

  const removeAddedExercise = (exerciseId: string) => updateSession(current => ({
    ...current,
    actualResults: current.actualResults.filter(result => result.exerciseId !== exerciseId),
  }));

  const coverage = useMemo(() => session ? getSessionCoverage(session) : { planned: 0, completed: 0, partial: 0 }, [session]);
  const finish = async () => {
    if (!session) return;
    const next = withDerivedStatuses({ ...session, elapsedSeconds: elapsed });
    await saveActiveWorkoutSession(next);
    router.push('/log');
  };
  const leave = async () => {
    if (session) await saveActiveWorkoutSession({ ...session, elapsedSeconds: elapsed });
    router.back();
  };

  if (!session) return <SafeAreaView style={styles.safe} />;
  const plan = session.plannedWorkoutSnapshot;
  const hasTrackWork = session.actualResults.some(result => result.trackingKind === 'track');

  return <SafeAreaView style={styles.safe}><View style={styles.shell}>
    <View style={styles.header}><View style={{ flex: 1 }}><Text style={styles.timerLabel}>WORKOUT TIME · COUNTING UP</Text><Text style={styles.timer}>{formatTime(elapsed)}</Text><Text style={styles.title}>{plan.title}</Text></View><Pressable onPress={leave} style={styles.close}><MaterialIcons name="close" size={22} color={palette.text} /></Pressable></View>
    <View style={styles.progressRow}><Text style={styles.progressText}>{coverage.completed} of {coverage.planned} exercises complete{coverage.partial ? ` · ${coverage.partial} partial` : ''}</Text><Text style={styles.progressText}>{coverage.planned ? Math.round(coverage.completed / coverage.planned * 100) : 0}%</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${coverage.planned ? coverage.completed / coverage.planned * 100 : 0}%` }]} /></View>

    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Card style={styles.snapshotNotice}><MaterialIcons name="edit-note" size={22} color={palette.accent} /><View style={{ flex: 1 }}><Text style={styles.snapshotTitle}>Scheduled targets</Text><Text style={styles.snapshotCopy}>Update results as you train, or add work when the session changes.</Text></View></Card>
      {hasTrackWork ? <Card style={styles.conditionsCard}>
        <View style={styles.conditionsHead}><View style={styles.conditionsIcon}><MaterialIcons name="air" size={20} color={palette.accent} /></View><View style={{ flex: 1 }}><Text style={styles.conditionsTitle}>Track conditions</Text><Text style={styles.conditionsCopy}>Set once for the session. Change an individual rep only when its conditions differ.</Text></View></View>
        <ConditionsEditor value={session.trackConditions} onChange={trackConditions => updateSession(current => ({ ...current, trackConditions }))} />
        <Text style={styles.conditionsValue}>Current · {formatTrackConditions(session.trackConditions)}</Text>
      </Card> : null}
      {plan.sections.map(section => {
        const results = session.actualResults.filter(result => result.sectionTitle === section.title);
        return <View key={section.title} style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {results.map(result => {
            const exercise = result.exerciseSnapshot ?? section.exercises.find(item => item.id === result.exerciseId);
            if (!exercise) return null;
            const remove = result.origin === 'added' ? () => removeAddedExercise(result.exerciseId) : undefined;
            if (exercise.tracking.kind === 'track') return <TrackExercise key={result.exerciseId} exercise={exercise} result={result} sessionConditions={session.trackConditions} update={change => updateResult(result.exerciseId, change)} onRemove={remove} />;
            if (exercise.tracking.kind === 'strength') return <StrengthExercise key={result.exerciseId} exercise={exercise} result={result} update={change => updateResult(result.exerciseId, change)} onRemove={remove} />;
            return <CompletionExercise key={result.exerciseId} exercise={exercise} result={result} update={change => updateResult(result.exerciseId, change)} onRemove={remove} />;
          })}
          {addingSection === section.title
            ? <Card style={styles.addCard}>
              <View style={styles.addHead}><Text style={styles.addTitle}>Add to {section.title}</Text><Pressable onPress={() => setAddingSection(null)}><MaterialIcons name="close" size={20} color={palette.muted} /></Pressable></View>
              <Text style={styles.addLabel}>Suggested {section.title.toLowerCase()} options</Text>
              <View style={styles.suggestionWrap}>{(exerciseSuggestions[section.title] ?? []).map((suggestion, index) => <Pressable key={`${suggestion.name}-${index}`} onPress={() => addExercise(section.title, suggestion)} style={styles.suggestionChip}><MaterialIcons name="add" size={16} color={palette.accent} /><Text style={styles.suggestionText}>{suggestion.name}</Text></Pressable>)}</View>
              <Text style={styles.addLabel}>Or add a custom {section.title.toLowerCase()} exercise</Text>
              <TextInput value={newExerciseName} onChangeText={setNewExerciseName} placeholder="Exercise name" placeholderTextColor="#647382" style={styles.addInput} />
              <TextInput value={newExerciseDetail} onChangeText={setNewExerciseDetail} placeholder="Reps, distance, intensity, rest…" placeholderTextColor="#647382" style={styles.addInput} />
              <PrimaryButton title={`Add custom ${section.title.toLowerCase()} exercise`} onPress={() => addCustomExercise(section.title)} disabled={!newExerciseName.trim()} />
            </Card>
            : <Pressable onPress={() => { setAddingSection(section.title); setNewExerciseName(''); setNewExerciseDetail(''); }} style={styles.addExerciseButton}><MaterialIcons name="add" size={18} color={palette.accent} /><Text style={styles.addExerciseText}>Add {section.title.toLowerCase()} exercise</Text></Pressable>}
        </View>;
      })}
    </ScrollView>

    <View style={styles.footer}><View style={styles.restBar}><View><Text style={styles.restLabel}>OPTIONAL REST COUNTDOWN</Text><Text style={styles.restTime}>{formatTime(rest)}</Text></View><Pressable onPress={() => { setRest(0); setRestRunning(false); }}><Text style={styles.restAction}>Reset</Text></Pressable><Pressable onPress={() => setRest(value => value + 30)}><Text style={styles.adjust}>+30s</Text></Pressable><Pressable onPress={() => setRest(value => value + 60)}><Text style={styles.adjust}>+60s</Text></Pressable><Pressable disabled={rest === 0} onPress={() => setRestRunning(value => !value)} style={[styles.restStart, rest === 0 && { opacity: 0.4 }]}><Text style={styles.restStartText}>{restRunning ? 'Pause' : 'Start'}</Text></Pressable></View><PrimaryButton title="Review workout" onPress={finish} /></View>
  </View></SafeAreaView>;
}

function ExerciseHeader({ exercise, added, onRemove }: { exercise: PlannedExercise; added?: boolean; onRemove?: () => void }) {
  return <View style={styles.exerciseHeader}><View style={{ flex: 1 }}><Text style={styles.exerciseName}>{exercise.name}</Text><Text style={styles.plannedText}>{added ? 'ADDED DURING WORKOUT' : 'SCHEDULED'}{exercise.detail ? ` · ${exercise.detail}` : ''}</Text></View>{onRemove ? <Pressable onPress={onRemove} style={styles.removeButton}><MaterialIcons name="delete-outline" size={18} color={palette.red} /><Text style={styles.removeText}>Remove</Text></Pressable> : null}</View>;
}

function CompletionExercise({ exercise, result, update, onRemove }: { exercise: PlannedExercise; result: ActualExerciseResult; update: (change: (result: ActualExerciseResult) => ActualExerciseResult) => void; onRemove?: () => void }) {
  const done = result.status === 'completed';
  return <Card style={styles.exerciseCard}>
    <ExerciseHeader exercise={exercise} added={result.origin === 'added'} onRemove={onRemove} />
    <View style={styles.completionRow}><Pressable onPress={() => update(current => ({ ...current, status: done ? 'pending' : 'completed' }))} style={styles.completionMain}><View style={[styles.check, done && styles.checkDone]}>{done && <MaterialIcons name="check" size={17} color="#0B1000" />}</View><View style={{ flex: 1 }}><Text style={styles.actualLabel}>{done ? 'Recorded as completed' : 'Tap when completed'}</Text></View></Pressable><Pressable onPress={() => update(current => ({ ...current, status: current.status === 'skipped' ? 'pending' : 'skipped' }))}><Text style={[styles.skipLink, result.status === 'skipped' && styles.skipLinkActive]}>{result.status === 'skipped' ? 'Skipped' : 'Skip'}</Text></Pressable></View>
    <ChangeReasonEditor result={result} update={update} />
  </Card>;
}

function TrackExercise({ exercise, result, sessionConditions, update, onRemove }: { exercise: PlannedExercise; result: ActualExerciseResult; sessionConditions?: TrackConditions; update: (change: (result: ActualExerciseResult) => ActualExerciseResult) => void; onRemove?: () => void }) {
  const [windRep, setWindRep] = useState<number | null>(null);
  if (exercise.tracking.kind !== 'track') return null;
  return <Card style={styles.exerciseCard}><ExerciseHeader exercise={exercise} added={result.origin === 'added'} onRemove={onRemove} /><Text style={styles.actualSectionLabel}>REPS</Text>{result.trackReps?.map(rep => <View key={rep.repNumber} style={styles.unitCard}>
    <View style={styles.unitTop}><Text style={styles.unitTitle}>Rep {rep.repNumber}</Text><Text style={styles.unitTarget}>{exercise.tracking.kind === 'track' ? [exercise.tracking.distanceMeters ? `${exercise.tracking.distanceMeters}m` : 'Target rep', exercise.tracking.targetIntensity ? `${exercise.tracking.targetIntensity}% intensity` : null].filter(Boolean).join(' · ') : 'Target rep'}</Text></View>
    <Text style={styles.optionalTimeHint}>Time is optional. Tap Done to record the rep without a time.</Text><View style={styles.inputRow}><Field placeholder="Optional time (seconds)" value={rep.timeSeconds} onChange={timeSeconds => update(current => ({ ...current, trackReps: current.trackReps?.map(item => item.repNumber === rep.repNumber ? { ...item, timeSeconds } : item) }))} /><StatusButtons status={rep.status} onChange={status => update(current => ({ ...current, trackReps: current.trackReps?.map(item => item.repNumber === rep.repNumber ? { ...item, status } : item) }))} /></View>
    <View><Text style={styles.miniLabel}>HOW DID THE REP FEEL? · OPTIONAL</Text><ChoiceChips<RepFeeling> value={rep.feeling} options={repFeelingOptions} onChange={feeling => update(current => ({ ...current, trackReps: current.trackReps?.map(item => item.repNumber === rep.repNumber ? { ...item, feeling } : item) }))} /></View>
    <Pressable onPress={() => setWindRep(value => value === rep.repNumber ? null : rep.repNumber)} style={styles.windOverrideButton}><MaterialIcons name="air" size={15} color={rep.windOverride ? palette.accent : palette.muted} /><Text style={[styles.windOverrideText, rep.windOverride && { color: palette.accent }]}>{rep.windOverride ? `Rep override · ${formatTrackConditions(rep.windOverride)}` : `Conditions · ${formatTrackConditions(sessionConditions)}`}</Text><MaterialIcons name={windRep === rep.repNumber ? 'expand-less' : 'expand-more'} size={18} color={palette.muted} /></Pressable>
    {windRep === rep.repNumber ? <View style={styles.overridePanel}><Text style={styles.miniLabel}>ONLY CHANGE THIS IF THE REP DIFFERED</Text><ConditionsEditor compact value={rep.windOverride} onChange={windOverride => update(current => ({ ...current, trackReps: current.trackReps?.map(item => item.repNumber === rep.repNumber ? { ...item, windOverride } : item) }))} />{rep.windOverride ? <Pressable onPress={() => update(current => ({ ...current, trackReps: current.trackReps?.map(item => item.repNumber === rep.repNumber ? { ...item, windOverride: undefined } : item) }))}><Text style={styles.clearText}>Use session conditions</Text></Pressable> : null}</View> : null}
  </View>)}
    <Pressable onPress={() => update(current => ({ ...current, trackReps: [...(current.trackReps ?? []), {
      repNumber: (current.trackReps?.length ?? 0) + 1,
      status: 'pending',
      plannedDistanceMeters: exercise.tracking.kind === 'track' ? exercise.tracking.distanceMeters : undefined,
      intensityTargetPercent: exercise.tracking.kind === 'track' ? exercise.tracking.targetIntensity : undefined,
      plannedRestSeconds: exercise.tracking.kind === 'track' ? exercise.tracking.restSeconds : undefined,
    }] }))} style={styles.addUnitButton}><MaterialIcons name="add" size={16} color={palette.accent} /><Text style={styles.addUnitText}>Add rep</Text></Pressable>
    <ChangeReasonEditor result={result} update={update} />
    <TextInput value={result.notes} onChangeText={notes => update(current => ({ ...current, notes }))} placeholder="Session cue or exercise note…" placeholderTextColor="#647382" style={styles.notesInput} />
  </Card>;
}

function StrengthExercise({ exercise, result, update, onRemove }: { exercise: PlannedExercise; result: ActualExerciseResult; update: (change: (result: ActualExerciseResult) => ActualExerciseResult) => void; onRemove?: () => void }) {
  if (exercise.tracking.kind !== 'strength') return null;
  return <Card style={styles.exerciseCard}><ExerciseHeader exercise={exercise} added={result.origin === 'added'} onRemove={onRemove} /><Text style={styles.actualSectionLabel}>SETS</Text>{result.strengthSets?.map(set => <View key={set.setNumber} style={styles.unitCard}>
    <View style={styles.unitTop}><Text style={styles.unitTitle}>Set {set.setNumber}</Text><Text style={styles.unitTarget}>{exercise.tracking.kind === 'strength' ? `${exercise.tracking.targetReps} rep target` : ''}</Text></View>
    <View style={styles.inputRow}><Field placeholder="Load" value={set.load} onChange={load => update(current => ({ ...current, strengthSets: current.strengthSets?.map(item => item.setNumber === set.setNumber ? { ...item, load } : item) }))} /><Field placeholder="Reps" value={set.reps} onChange={reps => update(current => ({ ...current, strengthSets: current.strengthSets?.map(item => item.setNumber === set.setNumber ? { ...item, reps } : item) }))} /><StatusButtons status={set.status} onChange={status => update(current => ({ ...current, strengthSets: current.strengthSets?.map(item => item.setNumber === set.setNumber ? { ...item, status } : item) }))} /></View>
  </View>)}<Pressable onPress={() => update(current => ({ ...current, strengthSets: [...(current.strengthSets ?? []), { setNumber: (current.strengthSets?.length ?? 0) + 1, status: 'pending' }] }))} style={styles.addUnitButton}><MaterialIcons name="add" size={16} color={palette.accent} /><Text style={styles.addUnitText}>Add set</Text></Pressable><ChangeReasonEditor result={result} update={update} /><TextInput value={result.notes} onChangeText={notes => update(current => ({ ...current, notes }))} placeholder="Load units or exercise note…" placeholderTextColor="#647382" style={styles.notesInput} /></Card>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg }, shell: { flex: 1, padding: 16, gap: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }, timerLabel: { color: palette.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 }, timer: { color: palette.text, fontSize: 34, lineHeight: 39, fontWeight: '900', fontVariant: ['tabular-nums'] }, title: { color: palette.muted, fontSize: 14, fontWeight: '800', marginTop: 2 }, close: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, progressText: { color: palette.muted, fontSize: 11, fontWeight: '800' }, track: { height: 5, borderRadius: 3, backgroundColor: palette.surface2, overflow: 'hidden' }, fill: { height: 5, backgroundColor: palette.accent },
  content: { gap: 15, paddingBottom: 12 }, snapshotNotice: { flexDirection: 'row', gap: 10, alignItems: 'center', borderStyle: 'dashed' }, snapshotTitle: { color: palette.text, fontSize: 13, fontWeight: '900' }, snapshotCopy: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 2 }, sectionWrap: { gap: 10 }, sectionTitle: { color: palette.text, fontSize: 19, fontWeight: '900' },
  conditionsCard: { gap: 12, borderColor: '#405020' }, conditionsHead: { flexDirection: 'row', gap: 10, alignItems: 'center' }, conditionsIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: palette.accentDark, alignItems: 'center', justifyContent: 'center' }, conditionsTitle: { color: palette.text, fontSize: 15, fontWeight: '900' }, conditionsCopy: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 2 }, conditionsEditor: { gap: 10 }, compactEditor: { gap: 8 }, conditionsValue: { color: palette.accent, fontSize: 11, fontWeight: '800' },
  exerciseCard: { gap: 10 }, exerciseHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, exerciseName: { color: palette.text, fontSize: 16, fontWeight: '900' }, plannedText: { color: palette.accent, fontSize: 10, fontWeight: '900', letterSpacing: 0.4, marginTop: 4 }, actualSectionLabel: { color: palette.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1 }, removeButton: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 5, paddingHorizontal: 7 }, removeText: { color: palette.red, fontSize: 10, fontWeight: '800' },
  completionRow: { flexDirection: 'row', gap: 11, alignItems: 'center', minHeight: 44, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 8 }, completionMain: { flex: 1, flexDirection: 'row', gap: 11, alignItems: 'center', minHeight: 44 }, check: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: '#526170', alignItems: 'center', justifyContent: 'center' }, checkDone: { backgroundColor: palette.accent, borderColor: palette.accent }, actualLabel: { color: palette.muted, fontSize: 12, fontWeight: '700' }, skipLink: { color: palette.muted, fontSize: 12, fontWeight: '800', padding: 8 }, skipLinkActive: { color: palette.red },
  unitCard: { backgroundColor: palette.surface2, borderRadius: 12, padding: 10, gap: 10 }, unitTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, unitTitle: { color: palette.text, fontSize: 12, fontWeight: '900' }, unitTarget: { color: palette.muted, fontSize: 10, fontWeight: '700' }, optionalTimeHint: { color: palette.muted, fontSize: 10, lineHeight: 14, marginTop: -2 }, inputRow: { flexDirection: 'row', gap: 7, alignItems: 'center' }, resultInput: { flex: 1, minWidth: 62, height: 39, borderRadius: 10, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, color: palette.text, paddingHorizontal: 9, fontSize: 12 }, statusButtons: { flexDirection: 'row', gap: 5 }, statusButton: { minHeight: 36, paddingHorizontal: 8, borderRadius: 9, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' }, statusButtonText: { color: palette.muted, fontSize: 10, fontWeight: '900' }, doneButton: { backgroundColor: palette.accent }, doneButtonText: { color: '#0B1000' }, skipButton: { backgroundColor: '#301719' }, skipButtonText: { color: palette.red }, notesInput: { minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: palette.border, color: palette.text, paddingHorizontal: 11, fontSize: 12 }, addUnitButton: { minHeight: 40, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }, addUnitText: { color: palette.accent, fontSize: 11, fontWeight: '900' },
  choiceChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 }, choiceChip: { minHeight: 34, borderRadius: 10, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }, choiceChipSelected: { borderColor: palette.accent, backgroundColor: palette.accentDark }, choiceChipText: { color: palette.muted, fontSize: 10, fontWeight: '800' }, choiceChipTextSelected: { color: palette.accent }, miniLabel: { color: palette.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 }, measuredRow: { flexDirection: 'row', alignItems: 'center', gap: 9 }, windOverrideButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 }, windOverrideText: { flex: 1, color: palette.muted, fontSize: 10, fontWeight: '800' }, overridePanel: { borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 10, gap: 5 }, reasonLink: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 34 }, reasonLinkText: { color: palette.muted, fontSize: 10, fontWeight: '800' }, reasonEditor: { borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 10, gap: 6 }, reasonHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, reasonInput: { minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface2, color: palette.text, paddingHorizontal: 10, fontSize: 12 }, clearText: { color: palette.muted, fontSize: 10, fontWeight: '800', textDecorationLine: 'underline' },
  addExerciseButton: { minHeight: 46, borderRadius: 13, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.border, backgroundColor: palette.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, addExerciseText: { color: palette.accent, fontSize: 12, fontWeight: '900' }, addCard: { gap: 12, borderStyle: 'dashed' }, addHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, addTitle: { color: palette.text, fontSize: 15, fontWeight: '900' }, addLabel: { color: palette.muted, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }, suggestionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, suggestionChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, backgroundColor: palette.surface2, paddingHorizontal: 10, paddingVertical: 9 }, suggestionText: { color: palette.text, fontSize: 11, fontWeight: '800' }, addInput: { minHeight: 45, borderRadius: 11, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface2, color: palette.text, paddingHorizontal: 12, fontSize: 13 },
  footer: { gap: 9 }, restBar: { minHeight: 55, borderRadius: 15, backgroundColor: palette.surface, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7 }, restLabel: { color: palette.muted, fontSize: 8, fontWeight: '900', letterSpacing: 0.7 }, restTime: { color: palette.text, fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] }, restAction: { color: palette.muted, fontSize: 10, fontWeight: '800' }, adjust: { color: palette.accent, fontSize: 10, fontWeight: '900' }, restStart: { backgroundColor: palette.accentDark, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 11 }, restStartText: { color: palette.accent, fontSize: 10, fontWeight: '900' },
});
