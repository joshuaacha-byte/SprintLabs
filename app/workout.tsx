import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { PrimaryButton } from '@/components/sprint-ui';
import { sectionIconName } from '@/utils/workout-icons';
import { Palette, useTheme } from '@/constants/sprintlab';
import { exerciseSuggestions } from '@/data/workouts';
import {
  ActiveWorkoutSession,
  ActualExerciseResult,
  PlannedExercise,
  RepFeeling,
  ResultChangeReason,
  ResultStatus,
  RestTimerState,
} from '@/types';
import {
  clearActiveWorkoutSession,
  getActiveWorkoutSession,
  saveActiveWorkoutSession,
} from '@/utils/storage';
import {
  createExerciseResult,
  deriveExerciseStatus,
  inferTracking,
  withDerivedStatuses,
} from '@/utils/workout-session';
import {
  addRestSeconds,
  createRestTimer,
  finishRestTimer,
  pauseRestTimer,
  restRemainingSeconds,
  startRestTimer,
} from '@/utils/rest-timer';
import {
  completeStep,
  hapticComplete,
  hapticSuccess,
  hapticTimerToggle,
  hapticWarning,
  selection,
  tap,
  warning,
} from '@/utils/haptics';

const MAX_ELAPSED = 6 * 60 * 60;
const CHANGE_REASONS: { value: ResultChangeReason; label: string }[] = [
  { value: 'tightness-or-pain', label: 'Pain or tightness' },
  { value: 'fatigue', label: 'Fatigue' },
  { value: 'coach-adjustment', label: 'Coach adjustment' },
  { value: 'weather', label: 'Weather' },
  { value: 'equipment-or-space', label: 'Equipment or space' },
  { value: 'time-or-schedule', label: 'Time or schedule' },
  { value: 'other', label: 'Other' },
];

const formatClock = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const prescription = (exercise: PlannedExercise) => {
  if (exercise.prescriptionOverride) return exercise.prescriptionOverride;
  const tracking = exercise.tracking;
  if (tracking.kind === 'track') {
    return [
      `${tracking.reps} ${tracking.reps === 1 ? 'rep' : 'reps'}`,
      tracking.distanceMeters ? `${tracking.distanceMeters}m` : null,
      tracking.targetIntensity ? `${tracking.targetIntensity}%` : null,
    ].filter(Boolean).join(' · ');
  }
  if (tracking.kind === 'strength') return `${tracking.sets} × ${tracking.targetReps}`;
  return exercise.detail || 'Complete once';
};

const restLabel = (exercise: PlannedExercise) => {
  const tracking = exercise.tracking;
  if (tracking.kind !== 'track' && tracking.kind !== 'strength') return null;
  if (!tracking.restSeconds) return null;
  if (tracking.restSeconds >= 60 && tracking.restSeconds % 60 === 0) {
    return `${tracking.restSeconds / 60} min rest`;
  }
  return `${tracking.restSeconds}s rest`;
};

const resultUnits = (result: ActualExerciseResult) =>
  result.trackReps ?? result.strengthSets ?? [{ status: result.status }];

const resultCounts = (result: ActualExerciseResult) => {
  const units = resultUnits(result);
  return {
    completed: units.filter(unit => unit.status === 'completed').length,
    resolved: units.filter(unit => unit.status !== 'pending').length,
    total: units.length,
  };
};

function NumberInput({
  value,
  placeholder,
  onChange,
  accessibilityLabel,
}: {
  value?: number;
  placeholder: string;
  onChange: (value?: number) => void;
  accessibilityLabel: string;
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => setText(value === undefined ? '' : String(value)), [value]);
  return <TextInput
    accessibilityLabel={accessibilityLabel}
    value={text}
    onChangeText={next => {
      setText(next);
      const parsed = Number(next);
      onChange(next.trim() && Number.isFinite(parsed) ? parsed : undefined);
    }}
    keyboardType="decimal-pad"
    placeholder={placeholder}
    placeholderTextColor={palette.muted}
    style={styles.numberInput}
    selectTextOnFocus
  />;
}

/** Practical rest durations the athlete can pick from — not derived from any workout, plan, or
 * exercise data. Purely a manual convenience list. */
const REST_PRESETS_SECONDS = [30, 60, 90, 120, 180, 300];
const formatPresetLabel = (seconds: number) => seconds < 60 ? `${seconds} sec` : `${Math.round(seconds / 60)} min`;

/** The athlete deliberately opens this — never triggered by completing a rep, set, or exercise.
 * Picking a duration starts the timer immediately (there is no separate "not started" state to
 * opt into; choosing the duration IS the opt-in). */
function RestPresetPicker({ palette, styles, onPick, onCancel }: {
  palette: Palette;
  styles: ReturnType<typeof createStyles>;
  onPick: (seconds: number) => void;
  onCancel: () => void;
}) {
  return <View style={styles.restCard}>
    <View style={styles.restHead}>
      <MaterialIcons name="timer" size={16} color={palette.accent} />
      <Text style={styles.restEyebrow}>REST TIMER</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Cancel rest timer" onPress={onCancel} hitSlop={8}>
        <MaterialIcons name="close" size={16} color={palette.muted} />
      </Pressable>
    </View>
    <View style={styles.restPresetRow}>{REST_PRESETS_SECONDS.map(seconds => <Pressable
      key={seconds}
      accessibilityRole="button"
      accessibilityLabel={`Start ${formatPresetLabel(seconds)} rest timer`}
      onPress={() => onPick(seconds)}
      style={styles.restPresetChip}
    >
      <Text style={styles.restPresetChipText}>{formatPresetLabel(seconds)}</Text>
    </Pressable>)}</View>
  </View>;
}

/** The rest countdown — always derived from restRemainingSeconds(restTimer, now), never a locally
 * decremented number, so it reads correctly on the very first render after the app was backgrounded
 * or the phone was locked. Only two states once created: running/paused (large live countdown), and
 * finished (frozen at zero until dismissed) — the timer is already running the moment it exists. */
