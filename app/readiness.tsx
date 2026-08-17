import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Card, PrimaryButton } from '@/components/sprint-ui';
import { useAutoAdvance } from '@/components/onboarding';
import { Palette, useTheme } from '@/constants/sprintlab';
import type {
  ReadinessDecision,
  ReadinessFuelStatus,
  ReadinessLocation,
  ReadinessSensation,
  TrainingLog,
  WarmupReassessment,
} from '@/types';
import {
  evaluateReadiness,
  locationLabels,
  ReadinessBaseline,
  readinessLevelMeta,
  sensationLabels,
} from '@/utils/readiness';
import {
  clearPendingWorkoutLaunch,
  getPendingWorkoutLaunch,
  getReadiness,
  getTrainingLogs,
  saveReadiness,
  startWorkoutSession,
} from '@/utils/storage';
import { completeStep, error, selection, success, tap, warning } from '@/utils/haptics';

// SprintLab Readiness Check-in V2: same underlying questions, answer types, conditional branches,
// scoring (utils/readiness.ts's evaluateReadiness — untouched), storage, and workout-launch
// integration as before — only the presentation changed, from three large multi-question pages
// to one question at a time. `READINESS_STEP_ID`s below are a presentation-layer sequencing
// concept only; the persisted ReadinessDecision shape is identical to before.

type ReadinessStepId =
  | 'sleep-duration' | 'sleep-quality' | 'leg-readiness' | 'focus' | 'food-status' | 'hydration' | 'soreness'
  | 'localized-issue' | 'symptom-location' | 'symptom-sensation' | 'symptom-movement' | 'symptom-note'
  | 'result';

const BASE_SEQUENCE: ReadinessStepId[] = [
  'sleep-duration', 'sleep-quality', 'leg-readiness', 'focus', 'food-status', 'hydration', 'soreness', 'localized-issue',
];
const SYMPTOM_SEQUENCE: ReadinessStepId[] = ['symptom-location', 'symptom-sensation', 'symptom-movement', 'symptom-note'];

/** The one place that decides which questions exist right now — conditional branches (currently
 * just the localized-issue follow-ups) simply extend this array, and the progress header/back
 * navigation both derive from it, so a changed total is always the real total. */
function buildSequence(hasLocalizedIssue: boolean | null): ReadinessStepId[] {
  return hasLocalizedIssue === true ? [...BASE_SEQUENCE, ...SYMPTOM_SEQUENCE, 'result'] : [...BASE_SEQUENCE, 'result'];
}

/**
 * Semantic meaning of a readiness answer — deliberately separate from its numeric value or scale
 * direction, since "higher" means opposite things for e.g. sleep quality (better) vs. soreness
 * (worse). Each question site decides what its own answers mean; the shared question components
 * below only ever translate an already-decided semantic into a restrained color treatment.
 */
type AnswerSemantic = 'positive' | 'caution' | 'negative' | 'neutral';

/** Restrained selected-state tint per semantic — reuses this same file's existing result-card
 * background tokens (see resultColor/resultBackground below) rather than inventing new ones, so
 * an answer's color and the eventual green/yellow/red result read as the same visual language.
 * Returns null for 'neutral'/undefined, which keeps today's plain accent "selected" treatment. */
function semanticTint(palette: Palette, semantic?: AnswerSemantic): { color: string; background: string } | null {
  if (semantic === 'positive') return { color: palette.success, background: '#162000' };
  if (semantic === 'caution') return { color: palette.orange, background: '#2A1B0C' };
  if (semantic === 'negative') return { color: palette.red, background: '#2A1216' };
  return null;
}

/** Maps a 1-5 scale answer to a semantic tier. `direction` says which end of the scale is
 * favorable — 'higher-better' for sleep quality/leg readiness/focus, 'higher-worse' for soreness
 * — so the same four-tier gradient (positive/neutral/caution/negative) works for both without the
 * caller doing any inversion math itself. */
function scaleSemantic(value: number, direction: 'higher-better' | 'higher-worse' = 'higher-better'): AnswerSemantic {
  const normalized = direction === 'higher-better' ? value : 6 - value; // 1 (worst) .. 5 (best)
  if (normalized >= 4) return 'positive';
  if (normalized === 3) return 'neutral';
  if (normalized === 2) return 'caution';
  return 'negative';
}

const dateKey = () => new Date().toLocaleDateString('en-CA');
const average = (values: number[]) => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : undefined;

const baselineFromLogs = (logs: TrainingLog[]): ReadinessBaseline => {
  const recent = [...logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);
  const sleep = recent.map(log => log.readiness.sleepHours).filter((value): value is number => value !== null);
  const neural = recent.flatMap(log => log.readiness.energy === null ? [] : [Number(log.readiness.energy)]);
  const soreness = recent.flatMap(log => log.readiness.generalSoreness === null ? [] : [Number(log.readiness.generalSoreness)]);
  return {
    sampleCount: recent.length,
    averageSleep: average(sleep),
    averageNeuralReadiness: average(neural),
    averageSoreness: average(soreness),
  };
};

/** Shared shell for every single-question screen: eyebrow/title header, close-or-back, Skip, and
 * a thin "N of M" fill bar sized off the CURRENT (possibly conditional) sequence. */