function RestCard({ restTimer, now, palette, styles, onStartPause, onAddSeconds, onDismiss }: {
  restTimer: RestTimerState;
  now: number;
  palette: Palette;
  styles: ReturnType<typeof createStyles>;
  onStartPause: () => void;
  onAddSeconds: () => void;
  onDismiss: () => void;
}) {
  const remaining = restRemainingSeconds(restTimer, now);
  const finished = !restTimer.running && remaining <= 0;

  return <View style={styles.restCard}>
    <View style={styles.restHead}>
      <MaterialIcons name="timer" size={16} color={palette.accent} />
      <Text style={styles.restEyebrow}>{finished ? 'REST COMPLETE' : 'REST'}</Text>
    </View>
    <Text style={styles.restClock}>{formatClock(remaining)}</Text>
    {finished ? (
      <Pressable accessibilityRole="button" onPress={onDismiss} style={styles.restPrimaryButton}>
        <Text style={styles.restPrimaryButtonText}>Continue</Text>
      </Pressable>
    ) : (
      <View style={styles.restControlsRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Add 30 seconds" onPress={onAddSeconds} style={styles.restTextControl}>
          <Text style={styles.restTextControlLabel}>+30 sec</Text>
        </Pressable>
        <Text style={styles.restControlDot}>·</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={restTimer.running ? 'Pause rest timer' : 'Resume rest timer'} onPress={onStartPause} style={styles.restTextControl}>
          <Text style={styles.restTextControlLabel}>{restTimer.running ? 'Pause' : 'Resume'}</Text>
        </Pressable>
        <Text style={styles.restControlDot}>·</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Skip rest" onPress={onDismiss} style={styles.restTextControl}>
          <Text style={styles.restTextControlLabel}>Skip</Text>
        </Pressable>
      </View>
    )}
  </View>;
}

function DoneControl({ status, onPress, label }: { status: ResultStatus; onPress: () => void; label: string }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <Pressable
    accessibilityRole="checkbox"
    accessibilityLabel={label}
    accessibilityState={{ checked: status === 'completed' }}
    onPress={onPress}
    hitSlop={8}
    style={[styles.doneCircle, status === 'completed' && styles.doneCircleActive, status === 'skipped' && styles.doneCircleSkipped]}
  >
    {status === 'completed' ? <MaterialIcons name="check" size={20} color="#080D12" /> : null}
    {status === 'skipped' ? <MaterialIcons name="remove" size={18} color={palette.muted} /> : null}
  </Pressable>;
}

type ExerciseCompletionState = 'pending' | 'partial' | 'completed' | 'skipped';

function ExerciseCompletionControl({
  state,
  onPress,
  label,
}: {
  state: ExerciseCompletionState;
  onPress: () => void;
  label: string;
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: state === 'partial' ? 'mixed' : state === 'completed' }}
      onPress={onPress}
      style={[
        styles.exerciseDoneButton,
        state === 'completed' && styles.exerciseDoneButtonActive,
        state === 'partial' && styles.exerciseDoneButtonPartial,
        state === 'skipped' && styles.exerciseDoneButtonSkipped,
      ]}
    >
      {state === 'completed' ? <MaterialIcons name="check" size={25} color="#080D12" /> : null}
      {state === 'partial' ? <View style={styles.exerciseDonePartialMark} /> : null}
      {state === 'skipped' ? <MaterialIcons name="remove" size={22} color={palette.muted} /> : null}
    </Pressable>
  );
}