function QuestionShell({
  onBack,
  onSkip,
  index,
  total,
  children,
}: {
  onBack: () => void;
  onSkip: () => void;
  index: number;
  total: number;
  children: React.ReactNode;
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const fill = useRef(new Animated.Value(0)).current;
  useMemo(() => {
    Animated.timing(fill, { toValue: total > 0 ? (index + 1) / total : 0, duration: 260, useNativeDriver: false }).start();
    return null;
  }, [fill, index, total]);
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.shell}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={index === 0 ? 'Close readiness check-in' : 'Go to previous question'} onPress={() => { tap(); onBack(); }} style={styles.back}>
            <MaterialIcons name={index === 0 ? 'close' : 'arrow-back'} size={22} color={palette.text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>BEFORE TRAINING</Text>
            <Text style={styles.headerTitle}>Readiness check-in</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => { tap(); onSkip(); }} style={styles.skipTop}>
            <Text style={styles.skipTopText}>Skip</Text>
          </Pressable>
        </View>
        <View style={styles.progressRow}>
          <Text style={styles.progressLabel}>{Math.min(index + 1, total)} of {total}</Text>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

/** Large, highly tappable 1-5 scale — every existing scale question (sleep quality, leg
 * readiness, focus, soreness) uses this. Tapping selects and auto-advances shortly after. */
function ScaleQuestion({ title, subtitle, value, left, right, onAnswer, direction = 'higher-better' }: {
  title: string;
  subtitle: string;
  value: number;
  left: string;
  right: string;
  onAnswer: (value: number) => void;
  /** Which end of 1-5 is favorable — see scaleSemantic. Defaults to "higher is better", which
   * covers every existing scale question except soreness. */
  direction?: 'higher-better' | 'higher-worse';
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { schedule, pending } = useAutoAdvance();
  const [justSelected, setJustSelected] = useState(value > 0 ? value : 0);
  const choose = (next: number) => {
    setJustSelected(next);
    selection();
    schedule(() => onAnswer(next));
  };
  return <View style={styles.questionBlock}>
    <Text style={styles.questionTitle}>{title}</Text>
    <Text style={styles.questionSubtitle}>{subtitle}</Text>
    <View style={styles.scaleRow}>
      {[1, 2, 3, 4, 5].map(number => {
        const selected = justSelected === number;
        const tint = selected ? semanticTint(palette, scaleSemantic(number, direction)) : null;
        return <Pressable
          key={number}
          accessibilityRole="radio"
          accessibilityState={{ selected }}
          accessibilityLabel={`${number} out of 5`}
          disabled={pending && !selected}
          onPress={() => choose(number)}
          style={[
            styles.scaleCell,
            selected && (tint ? { borderColor: tint.color, backgroundColor: tint.background } : styles.scaleCellActive),
            pending && !selected && styles.dimmed,
          ]}
        >
          <Text style={[styles.scaleCellText, selected && (tint ? { color: tint.color } : styles.scaleCellTextActive)]}>{number}</Text>
        </Pressable>;
      })}
    </View>
    <View style={styles.scaleEndpoints}>
      <Text style={styles.endpoint}>{left}</Text>
      <Text style={styles.endpoint}>{right}</Text>
    </View>
  </View>;
}

/** Categorical single-choice — food status, hydration, localized-issue yes/no, symptom sensation,
 * and (for non-"other" picks) symptom location all use this. Auto-advances on tap. */
function CategoricalQuestion<T extends string | boolean>({ title, subtitle, value, options, onAnswer, warnOn }: {
  title: string;
  subtitle?: string;
  value: T | null | undefined;
  options: { value: T; label: string; detail?: string; semantic?: AnswerSemantic }[];
  onAnswer: (value: T) => void;
  warnOn?: T;
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { schedule, pending } = useAutoAdvance();
  const [justSelected, setJustSelected] = useState<T | null>(value ?? null);
  const choose = (next: T) => {
    setJustSelected(next);
    if (warnOn !== undefined && next === warnOn) warning();
    else selection();
    schedule(() => onAnswer(next));
  };
  return <View style={styles.questionBlock}>
    <Text style={styles.questionTitle}>{title}</Text>
    {subtitle ? <Text style={styles.questionSubtitle}>{subtitle}</Text> : null}
    <View style={styles.choiceStack}>
      {options.map(option => {
        const selected = justSelected === option.value;
        const tint = selected ? semanticTint(palette, option.semantic) : null;
        return <Pressable
          key={String(option.value)}
          accessibilityRole="radio"
          accessibilityState={{ selected }}
          disabled={pending && !selected}
          onPress={() => choose(option.value)}
          style={[
            styles.choiceCard,
            selected && (tint ? { borderColor: tint.color, backgroundColor: tint.background } : styles.choiceCardActive),
            pending && !selected && styles.dimmed,
          ]}
        >
          <View style={styles.choiceContent}>
            <Text style={[styles.choiceLabel, selected && (tint ? { color: tint.color } : styles.choiceLabelActive)]}>{option.label}</Text>
            {option.detail ? <Text style={styles.choiceDetail}>{option.detail}</Text> : null}
          </View>
          <View style={[styles.choiceDot, selected && (tint ? { borderColor: tint.color } : styles.choiceDotActive)]}>{selected ? <View style={[styles.choiceDotCenter, tint && { backgroundColor: tint.color }]} /> : null}</View>
        </Pressable>;
      })}
    </View>
  </View>;
}

const SLEEP_MIN = 0;
const SLEEP_MAX = 14;
const SLEEP_STEP = 0.25;
const SLEEP_TICKS = [4, 6, 8, 10, 12];

/** Replaces the old bottom-sheet hour/minute wheel pickers with a single fast horizontal control:
 * a draggable track (matching this file's existing PanResponder use for the old symptom sheet)
 * plus +/- 15-minute steppers as a reliable fallback. Same 0-14h range and 15-minute precision
 * the old picker offered — evaluateReadiness needs nothing finer.
 *
 * The track position is driven by a single Animated.Value (0-1 ratio along the track) rather than
 * a plain style string, which is what makes three things possible at once: (1) 1:1 finger tracking
 * while actively dragging — no lag, so the visually centered value never drifts from the value
 * about to be committed; (2) a native-feeling momentum flick on release, via Animated.decay seeded
 * from the gesture's release velocity; and (3) a guaranteed final snap to a valid SLEEP_STEP with
 * no overshoot/bounce (Animated.timing, not spring) — the decay is watched by a listener that stops
 * it the instant it would leave the [0,1] track bounds, and every release path (flick, slow drag,
 * or a tap) funnels through the same snapToStep so the resting thumb position and the committed
 * value are always identical. */
function SleepDurationQuestion({
  value,
  unusualConfirmed,
  onChange,
  onConfirmUnusual,
  onContinue,
}: {
  value: number;
  unusualConfirmed: boolean;
  onChange: (value: number) => void;
  onConfirmUnusual: () => void;
  onContinue: () => void;
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const trackWidth = useRef(0);
  const trackX = useRef(0);
  const isDragging = useRef(false);
  const lastQuantized = useRef(value);
  const currentRatio = useRef(0);
  const animatedRatio = useRef(new Animated.Value(0)).current;
  // The PanResponder below is created once (see the empty-ish dep array on its useMemo) so a
  // fast-moving gesture never gets recreated mid-drag — it reads onChange through this ref rather
  // than closing over the prop directly, so it always calls the CURRENT onChange even though the
  // responder object itself never changes identity.
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const clampValue = (raw: number) => Math.round(Math.min(SLEEP_MAX, Math.max(SLEEP_MIN, raw)) / SLEEP_STEP) * SLEEP_STEP;
  const ratioFromValue = (raw: number) => Math.min(1, Math.max(0, (raw - SLEEP_MIN) / (SLEEP_MAX - SLEEP_MIN)));
  const valueFromRatio = (ratio: number) => clampValue(SLEEP_MIN + Math.min(1, Math.max(0, ratio)) * (SLEEP_MAX - SLEEP_MIN));
  const ratioFromPageX = (pageX: number) => {
    if (trackWidth.current <= 0) return currentRatio.current;
    return Math.min(1, Math.max(0, (pageX - trackX.current) / trackWidth.current));
  };

  // Keeps the thumb honest whenever the value changes from OUTSIDE a drag (the +/- steppers, or
  // the screen loading a previously-saved answer) — never fires mid-gesture, so it can't fight
  // the athlete's finger. Also resyncs lastQuantized so a subsequent drag's first commit() compares
  // against the real current value rather than whatever it was quantized to on mount.
  useEffect(() => {
    lastQuantized.current = value;
    if (isDragging.current) return;
    Animated.timing(animatedRatio, { toValue: ratioFromValue(value >= 0 ? value : 8), duration: 180, useNativeDriver: false }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const id = animatedRatio.addListener(({ value: v }) => { currentRatio.current = v; });
    return () => animatedRatio.removeListener(id);
  }, [animatedRatio]);

  const commit = (next: number, tick = true) => {
    if (next !== lastQuantized.current) {
      lastQuantized.current = next;
      if (tick) selection();
      onChangeRef.current(next);
    }
  };

  const snapToStep = () => {
    const snapped = valueFromRatio(currentRatio.current);
    Animated.timing(animatedRatio, { toValue: ratioFromValue(snapped), duration: 140, useNativeDriver: false }).start();
    commit(snapped);
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      isDragging.current = true;
      animatedRatio.stopAnimation();
    },
    onPanResponderMove: (_, gesture) => {
      const ratio = ratioFromPageX(gesture.moveX);
      animatedRatio.setValue(ratio);
      commit(valueFromRatio(ratio));
    },
    onPanResponderRelease: (_, gesture) => {
      isDragging.current = false;
      const FLICK_THRESHOLD = 0.35; // px/ms — below this, treat it as a deliberate slow drag, not a flick
      if (trackWidth.current > 0 && Math.abs(gesture.vx) > FLICK_THRESHOLD) {
        const decayVelocity = gesture.vx / trackWidth.current;
        const listenerId = animatedRatio.addListener(({ value: v }) => {
          if (v <= 0 || v >= 1) {
            animatedRatio.stopAnimation(() => { animatedRatio.removeListener(listenerId); snapToStep(); });
          }
        });
        Animated.decay(animatedRatio, { velocity: decayVelocity, deceleration: 0.996, useNativeDriver: false }).start(() => {
          animatedRatio.removeListener(listenerId);
          snapToStep();
        });
      } else {
        snapToStep();
      }
    },
    onPanResponderTerminate: () => {
      isDragging.current = false;
      snapToStep();
    },
    // commit/snapToStep/valueFromRatio/ratioFromPageX are intentionally omitted: none of them
    // close over `value` or `onChange` directly (onChange goes through onChangeRef, "current
    // value" through lastQuantized/currentRatio refs) — creating the responder once here, rather
    // than on every render, is what keeps a fast drag from ever being interrupted mid-gesture by
    // React re-running PanResponder.create.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [animatedRatio]);

  const hasValue = value >= 0;
  const displayValue = hasValue ? value : 8;
  const hours = Math.floor(displayValue);
  const minutes = Math.round((displayValue % 1) * 60);
  const unusual = hasValue && (value < 4 || value > 12);
  const step = (delta: number) => {
    selection();
    const next = clampValue((hasValue ? value : 8) + delta);
    lastQuantized.current = next;
    onChange(next);
  };
  const fillWidth = animatedRatio.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const thumbLeft = animatedRatio.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return <View style={styles.questionBlock}>
    <Text style={styles.questionTitle}>How long did you sleep last night?</Text>
    <Text style={styles.questionSubtitle}>Your sleep fuels your performance.</Text>

    <View style={styles.sleepValueRow}>
      <Pressable accessibilityRole="button" accessibilityLabel="Subtract 15 minutes" onPress={() => step(-SLEEP_STEP)} style={styles.sleepStepper}>
        <MaterialIcons name="remove" size={22} color={palette.text} />
      </Pressable>
      <View style={styles.sleepReadout}>
        <Text style={styles.sleepReadoutValue}>{hasValue ? `${hours}h${minutes ? ` ${minutes}m` : ''}` : 'Select'}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Add 15 minutes" onPress={() => step(SLEEP_STEP)} style={styles.sleepStepper}>
        <MaterialIcons name="add" size={22} color={palette.text} />
      </Pressable>
    </View>

    <View
      style={styles.sleepTrackWrap}
      onLayout={event => { trackWidth.current = event.nativeEvent.layout.width; }}
      onTouchStart={event => { trackX.current = event.nativeEvent.pageX - (event.nativeEvent.locationX); }}
      {...panResponder.panHandlers}
    >
      <View style={styles.sleepTrack}>
        <Animated.View style={[styles.sleepTrackFill, { width: fillWidth }]} />
        <Animated.View style={[styles.sleepThumb, { left: thumbLeft }]} hitSlop={16} />
      </View>
      <View style={styles.sleepTicks}>
        {SLEEP_TICKS.map(tick => <Text key={tick} style={styles.sleepTickText}>{tick} hr</Text>)}
      </View>
    </View>

    {unusual ? <Pressable onPress={() => { selection(); onConfirmUnusual(); }} style={[styles.unusualRow, unusualConfirmed && styles.unusualRowConfirmed]}>
      <MaterialIcons name={unusualConfirmed ? 'check-circle' : 'error-outline'} size={19} color={unusualConfirmed ? palette.accent : palette.orange} />
      <Text style={styles.unusualText}>{unusualConfirmed ? 'Confirmed' : 'That’s an unusual duration. Tap to confirm it’s correct.'}</Text>
    </Pressable> : null}

    <PrimaryButton title="Next" onPress={onContinue} disabled={!hasValue || (unusual && !unusualConfirmed)} />
  </View>;
}

export default function ReadinessScreen() {
  const router = useRouter();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { launch } = useLocalSearchParams<{ launch?: string }>();
  const [currentStepId, setCurrentStepId] = useState<ReadinessStepId>('sleep-duration');
  const [sleepHours, setSleepHours] = useState(-1);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [unusualSleepConfirmed, setUnusualSleepConfirmed] = useState(false);
  const [sleepQuality, setSleepQuality] = useState(0);
  const [legReadiness, setLegReadiness] = useState(0);
  const [focus, setFocus] = useState(0);
  const [foodStatus, setFoodStatus] = useState<ReadinessFuelStatus>();
  const [hydrated, setHydrated] = useState<boolean | null>(null);
  const [soreness, setSoreness] = useState(0);
  const [hasLocalizedIssue, setHasLocalizedIssue] = useState<boolean | null>(null);
  const [sensation, setSensation] = useState<ReadinessSensation>();
  const [location, setLocation] = useState<ReadinessLocation>();
  const [otherLocationDetail, setOtherLocationDetail] = useState('');
  const [hesitatesAtMaxEffort, setHesitatesAtMaxEffort] = useState<boolean | null>(null);
  const [painNotes, setPainNotes] = useState('');
  const [warmupReassessment, setWarmupReassessment] = useState<WarmupReassessment>();
  const [baseline, setBaseline] = useState<ReadinessBaseline>({ sampleCount: 0 });

  useFocusEffect(useCallback(() => {
    Promise.all([getReadiness(dateKey()), getTrainingLogs()]).then(([value, logs]) => {
      setBaseline(baselineFromLogs(logs));
      if (value?.status !== 'completed') return;
      if (typeof value.sleep === 'number') {
        setSleepHours(Math.floor(value.sleep));
        setSleepMinutes(Math.round((value.sleep % 1) * 60 / 15) * 15);
      }
      setSleepQuality(value.sleepQuality ?? 0);
      setLegReadiness(Math.max(1, Math.min(5, Math.round((value.neuralReadiness ?? (value.energy ? value.energy * 2 : 0)) / 2))));
      setFocus(value.focus ?? 0);
      setFoodStatus(value.foodStatus ?? (value.fuelHydrated === false ? 'underfueled' : value.fuelHydrated === true ? 'normal' : undefined));
      setHydrated(value.hydrated ?? value.fuelHydrated ?? null);
      setSoreness(value.soreness ?? 0);
      setHasLocalizedIssue(value.hasLocalizedIssue ?? null);
      setSensation(value.sensation);
      setLocation(value.location);
      setOtherLocationDetail(value.otherLocationDetail ?? '');
      setHesitatesAtMaxEffort(value.hesitatesAtMaxEffort ?? null);
      setPainNotes(value.painNotes);
      setWarmupReassessment(value.warmupReassessment);
      setUnusualSleepConfirmed(typeof value.sleep === 'number' && (value.sleep < 4 || value.sleep > 12));
    });
  }, []));

  const sleepNumber = sleepHours >= 0 ? sleepHours + sleepMinutes / 60 : -1;
  const unusualSleep = sleepNumber >= 0 && (sleepNumber < 4 || sleepNumber > 12);
  const locationComplete = Boolean(location) && (location !== 'other' || Boolean(otherLocationDetail.trim()));
  const symptomComplete = hasLocalizedIssue === false
    || (hasLocalizedIssue === true && Boolean(sensation) && locationComplete && hesitatesAtMaxEffort !== null);
  const recoveryComplete = sleepNumber >= 0 && sleepNumber <= 14 && (!unusualSleep || unusualSleepConfirmed) && sleepQuality > 0 && legReadiness > 0;
  const fuelComplete = focus > 0 && Boolean(foodStatus) && hydrated !== null;
  const bodyComplete = soreness > 0 && hasLocalizedIssue !== null && symptomComplete;
  const valid = recoveryComplete && fuelComplete && bodyComplete;
  const neuralReadiness = legReadiness * 2;

  const draft = useMemo<ReadinessDecision | null>(() => valid ? {
    date: dateKey(),
    status: 'completed',
    sleep: sleepNumber,
    sleepQuality,
    neuralReadiness,
    focus,
    foodStatus,
    hydrated: hydrated ?? undefined,
    fuelHydrated: foodStatus !== 'underfueled' && hydrated === true,
    soreness,
    hasLocalizedIssue: hasLocalizedIssue ?? undefined,
    sensation: hasLocalizedIssue ? sensation : undefined,
    location: hasLocalizedIssue ? location : undefined,
    otherLocationDetail: hasLocalizedIssue && location === 'other' ? otherLocationDetail.trim() : undefined,
    hesitatesAtMaxEffort: hasLocalizedIssue ? (hesitatesAtMaxEffort ?? undefined) : undefined,
    warmupReassessment,
    painNotes: hasLocalizedIssue ? painNotes : '',
  } : null, [
    valid, sleepNumber, sleepQuality, neuralReadiness, focus, foodStatus, hydrated, soreness,
    hasLocalizedIssue, sensation, location, otherLocationDetail, hesitatesAtMaxEffort, warmupReassessment, painNotes,
  ]);

  const evaluation = useMemo(() => draft ? evaluateReadiness(draft, baseline) : null, [draft, baseline]);

  const sequence = useMemo(() => buildSequence(hasLocalizedIssue), [hasLocalizedIssue]);
  const currentIndex = Math.max(0, sequence.indexOf(currentStepId));
  const questionCount = sequence.length - 1; // exclude 'result' from the visible "N of M"

  const goNext = () => {
    const next = sequence[currentIndex + 1];
    if (next) setCurrentStepId(next);
  };
  const goBack = () => {
    if (currentIndex === 0) { router.back(); return; }
    setCurrentStepId(sequence[currentIndex - 1]);
  };

  const finishCheckIn = async (decision: ReadinessDecision) => {
    try {
      await saveReadiness(decision);
    } catch {
      error();
      Alert.alert('Could not save readiness', 'Please try again.');
      return;
    }
    success();
    if (launch !== 'pending') return router.back();
    const pending = await getPendingWorkoutLaunch();
    if (!pending) return router.replace('/');
    await startWorkoutSession(
      pending.workout,
      decision,
      pending.scheduledDate && pending.scheduledDayIndex !== undefined
        ? { scheduledDate: pending.scheduledDate, scheduledDayIndex: pending.scheduledDayIndex }
        : undefined,
    );
    await clearPendingWorkoutLaunch();
    router.replace('/workout');
  };

  const save = async () => {
    if (!draft || !evaluation) return;
    await finishCheckIn({
      ...draft,
      readinessLevel: evaluation.level,
      readinessReasons: evaluation.reasons,
      readinessGuidance: evaluation.guidance,
      maximalSprintRestricted: evaluation.maximalSprintRestricted,
    });
  };

  const saveAndReturnToToday = async () => {
    if (!draft || !evaluation) return;
    try {
      await saveReadiness({
        ...draft,
        readinessLevel: evaluation.level,
        readinessReasons: evaluation.reasons,
        readinessGuidance: evaluation.guidance,
        maximalSprintRestricted: evaluation.maximalSprintRestricted,
      });
      if (launch === 'pending') await clearPendingWorkoutLaunch();
      success();
      router.replace('/');
    } catch {
      error();
      Alert.alert('Could not save check-in', 'Your answers are still here. Please try again.');
    }
  };

  const skip = () => {
    Alert.alert(
      'Skip today’s check-in?',
      'You can begin without recording readiness details.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip check-in',
          style: 'destructive',
          onPress: () => {
            warning();
            finishCheckIn({ date: dateKey(), status: 'skipped', painNotes: '' });
          },
        },
      ],
    );
  };

  const clearLocalizedIssue = () => {
    setSensation(undefined);
    setLocation(undefined);
    setOtherLocationDetail('');
    setHesitatesAtMaxEffort(null);
    setPainNotes('');
    setWarmupReassessment(undefined);
  };

  const resultColor = evaluation?.level === 'green' ? palette.accent : evaluation?.level === 'yellow' ? palette.orange : palette.red;
  const resultBackground = evaluation?.level === 'green' ? '#162000' : evaluation?.level === 'yellow' ? '#2A1B0C' : '#2A1216';

  if (currentStepId === 'result') {
    if (!evaluation) { setCurrentStepId('sleep-duration'); return null; }
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.shell}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close readiness check-in" onPress={() => { tap(); router.back(); }} style={styles.back}>
              <MaterialIcons name="close" size={22} color={palette.text} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>BEFORE TRAINING</Text>
              <Text style={styles.headerTitle}>Readiness check-in</Text>
            </View>
            <View style={styles.skipTop} />
          </View>
          <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.stage}>
              <View>
                <Text style={styles.stageTitle}>Today’s readiness</Text>
                <Text style={styles.stageCopy}>Use this signal with your warm-up, judgment, and qualified support when needed.</Text>
              </View>

              <Card style={{ ...styles.resultCard, borderColor: resultColor, backgroundColor: resultBackground }}>
                <View style={styles.resultHead}>
                  <View style={[styles.signal, { backgroundColor: resultColor }]} />
                  <View style={styles.resultHeading}>
                    <Text style={[styles.resultLevel, { color: resultColor }]}>{evaluation.label}</Text>
                    <Text style={styles.resultTitle}>{readinessLevelMeta[evaluation.level].shortLabel}</Text>
                  </View>
                </View>
                <Text style={styles.guidance}>{evaluation.guidance}</Text>
                <View style={styles.reasonList}>
                  {evaluation.reasons.slice(0, 3).map(reason => (
                    <View key={reason} style={styles.reasonRow}>
                      <MaterialIcons name="circle" size={7} color={resultColor} style={styles.reasonIcon} />
                      <Text style={styles.reasonText}>{reason}</Text>
                    </View>
                  ))}
                </View>
              </Card>

              {evaluation.requiresWarmupReassessment ? (
                <Card style={styles.reassessment}>
                  <Text style={styles.questionLabelSmall}>Recheck after your normal warm-up</Text>
                  <Text style={styles.reassessmentCopy}>How did the flagged issue or overall readiness change?</Text>
                  <View style={styles.choiceStackHorizontal}>
                    {(['better', 'same', 'worse'] as WarmupReassessment[]).map(option => {
                      const selected = warmupReassessment === option;
                      const semantic: AnswerSemantic = option === 'better' ? 'positive' : option === 'worse' ? 'negative' : 'neutral';
                      const tint = selected ? semanticTint(palette, semantic) : null;
                      return <Pressable
                        key={option}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        onPress={() => { if (option === 'worse') warning(); else selection(); setWarmupReassessment(option); }}
                        style={[styles.choiceChip, selected && (tint ? { borderColor: tint.color, backgroundColor: tint.background } : styles.choiceCardActive)]}
                      >
                        <Text style={[styles.choiceLabel, selected && (tint ? { color: tint.color } : styles.choiceLabelActive)]}>{option === 'better' ? 'Better' : option === 'same' ? 'Same' : 'Worse'}</Text>
                      </Pressable>;
                    })}
                  </View>
                </Card>
              ) : null}

              <View style={styles.safetyNote}>
                <MaterialIcons name="health-and-safety" size={19} color={palette.muted} />
                <Text style={styles.safetyText}>SprintLab can flag concerns, but it cannot diagnose an injury or confirm that training is safe.</Text>
              </View>

              <Pressable onPress={() => { tap(); setCurrentStepId('sleep-duration'); }} style={styles.editAnswers}>
                <MaterialIcons name="edit" size={17} color={palette.muted} />
                <Text style={styles.editAnswersText}>Edit answers</Text>
              </Pressable>
            </View>
          </ScrollView>
          <View style={styles.bottomBar}>
            <PrimaryButton
              title={
                evaluation.level === 'red'
                  ? 'Return to Today'
                  : evaluation.requiresWarmupReassessment && !warmupReassessment
                    ? 'Reassess after warm-up'
                    : launch === 'pending'
                      ? 'Continue to today’s workout'
                      : 'Save readiness'
              }
              onPress={evaluation.level === 'red' ? saveAndReturnToToday : save}
              disabled={evaluation.requiresWarmupReassessment && !warmupReassessment}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const shellProps = { onBack: goBack, onSkip: skip, index: currentIndex, total: questionCount };

  if (currentStepId === 'sleep-duration') return (
    <QuestionShell key={currentStepId} {...shellProps}>
      <SleepDurationQuestion
        value={sleepNumber}
        unusualConfirmed={unusualSleepConfirmed}
        onChange={next => { setSleepHours(Math.floor(next)); setSleepMinutes(Math.round((next % 1) * 60)); setUnusualSleepConfirmed(false); }}
        onConfirmUnusual={() => setUnusualSleepConfirmed(true)}
        onContinue={() => { completeStep(); goNext(); }}
      />
    </QuestionShell>
  );

  if (currentStepId === 'sleep-quality') return (
    <QuestionShell key={currentStepId} {...shellProps}>
      <ScaleQuestion title="How was your sleep quality?" subtitle="Rate how rested you feel, not just the hours." value={sleepQuality} left="Poor" right="Great" onAnswer={next => { setSleepQuality(next); goNext(); }} direction="higher-better" />
    </QuestionShell>
  );

  if (currentStepId === 'leg-readiness') return (
    <QuestionShell key={currentStepId} {...shellProps}>
      <ScaleQuestion title="How ready do your legs feel?" subtitle="A quick daily check to personalize your session." value={legReadiness} left="Heavy" right="Springy" onAnswer={next => { setLegReadiness(next); goNext(); }} direction="higher-better" />
    </QuestionShell>
  );

  if (currentStepId === 'focus') return (
    <QuestionShell key={currentStepId} {...shellProps}>
      <ScaleQuestion title="How’s your mental focus?" subtitle="Compare today with what’s normal for you." value={focus} left="Distracted" right="Locked in" onAnswer={next => { setFocus(next); goNext(); }} direction="higher-better" />
    </QuestionShell>
  );

  if (currentStepId === 'food-status') return (
    <QuestionShell key={currentStepId} {...shellProps}>
      <CategoricalQuestion
        title="How are you fueling today?"
        subtitle="Choose the option that best matches your current plan."
        value={foodStatus}
        onAnswer={next => { setFoodStatus(next); goNext(); }}
        options={[
          { value: 'normal' as const, label: 'Eating normally', detail: 'Fueling as I usually do.', semantic: 'positive' },
          { value: 'fasted-usual' as const, label: 'Training fasted as usual', detail: 'Not eating before training.', semantic: 'positive' },
          { value: 'underfueled' as const, label: 'Less food than normal', detail: 'Eating less than usual.', semantic: 'caution' },
        ]}
      />
    </QuestionShell>
  );

  if (currentStepId === 'hydration') return (
    <QuestionShell key={currentStepId} {...shellProps}>
      <CategoricalQuestion
        title="How’s your hydration?"
        value={hydrated}
        onAnswer={next => { setHydrated(next); goNext(); }}
        options={[
          { value: true, label: 'About normal hydration', semantic: 'positive' },
          { value: false, label: 'Less than normal hydration', semantic: 'caution' },
        ]}
      />
    </QuestionShell>
  );

  if (currentStepId === 'soreness') return (
    <QuestionShell key={currentStepId} {...shellProps}>
      <ScaleQuestion title="General training soreness?" subtitle="Whole-body soreness from recent training." value={soreness} left="None" right="Severe" onAnswer={next => { setSoreness(next); goNext(); }} direction="higher-worse" />
    </QuestionShell>
  );

  if (currentStepId === 'localized-issue') return (
    <QuestionShell key={currentStepId} {...shellProps}>
      <CategoricalQuestion
        title="Any localized tightness, pulling, or pain?"
        subtitle="Not general soreness — something specific to one area."
        value={hasLocalizedIssue}
        warnOn={true}
        onAnswer={next => {
          setHasLocalizedIssue(next);
          if (!next) { clearLocalizedIssue(); goNext(); return; }
          setCurrentStepId('symptom-location');
        }}
        options={[
          { value: false, label: 'No', semantic: 'positive' },
          { value: true, label: 'Yes', semantic: 'caution' },
        ]}
      />
    </QuestionShell>
  );

  if (currentStepId === 'symptom-location') return (
    <QuestionShell key={currentStepId} {...shellProps}>
      <View style={styles.questionBlock}>
        <Text style={styles.questionTitle}>Where is it?</Text>
        <View style={styles.choiceStack}>
          {(Object.entries(locationLabels) as [ReadinessLocation, string][]).map(([value, label]) => {
            const selected = location === value;
            return <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => {
              selection();
              setLocation(value);
              if (value !== 'other') { setOtherLocationDetail(''); tap(); goNext(); }
            }} style={[styles.choiceCard, selected && styles.choiceCardActive]}>
              <Text style={[styles.choiceLabel, selected && styles.choiceLabelActive]}>{label}</Text>
              <View style={[styles.choiceDot, selected && styles.choiceDotActive]}>{selected ? <View style={styles.choiceDotCenter} /> : null}</View>
            </Pressable>;
          })}
        </View>
        {location === 'other' ? <>
          <TextInput
            value={otherLocationDetail}
            onChangeText={setOtherLocationDetail}
            placeholder="Name the specific area"
            placeholderTextColor={palette.muted}
            style={styles.input}
            autoFocus
          />
          <PrimaryButton title="Next" onPress={() => { if (otherLocationDetail.trim()) { tap(); goNext(); } }} disabled={!otherLocationDetail.trim()} />
        </> : null}
      </View>
    </QuestionShell>
  );

  if (currentStepId === 'symptom-sensation') return (
    <QuestionShell key={currentStepId} {...shellProps}>
      <CategoricalQuestion
        title="How would you describe it?"
        value={sensation}
        onAnswer={next => { setSensation(next); goNext(); }}
        options={[
          { value: 'minor-tightness' as const, label: sensationLabels['minor-tightness'], detail: 'Tight or stiff; may ease during warm-up.', semantic: 'caution' },
          { value: 'lingering-niggle' as const, label: sensationLabels['lingering-niggle'], detail: 'Persistent pulling, aching, or discomfort.', semantic: 'caution' },
          { value: 'severe-acute' as const, label: sensationLabels['severe-acute'], detail: 'Sharp, sudden, or affecting normal movement.', semantic: 'negative' },
        ]}
      />
    </QuestionShell>
  );

  if (currentStepId === 'symptom-movement') return (
    <QuestionShell key={currentStepId} {...shellProps}>
      <CategoricalQuestion
        title="Does it affect normal movement or make you hold back?"
        value={hesitatesAtMaxEffort}
        warnOn={true}
        onAnswer={next => { setHesitatesAtMaxEffort(next); goNext(); }}
        options={[
          { value: false, label: 'No', semantic: 'positive' },
          { value: true, label: 'Yes', semantic: 'negative' },
        ]}
      />
    </QuestionShell>
  );

  if (currentStepId === 'symptom-note') return (
    <QuestionShell key={currentStepId} {...shellProps}>
      <View style={styles.questionBlock}>
        <Text style={styles.questionTitle}>Anything else to add?</Text>
        <Text style={styles.questionSubtitle}>Optional — when it began or what you noticed.</Text>
        <TextInput
          value={painNotes}
          onChangeText={setPainNotes}
          multiline
          placeholder="Optional note"
          placeholderTextColor={palette.muted}
          style={[styles.input, styles.notes]}
        />
        <PrimaryButton title={painNotes.trim() ? 'Next' : 'Skip note'} onPress={() => { tap(); goNext(); }} />
      </View>
    </QuestionShell>
  );

  return null;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  shell: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { minHeight: 60, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 40, height: 40, borderRadius: 14, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  eyebrow: { color: palette.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  headerTitle: { color: palette.text, fontSize: 17, fontWeight: '900', marginTop: 2 },
  skipTop: { minWidth: 40, minHeight: 40, alignItems: 'flex-end', justifyContent: 'center' },
  skipTopText: { color: palette.muted, fontSize: 13, fontWeight: '800' },
  progressRow: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 4, gap: 6 },
  progressLabel: { color: palette.muted, fontSize: 11, fontWeight: '800' },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: palette.surface2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: palette.accent },
  page: { padding: 20, paddingTop: 18, paddingBottom: 28, flexGrow: 1, justifyContent: 'center' },
  questionBlock: { gap: 14 },
  questionTitle: { color: palette.text, fontSize: 26, lineHeight: 31, fontWeight: '900' },
  questionSubtitle: { color: palette.muted, fontSize: 14, lineHeight: 20, marginTop: -6 },
  questionLabelSmall: { color: palette.text, fontSize: 15, fontWeight: '900' },
  scaleRow: { flexDirection: 'row', gap: 9, marginTop: 6 },
  scaleCell: { flex: 1, minWidth: 44, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  scaleCellActive: { borderColor: palette.accent, backgroundColor: palette.accent },
  scaleCellText: { color: palette.text, fontSize: 18, fontWeight: '900' },
  scaleCellTextActive: { color: '#081000' },
  scaleEndpoints: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  endpoint: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  dimmed: { opacity: 0.45 },
  choiceStack: { gap: 9 },
  choiceStackHorizontal: { flexDirection: 'row', gap: 8 },
  choiceCard: { minHeight: 60, borderRadius: 16, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, paddingVertical: 12 },
  choiceChip: { flex: 1, minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  choiceCardActive: { borderColor: palette.accent, backgroundColor: palette.accentDark },
  choiceContent: { flex: 1 },
  choiceLabel: { color: palette.text, fontSize: 15, fontWeight: '800' },
  choiceLabelActive: { color: palette.accent },
  choiceDetail: { color: palette.muted, fontSize: 12, lineHeight: 16, marginTop: 2 },
  choiceDot: { width: 19, height: 19, borderRadius: 10, borderWidth: 2, borderColor: palette.muted, alignItems: 'center', justifyContent: 'center' },
  choiceDotActive: { borderColor: palette.accent },
  choiceDotCenter: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.accent },
  sleepValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginTop: 8 },
  sleepStepper: { width: 48, height: 48, borderRadius: 24, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' },
  sleepReadout: { minWidth: 140, alignItems: 'center' },
  sleepReadoutValue: { color: palette.accent, fontSize: 40, fontWeight: '900', letterSpacing: -1 },
  sleepTrackWrap: { marginTop: 22, paddingVertical: 8 },
  sleepTrack: { height: 8, borderRadius: 4, backgroundColor: palette.surface2, justifyContent: 'center' },
  sleepTrackFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4, backgroundColor: palette.accent },
  sleepThumb: { position: 'absolute', width: 26, height: 26, borderRadius: 13, backgroundColor: palette.accent, borderWidth: 3, borderColor: palette.bg, marginLeft: -13 },
  sleepTicks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  sleepTickText: { color: palette.muted, fontSize: 11, fontWeight: '700' },
  unusualRow: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#6D4720', backgroundColor: '#2A1B0C', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, marginTop: 4 },
  unusualRowConfirmed: { borderColor: palette.accent, backgroundColor: palette.accentDark },
  unusualText: { color: palette.text, fontSize: 12, lineHeight: 16, fontWeight: '700', flex: 1 },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface2, color: palette.text, paddingHorizontal: 12, fontSize: 14, marginTop: 4 },
  notes: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
  stage: { gap: 24 },
  stageTitle: { color: palette.text, fontSize: 31, lineHeight: 36, fontWeight: '900' },
  stageCopy: { color: palette.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  resultCard: { gap: 15, borderWidth: 1.5, padding: 18 },
  resultHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  resultHeading: { flex: 1 },
  signal: { width: 15, height: 15, borderRadius: 8 },
  resultLevel: { fontSize: 12, fontWeight: '900', letterSpacing: 1.1, textTransform: 'uppercase' },
  resultTitle: { color: palette.text, fontSize: 24, fontWeight: '900', marginTop: 2 },
  guidance: { color: palette.text, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  reasonList: { gap: 8, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 13 },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  reasonIcon: { marginTop: 6 },
  reasonText: { color: palette.muted, fontSize: 12, lineHeight: 18, flex: 1 },
  reassessment: { gap: 5, borderColor: '#6D4720' },
  reassessmentCopy: { color: palette.muted, fontSize: 12, lineHeight: 17, marginBottom: 8 },
  safetyNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingHorizontal: 4 },
  safetyText: { color: palette.muted, fontSize: 11, lineHeight: 16, flex: 1 },
  editAnswers: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  editAnswersText: { color: palette.muted, fontSize: 12, fontWeight: '800' },
  bottomBar: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderTopColor: palette.border, backgroundColor: palette.bg },
});