export default function WorkoutScreen() {
  const router = useRouter();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [session, setSession] = useState<ActiveWorkoutSession | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  // Not the rest timer's source of truth (that's session.restTimer, persisted) — purely a render
  // pulse so the countdown, which is always recomputed from restTimer.endsAt vs. this timestamp,
  // visibly ticks once a second while running.
  const [restNow, setRestNow] = useState(() => Date.now());
  // Local-only UI state for the manual duration-preset picker — never persisted, never derived
  // from any exercise/workout/plan data.
  const [restPickerOpen, setRestPickerOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ exerciseId: string; unit: number } | null>(null);
  const [menuResult, setMenuResult] = useState<ActualExerciseResult | null>(null);
  const [editor, setEditor] = useState<'note' | 'prescription' | 'add' | 'replace' | null>(null);
  const [editorText, setEditorText] = useState('');

  useFocusEffect(useCallback(() => {
    getActiveWorkoutSession().then(value => {
      if (!value) {
        router.replace('/');
        return;
      }
      const hasRecordedWork = value.elapsedSeconds > 0 || value.actualResults.some(result =>
        result.status !== 'pending'
        || result.trackReps?.some(rep => rep.status !== 'pending' || rep.timeSeconds !== undefined)
        || result.strengthSets?.some(set => set.status !== 'pending' || set.load !== undefined || set.reps !== undefined),
      );
      const hydrated = !value.executionStartedAt && hasRecordedWork
        ? { ...value, executionStartedAt: value.startedAt }
        : value;
      if (hydrated !== value) void saveActiveWorkoutSession(hydrated);
      setSession(hydrated);
      setExpandedId(current => current ?? hydrated.actualResults[0]?.exerciseId ?? null);
      if (hydrated.executionStartedAt) {
        const wall = Math.floor((Date.now() - new Date(hydrated.executionStartedAt).getTime()) / 1000);
        setElapsed(Math.min(MAX_ELAPSED, Math.max(hydrated.elapsedSeconds, wall)));
      } else {
        setElapsed(hydrated.elapsedSeconds);
      }
    });
  }, [router]));

  const updateSession = (change: (current: ActiveWorkoutSession) => ActiveWorkoutSession) => {
    setSession(current => {
      if (!current) return current;
      const next = withDerivedStatuses(change(current));
      void saveActiveWorkoutSession(next);
      return next;
    });
  };

  const executionStartedAt = session?.executionStartedAt;
  useEffect(() => {
    if (!executionStartedAt) return;
    const tick = () => {
      const wall = Math.floor((Date.now() - new Date(executionStartedAt).getTime()) / 1000);
      setElapsed(Math.min(MAX_ELAPSED, wall));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [executionStartedAt]);

  const restTimer = session?.restTimer;
  useEffect(() => {
    if (!restTimer?.running) return;
    const tick = () => {
      const now = Date.now();
      setRestNow(now);
      if (restRemainingSeconds(restTimer, now) <= 0) {
        hapticSuccess();
        // Freeze at zero rather than clearing it, so the athlete sees a clear "rest complete"
        // state instead of the strip silently vanishing — dismissed only by their own tap.
        updateSession(current => current.restTimer
          ? { ...current, restTimer: finishRestTimer(current.restTimer) }
          : current);
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restTimer?.running, restTimer?.endsAt]);

  const updateResult = (exerciseId: string, change: (result: ActualExerciseResult) => ActualExerciseResult) => {
    updateSession(current => ({
      ...current,
      actualResults: current.actualResults.map(result =>
        result.exerciseId === exerciseId ? change(result) : result),
    }));
  };

  const totalProgress = useMemo(() => {
    if (!session) return { completed: 0, resolved: 0, total: 0 };
    return session.actualResults.reduce((sum, result) => {
      const counts = resultCounts(result);
      return {
        completed: sum.completed + counts.completed,
        resolved: sum.resolved + counts.resolved,
        total: sum.total + counts.total,
      };
    }, { completed: 0, resolved: 0, total: 0 });
  }, [session]);

  const groupedResults = useMemo(() => {
    if (!session) return [];
    const sectionOrder = session.plannedWorkoutSnapshot.sections.map(section => section.title);
    const titles = [...sectionOrder, ...session.actualResults.map(result => result.sectionTitle)]
      .filter((title, index, all) => all.indexOf(title) === index);
    return titles.map(title => ({
      title,
      results: session.actualResults.filter(result => result.sectionTitle === title),
    })).filter(section => section.results.length);
  }, [session]);

  if (!session) return <SafeAreaView style={styles.safe} />;

  const findExercise = (result: ActualExerciseResult) =>
    result.exerciseSnapshot
    ?? session.plannedWorkoutSnapshot.sections.flatMap(section => section.exercises)
      .find(exercise => exercise.id === result.exerciseId);

  const startWorkout = () => {
    const now = new Date().toISOString();
    completeStep();
    updateSession(current => ({
      ...current,
      startedAt: now,
      executionStartedAt: now,
      elapsedSeconds: 0,
    }));
    setElapsed(0);
    setExpandedId(session.actualResults[0]?.exerciseId ?? null);
  };

  const leave = () => {
    tap();
    updateSession(current => ({ ...current, elapsedSeconds: elapsed }));
    router.back();
  };

  const cancelWorkout = () => Alert.alert(
    'Discard this workout?',
    'The active session and anything entered here will be removed.',
    [
      { text: 'Keep workout', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          hapticWarning();
          await clearActiveWorkoutSession();
          router.replace('/');
        },
      },
    ],
  );

  // A secondary, always-available way out of an in-progress workout — deliberately not gated on
  // finishing every exercise. Real training gets cut short for real reasons; SprintLab should
  // record whatever actually happened rather than push the athlete to fake completion just to
  // exit. Unlike cancelWorkout (which discards everything), this keeps every recorded result and
  // routes through the same review screen the normal "Finish" path uses, so nothing is
  // fabricated and nothing completed is lost.
  const endWorkoutEarly = () => Alert.alert(
    'End this workout now?',
    'Whatever you’ve completed so far will be saved. Anything not marked will be recorded as not completed.',
    [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'End workout',
        onPress: () => {
          tap();
          updateSession(current => ({ ...current, elapsedSeconds: elapsed }));
          router.push('/log');
        },
      },
    ],
  );

  // Manual, athlete-initiated only — never called from rep/set/exercise completion. Refuses to
  // create a second timer while one is already active, so only one can ever run at once.
  const startRest = (seconds: number) => {
    if (session?.restTimer) return;
    hapticTimerToggle();
    updateSession(current => ({ ...current, restTimer: startRestTimer(createRestTimer(seconds, '')) }));
    setRestPickerOpen(false);
  };

  // The rest timer is entirely athlete-initiated (see restPickerOpen / startRest below) — marking
  // a rep or set complete never touches it. This also guarantees a single rest timer can ever
  // exist: startRest() itself refuses to create a second one while one is already active.
  const markTrackRep = (result: ActualExerciseResult, repNumber: number) => {
    const rep = result.trackReps?.find(item => item.repNumber === repNumber);
    const nextStatus: ResultStatus = rep?.status === 'completed' ? 'pending' : 'completed';
    if (nextStatus === 'completed') {
      hapticComplete();
      setFeedback({ exerciseId: result.exerciseId, unit: repNumber });
    }
    updateResult(result.exerciseId, current => ({
      ...current,
      trackReps: current.trackReps?.map(item =>
        item.repNumber === repNumber ? { ...item, status: nextStatus } : item),
    }));
  };

  const markStrengthSet = (result: ActualExerciseResult, setNumber: number) => {
    const set = result.strengthSets?.find(item => item.setNumber === setNumber);
    const nextStatus: ResultStatus = set?.status === 'completed' ? 'pending' : 'completed';
    if (nextStatus === 'completed') hapticComplete();
    updateResult(result.exerciseId, current => {
      const first = current.strengthSets?.[0];
      return {
        ...current,
        strengthSets: current.strengthSets?.map(item => {
          if (item.setNumber === setNumber) return { ...item, status: nextStatus };
          if (setNumber === 1 && item.setNumber > 1) {
            return { ...item, load: item.load ?? first?.load, reps: item.reps ?? first?.reps };
          }
          return item;
        }),
      };
    });
  };

  const markCompletion = (result: ActualExerciseResult) => {
    if (result.status === 'completed') selection();
    else completeStep();
    updateResult(result.exerciseId, current => ({
      ...current,
      status: current.status === 'completed' ? 'pending' : 'completed',
    }));
  };

  const exerciseCompletionState = (result: ActualExerciseResult): ExerciseCompletionState => {
    const counts = resultCounts(result);
    const derived = deriveExerciseStatus(result);
    if (derived === 'completed') return 'completed';
    if (derived === 'skipped') return 'skipped';
    if (counts.resolved > 0) return 'partial';
    return 'pending';
  };

  const toggleWholeExercise = (result: ActualExerciseResult) => {
    const currentlyComplete = deriveExerciseStatus(result) === 'completed';
    if (currentlyComplete) selection();
    else completeStep();

    updateResult(result.exerciseId, current => {
      if (currentlyComplete) {
        const snapshot = current.quickCompletionSnapshot;
        return {
          ...current,
          status: snapshot?.status ?? 'pending',
          trackReps: current.trackReps?.map((rep, index) => ({
            ...rep,
            status: snapshot?.trackRepStatuses?.[index] ?? 'pending',
          })),
          strengthSets: current.strengthSets?.map((set, index) => ({
            ...set,
            status: snapshot?.strengthSetStatuses?.[index] ?? 'pending',
          })),
          quickCompletionSnapshot: undefined,
        };
      }

      return {
        ...current,
        status: 'completed',
        trackReps: current.trackReps?.map(rep => ({ ...rep, status: 'completed' })),
        strengthSets: current.strengthSets?.map(set => ({ ...set, status: 'completed' })),
        quickCompletionSnapshot: {
          status: current.status,
          trackRepStatuses: current.trackReps?.map(rep => rep.status),
          strengthSetStatuses: current.strengthSets?.map(set => set.status),
        },
      };
    });
  };

  const setFeeling = (result: ActualExerciseResult, repNumber: number, feeling: RepFeeling) => {
    if (feeling === 'tight') warning();
    else selection();
    updateResult(result.exerciseId, current => ({
      ...current,
      trackReps: current.trackReps?.map(rep =>
        rep.repNumber === repNumber ? { ...rep, feeling } : rep),
    }));
    setFeedback(null);
    if (feeling === 'tight') {
      Alert.alert(
        'Pain or tightness recorded',
        'Modify the exercise, stop and review the workout, or keep monitoring how you feel.',
        [
          { text: 'Keep monitoring', style: 'cancel' },
          { text: 'Modify exercise', onPress: () => setMenuResult(result) },
          {
            text: 'Stop and review',
            style: 'destructive',
            onPress: () => {
              updateSession(current => ({ ...current, elapsedSeconds: elapsed }));
              router.push('/log');
            },
          },
        ],
      );
    }
  };

  const firstIncomplete = session.actualResults.find(result => resultCounts(result).resolved < resultCounts(result).total);
  const expandedResult = session.actualResults.find(result => result.exerciseId === expandedId);
  const currentUnfinished = expandedResult
    ? resultCounts(expandedResult).resolved < resultCounts(expandedResult).total
    : false;
  const bottomTitle = totalProgress.resolved === totalProgress.total
    ? 'Review workout'
    : currentUnfinished
      ? 'Complete current exercise'
      : 'Next incomplete exercise';
  const bottomDisabled = currentUnfinished && totalProgress.resolved !== totalProgress.total;

  const bottomAction = () => {
    if (totalProgress.resolved === totalProgress.total) {
      tap();
      updateSession(current => ({ ...current, elapsedSeconds: elapsed }));
      router.push('/log');
      return;
    }
    if (firstIncomplete) {
      tap();
      setExpandedId(firstIncomplete.exerciseId);
    }
  };

  const showReasonMenu = (result: ActualExerciseResult, skip = false) => {
    Alert.alert(
      skip ? 'Why was this skipped?' : 'Why did this change?',
      undefined,
      [
        ...CHANGE_REASONS.map(reason => ({
          text: reason.label,
          onPress: () => {
            if (skip) hapticWarning();
            else completeStep();
            updateResult(result.exerciseId, current => ({
              ...current,
              status: skip ? 'skipped' : current.status,
              changeReason: reason.value,
              trackReps: skip ? current.trackReps?.map(rep => ({ ...rep, status: 'skipped' as ResultStatus })) : current.trackReps,
              strengthSets: skip ? current.strengthSets?.map(set => ({ ...set, status: 'skipped' as ResultStatus })) : current.strengthSets,
            }));
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const addExercise = (sectionTitle: string, raw: Omit<PlannedExercise, 'id'>) => {
    const exercise: PlannedExercise = {
      ...raw,
      id: `added-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    completeStep();
    updateSession(current => ({
      ...current,
      actualResults: [...current.actualResults, createExerciseResult(sectionTitle, exercise, 'added')],
    }));
    setMenuResult(null);
    setEditor(null);
    setExpandedId(exercise.id);
  };

  const replaceExercise = (result: ActualExerciseResult, raw: Omit<PlannedExercise, 'id'>) => {
    const exercise: PlannedExercise = { ...raw, id: result.exerciseId };
    const replacement = createExerciseResult(result.sectionTitle, exercise, result.origin ?? 'planned');
    updateSession(current => ({
      ...current,
      actualResults: current.actualResults.map(item =>
        item.exerciseId === result.exerciseId ? replacement : item),
    }));
    completeStep();
    setMenuResult(null);
    setEditor(null);
  };

  const saveEditor = () => {
    if (!menuResult) return;
    if (editor === 'note') {
      updateResult(menuResult.exerciseId, current => ({ ...current, notes: editorText.trim() }));
    } else if (editor === 'prescription') {
      updateResult(menuResult.exerciseId, current => {
        const existing = current.exerciseSnapshot
          ?? session.plannedWorkoutSnapshot.sections
            .flatMap(section => section.exercises)
            .find(exercise => exercise.id === current.exerciseId);
        if (!existing) return current;
        return {
          ...current,
          exerciseSnapshot: {
            ...existing,
            prescriptionOverride: editorText.trim(),
          },
        };
      });
    } else if (editor === 'add' && editorText.trim()) {
      addExercise(menuResult.sectionTitle, {
        name: editorText.trim(),
        detail: 'Added during workout',
        tracking: inferTracking(menuResult.sectionTitle, ''),
      });
      return;
    }
    completeStep();
    setEditor(null);
    setMenuResult(null);
  };

  if (!session.executionStartedAt) {
    const exerciseCount = session.actualResults.length;
    return <SafeAreaView style={styles.safe}>
      <View style={styles.shell}>
        <View style={styles.overviewHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close workout overview" onPress={leave} style={styles.iconButton}>
            <MaterialIcons name="close" size={24} color={palette.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Workout</Text>
          <View style={styles.iconButtonPlaceholder} />
        </View>
        <ScrollView contentContainerStyle={styles.overviewContent} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <Text style={styles.overviewTitle}>{session.plannedWorkoutSnapshot.title}</Text>
            <Text style={styles.overviewPurpose}>{session.plannedWorkoutSnapshot.purpose}</Text>
            <View style={styles.metaRow}>
              <View style={styles.metaPill}><MaterialIcons name="schedule" size={16} color={palette.muted} /><Text style={styles.metaText}>{session.plannedWorkoutSnapshot.durationMinutes} min</Text></View>
              <View style={styles.metaPill}><MaterialIcons name="format-list-bulleted" size={16} color={palette.muted} /><Text style={styles.metaText}>{exerciseCount} exercises</Text></View>
            </View>
          </View>
          {groupedResults.map(section => <View key={section.title} style={styles.overviewSection}>
            <Text style={styles.sectionLabel}>{section.title}</Text>
            <View style={styles.overviewList}>
              {section.results.map(result => {
                const exercise = findExercise(result);
                if (!exercise) return null;
                return <View key={result.exerciseId} style={styles.overviewRow}>
                  <View style={styles.categoryIcon}><MaterialIcons name={sectionIconName(section.title)} size={18} color={palette.accent} /></View>
                  <View style={styles.rowCopy}>
                    <Text style={styles.overviewExercise}>{exercise.name}</Text>
                    <Text style={styles.overviewPrescription}>{prescription(exercise)}{restLabel(exercise) ? ` · ${restLabel(exercise)}` : ''}</Text>
                    {exercise.cue ? <Text numberOfLines={1} style={styles.overviewCue}>{exercise.cue}</Text> : null}
                  </View>
                </View>;
              })}
            </View>
          </View>)}
        </ScrollView>
        <View style={styles.singleFooter}><PrimaryButton title="Start workout" onPress={startWorkout} /></View>
      </View>
    </SafeAreaView>;
  }

  return <SafeAreaView style={styles.safe}>
    <View style={styles.shell}>
      <View style={styles.activeHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close workout" onPress={leave} onLongPress={cancelWorkout} style={styles.iconButton}>
          <MaterialIcons name="close" size={24} color={palette.text} />
        </Pressable>
        <View style={styles.activeHeaderCopy}>
          <Text style={styles.headerTitle}>Workout</Text>
          <Text style={styles.elapsed}>{formatClock(elapsed)}</Text>
        </View>
        <View style={styles.progressCopy}>
          <Text style={styles.progressValue}>{totalProgress.completed} of {totalProgress.total}</Text>
          <Text style={styles.progressLabel}>complete</Text>
        </View>
      </View>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${totalProgress.total ? totalProgress.completed / totalProgress.total * 100 : 0}%` }]} /></View>

      <ScrollView contentContainerStyle={styles.activeContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {groupedResults.map(section => <View key={section.title} style={styles.activeSection}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionLabel}>{section.title}</Text>
            {section.results.every(result => deriveExerciseStatus(result) !== 'pending')
              ? <MaterialIcons name="check-circle" size={17} color={palette.accent} />
              : null}
          </View>
          {section.results.map(result => {
            const exercise = findExercise(result);
            if (!exercise) return null;
            const counts = resultCounts(result);
            const expanded = expandedId === result.exerciseId;
            const completionState = exerciseCompletionState(result);
            return <View key={result.exerciseId} style={[styles.exerciseCard, deriveExerciseStatus(result) === 'completed' && styles.exerciseCardComplete]}>
              <View style={styles.exerciseHead}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${exercise.name}, ${counts.completed} of ${counts.total} complete. ${expanded ? 'Collapse' : 'Expand'} details`}
                  accessibilityState={{ expanded }}
                  onPress={() => { tap(); setExpandedId(expanded ? null : result.exerciseId); }}
                  style={styles.exerciseExpandArea}
                >
                  <View style={styles.rowCopy}>
                  <View style={styles.exerciseNameRow}>
                    <Text style={styles.exerciseName}>{exercise.name}</Text>
                    {restLabel(exercise) ? <Text style={styles.inlineRest}>{restLabel(exercise)}</Text> : null}
                  </View>
                  <Text style={styles.exercisePrescription}>{prescription(exercise)}</Text>
                  {exercise.cue ? <Text numberOfLines={1} style={styles.exerciseCue}>{exercise.cue}</Text> : null}
                  <Text style={styles.exerciseCount}>{counts.completed} of {counts.total} complete</Text>
                  </View>
                </Pressable>
                <ExerciseCompletionControl
                  state={completionState}
                  label={completionState === 'completed'
                    ? `Undo completion for ${exercise.name}`
                    : `Mark all of ${exercise.name} complete`}
                  onPress={() => toggleWholeExercise(result)}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${exercise.name} details`}
                  accessibilityState={{ expanded }}
                  onPress={() => { tap(); setExpandedId(expanded ? null : result.exerciseId); }}
                  style={styles.chevronButton}
                >
                  <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={24} color={palette.muted} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`More options for ${exercise.name}`}
                  onPress={() => {
                    tap();
                    setMenuResult(result);
                    setEditor(null);
                  }}
                  style={styles.moreButton}
                >
                  <MaterialIcons name="more-horiz" size={22} color={palette.muted} />
                </Pressable>
              </View>

              {expanded ? <View style={styles.expandedBody}>
                {result.trackingKind === 'track' ? <>
                  <View style={styles.unitHeader}>
                    <Text style={[styles.unitHeaderText, styles.repColumn]}>REP</Text>
                    <Text style={[styles.unitHeaderText, styles.distanceColumn]}>DISTANCE</Text>
                    <Text style={[styles.unitHeaderText, styles.inputColumn]}>TIME · OPTIONAL</Text>
                    <Text style={styles.doneHeader}>DONE</Text>
                  </View>
                  {result.trackReps?.map(rep => <View key={rep.repNumber}>
                    <View style={styles.unitRow}>
                      <Text style={[styles.unitValue, styles.repColumn]}>{rep.repNumber}</Text>
                      <Text style={[styles.unitValue, styles.distanceColumn]}>{rep.plannedDistanceMeters ? `${rep.plannedDistanceMeters}m` : '—'}</Text>
                      <View style={styles.inputColumn}><NumberInput value={rep.timeSeconds} placeholder="—" accessibilityLabel={`Optional time for rep ${rep.repNumber} in seconds`} onChange={timeSeconds => updateResult(result.exerciseId, current => ({
                        ...current,
                        trackReps: current.trackReps?.map(item => item.repNumber === rep.repNumber ? { ...item, timeSeconds } : item),
                      }))} /></View>
                      <DoneControl status={rep.status} label={`Mark rep ${rep.repNumber} complete`} onPress={() => markTrackRep(result, rep.repNumber)} />
                    </View>
                    {feedback?.exerciseId === result.exerciseId && feedback.unit === rep.repNumber ? <View style={styles.feedbackRow}>
                      <Text style={styles.feedbackLabel}>How did it feel?</Text>
                      <Pressable onPress={() => setFeeling(result, rep.repNumber, 'smooth')} style={styles.feedbackChip}><Text style={styles.feedbackText}>Good</Text></Pressable>
                      <Pressable onPress={() => setFeeling(result, rep.repNumber, 'flat')} style={styles.feedbackChip}><Text style={styles.feedbackText}>Off</Text></Pressable>
                      <Pressable onPress={() => setFeeling(result, rep.repNumber, 'tight')} style={[styles.feedbackChip, styles.feedbackWarning]}><Text style={styles.feedbackWarningText}>Pain / tightness</Text></Pressable>
                      <Pressable accessibilityLabel="Dismiss rep feedback" onPress={() => { tap(); setFeedback(null); }} hitSlop={8}><MaterialIcons name="close" size={17} color={palette.muted} /></Pressable>
                    </View> : null}
                  </View>)}
                </> : null}

                {result.trackingKind === 'strength' ? <>
                  <View style={styles.unitHeader}>
                    <Text style={[styles.unitHeaderText, styles.repColumn]}>SET</Text>
                    <Text style={[styles.unitHeaderText, styles.inputColumn]}>WEIGHT</Text>
                    <Text style={[styles.unitHeaderText, styles.inputColumn]}>REPS</Text>
                    <Text style={styles.doneHeader}>DONE</Text>
                  </View>
                  {result.strengthSets?.map(set => <View key={set.setNumber} style={styles.unitRow}>
                    <Text style={[styles.unitValue, styles.repColumn]}>{set.setNumber}</Text>
                    <View style={styles.inputColumn}><NumberInput value={set.load} placeholder="—" accessibilityLabel={`Weight for set ${set.setNumber}`} onChange={load => updateResult(result.exerciseId, current => ({
                      ...current,
                      strengthSets: current.strengthSets?.map(item => {
                        if (item.setNumber === set.setNumber) return { ...item, load };
                        if (set.setNumber === 1 && item.setNumber > 1 && item.load === undefined) return { ...item, load };
                        return item;
                      }),
                    }))} /></View>
                    <View style={styles.inputColumn}><NumberInput value={set.reps} placeholder="—" accessibilityLabel={`Reps for set ${set.setNumber}`} onChange={reps => updateResult(result.exerciseId, current => ({
                      ...current,
                      strengthSets: current.strengthSets?.map(item => {
                        if (item.setNumber === set.setNumber) return { ...item, reps };
                        if (set.setNumber === 1 && item.setNumber > 1 && item.reps === undefined) return { ...item, reps };
                        return item;
                      }),
                    }))} /></View>
                    <DoneControl status={set.status} label={`Mark set ${set.setNumber} complete`} onPress={() => markStrengthSet(result, set.setNumber)} />
                  </View>)}
                </> : null}

                {result.trackingKind === 'completion' ? <View style={styles.blockRow}>
                  <View style={styles.blockIcon}><MaterialIcons name={sectionIconName(result.sectionTitle)} size={20} color={palette.accent} /></View>
                  <View style={styles.rowCopy}>
                    <Text style={styles.blockTitle}>{exercise.detail || 'Complete this block'}</Text>
                    {exercise.cue ? <Text style={styles.blockCue}>{exercise.cue}</Text> : null}
                  </View>
                  <DoneControl status={result.status} label={`Mark ${exercise.name} complete`} onPress={() => markCompletion(result)} />
                </View> : null}

                {result.notes ? <View style={styles.noteRow}><MaterialIcons name="notes" size={16} color={palette.muted} /><Text style={styles.noteText}>{result.notes}</Text></View> : null}
                {result.changeReason ? <Text style={styles.changeText}>Modified · {CHANGE_REASONS.find(reason => reason.value === result.changeReason)?.label}</Text> : null}
              </View> : null}
            </View>;
          })}
        </View>)}
      </ScrollView>

      <View style={styles.activeFooter}>
        {restTimer ? <RestCard
          restTimer={restTimer}
          now={restNow}
          palette={palette}
          styles={styles}
          onStartPause={() => {
            hapticTimerToggle();
            updateSession(current => current.restTimer
              ? { ...current, restTimer: current.restTimer.running ? pauseRestTimer(current.restTimer) : startRestTimer(current.restTimer) }
              : current);
          }}
          onAddSeconds={() => {
            tap();
            updateSession(current => current.restTimer ? { ...current, restTimer: addRestSeconds(current.restTimer, 30) } : current);
          }}
          onDismiss={() => {
            tap();
            updateSession(current => ({ ...current, restTimer: null }));
          }}
        /> : restPickerOpen ? <RestPresetPicker
          palette={palette}
          styles={styles}
          onPick={startRest}
          onCancel={() => { tap(); setRestPickerOpen(false); }}
        /> : <Pressable accessibilityRole="button" accessibilityLabel="Open rest timer" onPress={() => { tap(); setRestPickerOpen(true); }} style={styles.restOpenButton}>
          <MaterialIcons name="timer" size={16} color={palette.accent} />
          <Text style={styles.restOpenButtonText}>Rest timer</Text>
        </Pressable>}
        <PrimaryButton title={bottomTitle} onPress={bottomAction} disabled={bottomDisabled} />
        {totalProgress.resolved !== totalProgress.total ? <Pressable accessibilityRole="button" onPress={endWorkoutEarly} style={styles.endEarlyLink}>
          <Text style={styles.endEarlyLinkText}>End workout early</Text>
        </Pressable> : null}
      </View>
    </View>

    <Modal visible={Boolean(menuResult)} transparent animationType="fade" onRequestClose={() => { tap(); setMenuResult(null); }}>
      <Pressable style={styles.modalBackdrop} onPress={() => { tap(); setMenuResult(null); }}>
        <Pressable style={styles.menuSheet} onPress={event => event.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.menuTitle}>{menuResult ? findExercise(menuResult)?.name : ''}</Text>
          {editor ? <View style={styles.editorWrap}>
            {editor === 'replace' ? <>
              <Text style={styles.editorLabel}>Choose a replacement</Text>
              {(exerciseSuggestions[menuResult?.sectionTitle ?? ''] ?? []).slice(0, 6).map((suggestion, index) => <Pressable key={`${suggestion.name}-${index}`} style={styles.suggestionRow} onPress={() => menuResult && replaceExercise(menuResult, suggestion)}>
                <Text style={styles.suggestionName}>{suggestion.name}</Text>
                <Text style={styles.suggestionDetail}>{suggestion.detail}</Text>
              </Pressable>)}
            </> : <>
              <Text style={styles.editorLabel}>{editor === 'note' ? 'Exercise note' : editor === 'add' ? `Add to ${menuResult?.sectionTitle}` : 'Prescription'}</Text>
              <TextInput
                autoFocus
                multiline={editor === 'note'}
                value={editorText}
                onChangeText={setEditorText}
                placeholder={editor === 'add' ? 'Exercise name' : 'Type here'}
                placeholderTextColor={palette.muted}
                style={[styles.editorInput, editor === 'note' && styles.editorInputMultiline]}
              />
              <PrimaryButton title="Save" onPress={saveEditor} disabled={!editorText.trim() && editor !== 'note'} />
            </>}
            <Pressable onPress={() => { tap(); setEditor(null); }} style={styles.cancelEditor}><Text style={styles.cancelEditorText}>Back to options</Text></Pressable>
          </View> : <>
            <MenuItem icon="add" label="Add exercise" onPress={() => { setEditorText(''); setEditor('add'); }} />
            <MenuItem icon="swap-horiz" label="Replace exercise" onPress={() => setEditor('replace')} />
            <MenuItem icon="tune" label="Edit prescription" onPress={() => {
              const exercise = menuResult ? findExercise(menuResult) : undefined;
              setEditorText(exercise ? prescription(exercise) : '');
              setEditor('prescription');
            }} />
            <MenuItem icon="notes" label={menuResult?.notes ? 'Edit note' : 'Add note'} onPress={() => { setEditorText(menuResult?.notes ?? ''); setEditor('note'); }} />
            <MenuItem icon="skip-next" label="Skip exercise" danger onPress={() => {
              const result = menuResult;
              setMenuResult(null);
              if (result) showReasonMenu(result, true);
            }} />
          </>}
        </Pressable>
      </Pressable>
    </Modal>
  </SafeAreaView>;
}

function MenuItem({ icon, label, onPress, danger = false }: { icon: string; label: string; onPress: () => void; danger?: boolean }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <Pressable accessibilityRole="button" onPress={() => { tap(); onPress(); }} style={styles.menuItem}>
    <MaterialIcons name={icon as any} size={21} color={danger ? palette.red : palette.text} />
    <Text style={[styles.menuItemText, danger && { color: palette.red }]}>{label}</Text>
  </Pressable>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  shell: { flex: 1, width: '100%', maxWidth: 820, alignSelf: 'center' },
  overviewHeader: { minHeight: 64, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  activeHeader: { minHeight: 70, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  activeHeaderCopy: { flex: 1 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface },
  iconButtonPlaceholder: { width: 44 },
  headerTitle: { color: palette.text, fontSize: 17, fontWeight: '900' },
  elapsed: { color: palette.muted, fontSize: 13, marginTop: 2, fontVariant: ['tabular-nums'] },
  progressCopy: { alignItems: 'flex-end' },
  progressValue: { color: palette.text, fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
  progressLabel: { color: palette.muted, fontSize: 10, marginTop: 2 },
  progressTrack: { height: 3, backgroundColor: palette.surface2 },
  progressFill: { height: 3, backgroundColor: palette.accent },
  overviewContent: { padding: 20, paddingBottom: 24, gap: 24 },
  activeContent: { padding: 16, paddingBottom: 20, gap: 22 },
  hero: { gap: 10 },
  overviewTitle: { color: palette.text, fontSize: 30, lineHeight: 35, fontWeight: '900', letterSpacing: -0.7 },
  overviewPurpose: { color: palette.muted, fontSize: 15, lineHeight: 22, maxWidth: 620 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  metaPill: { minHeight: 34, paddingHorizontal: 11, borderRadius: 17, backgroundColor: palette.surface, flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { color: palette.muted, fontSize: 12, fontWeight: '800' },
  overviewSection: { gap: 9 },
  sectionLabel: { color: palette.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  overviewList: { borderWidth: 1, borderColor: palette.border, borderRadius: 16, overflow: 'hidden' },
  overviewRow: { minHeight: 78, padding: 13, flexDirection: 'row', gap: 11, alignItems: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
  categoryIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: palette.accentDark, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 0 },
  overviewExercise: { color: palette.text, fontSize: 15, fontWeight: '900' },
  overviewPrescription: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  overviewCue: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  singleFooter: { padding: 14, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: palette.bg },
  activeSection: { gap: 9 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  exerciseCard: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 15, overflow: 'hidden' },
  exerciseCardComplete: { borderColor: palette.accentDark },
  exerciseHead: { minHeight: 90, paddingLeft: 13, paddingVertical: 9, paddingRight: 6, flexDirection: 'row', alignItems: 'center', gap: 2 },
  exerciseExpandArea: { flex: 1, minWidth: 0, minHeight: 70, justifyContent: 'center', paddingRight: 8 },
  exerciseNameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  exerciseName: { color: palette.text, fontSize: 15, fontWeight: '900', flex: 1 },
  inlineRest: { color: palette.muted, fontSize: 10, fontWeight: '800' },
  exercisePrescription: { color: palette.muted, fontSize: 12, marginTop: 4 },
  exerciseCue: { color: palette.muted, fontSize: 11, lineHeight: 15, marginTop: 3 },
  exerciseCount: { color: palette.accent, fontSize: 10, fontWeight: '900', marginTop: 7 },
  exerciseDoneButton: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' },
  exerciseDoneButtonActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  exerciseDoneButtonPartial: { borderColor: palette.accent },
  exerciseDoneButtonSkipped: { backgroundColor: palette.surface2 },
  exerciseDonePartialMark: { width: 18, height: 4, borderRadius: 2, backgroundColor: palette.accent },
  chevronButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  moreButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  expandedBody: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, padding: 12, gap: 4 },
  unitHeader: { minHeight: 26, flexDirection: 'row', alignItems: 'center', gap: 8 },
  unitHeaderText: { color: palette.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  doneHeader: { width: 38, textAlign: 'center', color: palette.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  unitRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
  unitValue: { color: palette.text, fontSize: 13, fontWeight: '800' },
  repColumn: { width: 32 },
  distanceColumn: { width: 70 },
  inputColumn: { flex: 1, minWidth: 58 },
  numberInput: { height: 38, borderRadius: 9, backgroundColor: palette.surface2, color: palette.text, textAlign: 'center', fontSize: 13, fontWeight: '800', paddingHorizontal: 5 },
  doneCircle: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' },
  doneCircleActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  doneCircleSkipped: { backgroundColor: palette.surface2 },
  feedbackRow: { minHeight: 44, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingBottom: 6 },
  feedbackLabel: { color: palette.muted, fontSize: 10, fontWeight: '800', marginRight: 2 },
  feedbackChip: { minHeight: 32, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' },
  feedbackText: { color: palette.text, fontSize: 10, fontWeight: '800' },
  feedbackWarning: { borderColor: palette.orange },
  feedbackWarningText: { color: palette.orange, fontSize: 10, fontWeight: '800' },
  blockRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10 },
  blockIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: palette.accentDark, alignItems: 'center', justifyContent: 'center' },
  blockTitle: { color: palette.text, fontSize: 13, fontWeight: '800' },
  blockCue: { color: palette.muted, fontSize: 11, lineHeight: 15, marginTop: 3 },
  noteRow: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', paddingTop: 8 },
  noteText: { color: palette.muted, fontSize: 11, lineHeight: 16, flex: 1 },
  changeText: { color: palette.orange, fontSize: 10, fontWeight: '700', paddingTop: 6 },
  activeFooter: { padding: 12, paddingTop: 9, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: palette.bg },
  endEarlyLink: { minHeight: 34, alignItems: 'center', justifyContent: 'center' },
  endEarlyLinkText: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  restCard: { borderRadius: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.accentDark, paddingHorizontal: 14, paddingVertical: 10, gap: 4, alignItems: 'center' },
  restHead: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 6 },
  restEyebrow: { color: palette.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  restNext: { flex: 1, textAlign: 'right', color: palette.muted, fontSize: 10, fontWeight: '700' },
  restClock: { color: palette.text, fontSize: 34, lineHeight: 38, fontWeight: '900', fontVariant: ['tabular-nums'] },
  restControlsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  restControlDot: { color: palette.border, fontSize: 13, fontWeight: '900' },
  restTextControl: { minHeight: 34, paddingHorizontal: 4, justifyContent: 'center' },
  restTextControlLabel: { color: palette.accent, fontSize: 12, fontWeight: '900' },
  restPrimaryButton: { minHeight: 38, borderRadius: 11, backgroundColor: palette.accent, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  restPrimaryButtonText: { color: '#080D12', fontSize: 13, fontWeight: '900' },
  restPresetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  restPresetChip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 11, backgroundColor: palette.surface2, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' },
  restPresetChipText: { color: palette.text, fontSize: 13, fontWeight: '800' },
  restOpenButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  restOpenButtonText: { color: palette.accent, fontSize: 13, fontWeight: '800' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)', justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: palette.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 30, gap: 4, width: '100%', maxWidth: 820, alignSelf: 'center' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: palette.border, alignSelf: 'center', marginBottom: 9 },
  menuTitle: { color: palette.text, fontSize: 17, fontWeight: '900', marginBottom: 8 },
  menuItem: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
  menuItemText: { color: palette.text, fontSize: 14, fontWeight: '800' },
  editorWrap: { gap: 11 },
  editorLabel: { color: palette.muted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  editorInput: { minHeight: 46, borderRadius: 11, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface2, color: palette.text, paddingHorizontal: 12, fontSize: 14 },
  editorInputMultiline: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
  cancelEditor: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  cancelEditorText: { color: palette.muted, fontSize: 12, fontWeight: '800' },
  suggestionRow: { minHeight: 48, justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
  suggestionName: { color: palette.text, fontSize: 13, fontWeight: '900' },
  suggestionDetail: { color: palette.muted, fontSize: 10, marginTop: 2 },
});
