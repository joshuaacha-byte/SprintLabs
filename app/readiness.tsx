import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Picker } from '@react-native-picker/picker';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
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

type CheckInStage = 1 | 2 | 3 | 4;

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

function CompactScale({
  value,
  left,
  right,
  onChange,
}: {
  value: number;
  left: string;
  right: string;
  onChange: (value: number) => void;
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View>
      <View style={styles.scale}>
        {Array.from({ length: 5 }, (_, index) => index + 1).map(number => {
          const selected = value === number;
          return (
            <Pressable
              key={number}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${number} out of 5`}
              onPress={() => {
                if (value !== number) selection();
                onChange(number);
              }}
              style={[styles.scaleItem, selected && styles.scaleActive]}>
              <Text style={[styles.scaleText, selected && styles.scaleTextActive]}>{number}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.scaleEndpoints}>
        <Text style={styles.endpoint}>{left}</Text>
        <Text style={styles.endpoint}>{right}</Text>
      </View>
    </View>
  );
}

function Choice<T extends string | boolean>({
  value,
  options,
  onChange,
  compact = false,
  dense = false,
  feedback,
}: {
  value: T | null | undefined;
  options: { value: T; label: string; detail?: string }[];
  onChange: (value: T) => void;
  compact?: boolean;
  dense?: boolean;
  feedback?: (value: T) => void;
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={[styles.choiceList, compact && styles.choiceListHorizontal]}>
      {options.map(option => {
        const selected = value === option.value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) {
                if (feedback) feedback(option.value);
                else selection();
              }
              onChange(option.value);
            }}
            style={[styles.choice, dense && styles.choiceDense, compact && styles.choiceCompact, selected && styles.choiceSelected]}>
            <View style={[styles.choiceDot, selected && styles.choiceDotSelected]}>
              {selected ? <View style={styles.choiceDotCenter} /> : null}
            </View>
            <View style={styles.choiceContent}>
              <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{option.label}</Text>
              {option.detail ? <Text style={styles.choiceDetail}>{option.detail}</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function StageProgress({ stage }: { stage: CheckInStage }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const items = [
    { number: 1, label: 'Recovery' },
    { number: 2, label: 'Fuel' },
    { number: 3, label: 'Body' },
  ];
  return (
    <View style={styles.progressWrap}>
      {items.map((item, index) => {
        const active = stage === item.number;
        const complete = stage > item.number;
        return (
          <View key={item.number} style={styles.progressItem}>
            <View style={[styles.progressDot, (active || complete) && styles.progressDotActive]}>
              {complete
                ? <MaterialIcons name="check" size={13} color="#081000" />
                : <Text style={[styles.progressNumber, active && styles.progressNumberActive]}>{item.number}</Text>}
            </View>
            <Text style={[styles.progressLabel, (active || complete) && styles.progressLabelActive]}>{item.label}</Text>
            {index < items.length - 1 ? <View style={[styles.progressLine, complete && styles.progressLineActive]} /> : null}
          </View>
        );
      })}
    </View>
  );
}

export default function ReadinessScreen() {
  const router = useRouter();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { launch } = useLocalSearchParams<{ launch?: string }>();
  const [stage, setStage] = useState<CheckInStage>(1);
  const [sleepHours, setSleepHours] = useState(-1);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [sleepPickerOpen, setSleepPickerOpen] = useState(false);
  const [unusualSleepConfirmed, setUnusualSleepConfirmed] = useState(false);
  const [sleepQuality, setSleepQuality] = useState(0);
  const [legReadiness, setLegReadiness] = useState(0);
  const [focus, setFocus] = useState(0);
  const [foodStatus, setFoodStatus] = useState<ReadinessFuelStatus>();
  const [hydrated, setHydrated] = useState<boolean | null>(null);
  const [soreness, setSoreness] = useState(0);
  const [hasLocalizedIssue, setHasLocalizedIssue] = useState<boolean | null>(null);
  const [symptomSheetOpen, setSymptomSheetOpen] = useState(false);
  const [sensation, setSensation] = useState<ReadinessSensation>();
  const [location, setLocation] = useState<ReadinessLocation>();
  const [otherLocationDetail, setOtherLocationDetail] = useState('');
  const [hesitatesAtMaxEffort, setHesitatesAtMaxEffort] = useState<boolean | null>(null);
  const [painNotes, setPainNotes] = useState('');
  const [warmupReassessment, setWarmupReassessment] = useState<WarmupReassessment>();
  const [baseline, setBaseline] = useState<ReadinessBaseline>({ sampleCount: 0 });
  const symptomScrollRef = useRef<ScrollView>(null);
  const symptomFieldOffsets = useRef<Record<'location' | 'sensation' | 'movement', number>>({
    location: 0,
    sensation: 0,
    movement: 0,
  });

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
  const sleepLabel = sleepHours < 0
    ? 'Select'
    : `${sleepHours} hr${sleepHours === 1 ? '' : 's'}${sleepMinutes ? ` ${sleepMinutes} min` : ''}`;
  const locationComplete = Boolean(location) && (location !== 'other' || Boolean(otherLocationDetail.trim()));
  const symptomComplete = hasLocalizedIssue === false
    || (hasLocalizedIssue === true && Boolean(sensation) && locationComplete && hesitatesAtMaxEffort !== null);
  const recoveryComplete = sleepNumber >= 0 && sleepNumber <= 14
    && (!unusualSleep || unusualSleepConfirmed)
    && sleepQuality > 0
    && legReadiness > 0;
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
    valid,
    sleepNumber,
    sleepQuality,
    neuralReadiness,
    focus,
    foodStatus,
    hydrated,
    soreness,
    hasLocalizedIssue,
    sensation,
    location,
    otherLocationDetail,
    hesitatesAtMaxEffort,
    warmupReassessment,
    painNotes,
  ]);

  const evaluation = useMemo(() => draft ? evaluateReadiness(draft, baseline) : null, [draft, baseline]);

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

  const dismissSymptomSheet = () => {
    tap();
    setSymptomSheetOpen(false);
  };
  const saveSymptomSheet = () => {
    const missing = !locationComplete
      ? { field: 'location' as const, label: location === 'other' ? 'Add the specific body area.' : 'Choose the body area.' }
      : !sensation
        ? { field: 'sensation' as const, label: 'Choose how you would describe it.' }
        : hesitatesAtMaxEffort === null
          ? { field: 'movement' as const, label: 'Choose whether it affects normal movement.' }
          : null;
    if (missing) {
      error();
      Alert.alert('One detail is missing', missing.label);
      symptomScrollRef.current?.scrollTo({
        y: Math.max(0, symptomFieldOffsets.current[missing.field] - 12),
        animated: true,
      });
      return;
    }
    warning();
    setSymptomSheetOpen(false);
  };
  const symptomSheetPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 55 || gesture.vy > 0.8) setSymptomSheetOpen(false);
    },
  }), []);

  const moveForward = () => {
    if (stage === 1 && recoveryComplete) {
      completeStep();
      setStage(2);
    } else if (stage === 2 && fuelComplete) {
      completeStep();
      setStage(3);
    } else if (stage === 3 && bodyComplete) {
      if (evaluation?.level === 'yellow' || evaluation?.level === 'red') warning();
      else completeStep();
      setStage(4);
    } else {
      error();
    }
  };

  const resultColor = evaluation?.level === 'green'
    ? palette.accent
    : evaluation?.level === 'yellow'
      ? palette.orange
      : palette.red;
  const resultBackground = evaluation?.level === 'green'
    ? '#162000'
    : evaluation?.level === 'yellow'
      ? '#2A1B0C'
      : '#2A1216';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.shell}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={stage === 1 ? 'Close readiness check-in' : 'Go to previous step'}
            onPress={() => {
              tap();
              if (stage === 1) router.back();
              else setStage(previous => Math.max(1, previous - 1) as CheckInStage);
            }}
            style={styles.back}>
            <MaterialIcons name={stage === 1 ? 'close' : 'arrow-back'} size={22} color={palette.text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>BEFORE TRAINING</Text>
            <Text style={styles.headerTitle}>Readiness check-in</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => { tap(); skip(); }} style={styles.skipTop}>
            <Text style={styles.skipTopText}>Skip</Text>
          </Pressable>
        </View>

        {stage < 4 ? <StageProgress stage={stage} /> : null}

        <ScrollView
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {stage === 1 ? (
            <View style={styles.stage}>
              <View>
                <Text style={styles.stageTitle}>Recovery</Text>
                <Text style={styles.stageCopy}>A quick check of sleep and how ready your legs feel.</Text>
              </View>

              <View style={styles.questionGroup}>
                <Text style={styles.questionLabel}>Sleep duration</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Sleep duration, ${sleepLabel}`}
                  onPress={() => { tap(); setSleepPickerOpen(true); }}
                  style={styles.valueRow}>
                  <View style={styles.valueIcon}><MaterialIcons name="bedtime" size={20} color={palette.accent} /></View>
                  <Text style={styles.valueRowLabel}>Sleep duration</Text>
                  <Text style={[styles.valueRowValue, sleepHours < 0 && styles.valuePlaceholder]}>{sleepLabel}</Text>
                  <MaterialIcons name="chevron-right" size={22} color={palette.muted} />
                </Pressable>
                {unusualSleep ? (
                  <Pressable
                    onPress={() => { selection(); setUnusualSleepConfirmed(value => !value); }}
                    style={[styles.unusualRow, unusualSleepConfirmed && styles.unusualRowConfirmed]}>
                    <MaterialIcons
                      name={unusualSleepConfirmed ? 'check-circle' : 'error-outline'}
                      size={19}
                      color={unusualSleepConfirmed ? palette.accent : palette.orange}
                    />
                    <Text style={styles.unusualText}>
                      {unusualSleepConfirmed ? `${sleepLabel} confirmed` : `${sleepLabel} is unusual. Tap to confirm it is correct.`}
                    </Text>
                  </Pressable>
                ) : null}
                {baseline.sampleCount >= 3 && baseline.averageSleep !== undefined ? (
                  <Text style={styles.baselineText}>Recent average: {baseline.averageSleep.toFixed(1)} hours</Text>
                ) : null}
              </View>

              <View style={styles.questionGroup}>
                <Text style={styles.questionLabel}>Sleep quality</Text>
                <CompactScale value={sleepQuality} left="Poor" right="Great" onChange={setSleepQuality} />
              </View>

              <View style={styles.questionGroup}>
                <Text style={styles.questionLabel}>How ready do your legs feel?</Text>
                <CompactScale value={legReadiness} left="Heavy" right="Springy" onChange={setLegReadiness} />
              </View>
            </View>
          ) : null}

          {stage === 2 ? (
            <View style={styles.stage}>
              <View>
                <Text style={styles.stageTitle}>Fuel and focus</Text>
                <Text style={styles.stageCopy}>Compare today with what is normal for you at this time of day.</Text>
              </View>

              <View style={styles.questionGroup}>
                <Text style={styles.questionLabel}>Mental focus</Text>
                <CompactScale value={focus} left="Distracted" right="Locked in" onChange={setFocus} />
              </View>

              <View style={styles.questionGroup}>
                <Text style={styles.questionLabel}>Food today</Text>
                <Choice
                  value={foodStatus}
                  onChange={setFoodStatus}
                  options={[
                    { value: 'normal', label: 'Eating normally' },
                    { value: 'fasted-usual', label: 'Training fasted as usual' },
                    { value: 'underfueled', label: 'Less food than normal' },
                  ]}
                />
              </View>

              <View style={styles.questionGroup}>
                <Text style={styles.questionLabel}>Hydration</Text>
                <Choice
                  compact
                  value={hydrated}
                  onChange={setHydrated}
                  options={[
                    { value: true, label: 'About normal' },
                    { value: false, label: 'Less than normal' },
                  ]}
                />
              </View>
            </View>
          ) : null}

          {stage === 3 ? (
            <View style={styles.stage}>
              <View>
                <Text style={styles.stageTitle}>Body status</Text>
                <Text style={styles.stageCopy}>Record general soreness and anything localized before training.</Text>
              </View>

              <View style={styles.questionGroup}>
                <Text style={styles.questionLabel}>General training soreness</Text>
                <CompactScale value={soreness} left="None" right="Severe" onChange={setSoreness} />
              </View>

              <View style={styles.questionGroup}>
                <Text style={styles.questionLabel}>Any localized tightness, pulling, or pain?</Text>
                <Choice
                  compact
                  value={hasLocalizedIssue}
                  feedback={value => value ? warning() : selection()}
                  onChange={value => {
                    setHasLocalizedIssue(value);
                    if (value) setSymptomSheetOpen(true);
                    else clearLocalizedIssue();
                  }}
                  options={[
                    { value: false, label: 'No' },
                    { value: true, label: 'Yes' },
                  ]}
                />
                {hasLocalizedIssue && symptomComplete ? (
                  <Pressable onPress={() => { tap(); setSymptomSheetOpen(true); }} style={styles.symptomSummary}>
                    <MaterialIcons name="check-circle" size={19} color={palette.orange} />
                    <View style={styles.symptomSummaryCopy}>
                      <Text style={styles.symptomSummaryTitle}>Symptom details recorded</Text>
                      <Text style={styles.symptomSummaryText}>
                        {location === 'other' ? otherLocationDetail : location ? locationLabels[location] : ''}
                        {' · '}
                        {sensation ? sensationLabels[sensation] : ''}
                      </Text>
                    </View>
                    <Text style={styles.editText}>Edit</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}

          {stage === 4 && evaluation ? (
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
                  <Text style={styles.questionLabel}>Recheck after your normal warm-up</Text>
                  <Text style={styles.reassessmentCopy}>How did the flagged issue or overall readiness change?</Text>
                  <Choice
                    compact
                    value={warmupReassessment}
                    feedback={value => value === 'worse' ? warning() : selection()}
                    onChange={setWarmupReassessment}
                    options={[
                      { value: 'better', label: 'Better' },
                      { value: 'same', label: 'Same' },
                      { value: 'worse', label: 'Worse' },
                    ]}
                  />
                </Card>
              ) : null}

              <View style={styles.safetyNote}>
                <MaterialIcons name="health-and-safety" size={19} color={palette.muted} />
                <Text style={styles.safetyText}>SprintLab can flag concerns, but it cannot diagnose an injury or confirm that training is safe.</Text>
              </View>

              <Pressable onPress={() => { tap(); setStage(1); }} style={styles.editAnswers}>
                <MaterialIcons name="edit" size={17} color={palette.muted} />
                <Text style={styles.editAnswersText}>Edit answers</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.bottomBar}>
          {stage < 4 ? (
            <PrimaryButton
              title={
                stage === 1
                  ? 'Continue to fuel'
                  : stage === 2
                    ? 'Continue to body status'
                    : bodyComplete
                      ? 'Review today’s readiness'
                      : 'Complete body status'
              }
              onPress={moveForward}
              disabled={
                (stage === 1 && !recoveryComplete)
                || (stage === 2 && !fuelComplete)
                || (stage === 3 && !bodyComplete)
              }
            />
          ) : (
            <PrimaryButton
              title={
                evaluation?.level === 'red'
                  ? 'Return to Today'
                  : evaluation?.requiresWarmupReassessment && !warmupReassessment
                    ? 'Reassess after warm-up'
                    : launch === 'pending'
                      ? 'Continue to today’s workout'
                      : 'Save readiness'
              }
              onPress={evaluation?.level === 'red' ? saveAndReturnToToday : save}
              disabled={!evaluation || (evaluation.requiresWarmupReassessment && !warmupReassessment)}
            />
          )}
        </View>
      </View>

      <Modal visible={sleepPickerOpen} transparent animationType="slide" onRequestClose={() => setSleepPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => { tap(); setSleepPickerOpen(false); }}>
          <Pressable style={styles.sheet} onPress={event => event.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Sleep duration</Text>
                <Text style={styles.sheetCopy}>Choose your actual sleep time.</Text>
              </View>
              <Pressable
                onPress={() => {
                  tap();
                  if (sleepHours < 0) setSleepHours(8);
                  setSleepPickerOpen(false);
                }}
                style={styles.doneButton}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>
            <View style={styles.durationPickers}>
              <Picker
                selectedValue={sleepHours < 0 ? 8 : sleepHours}
                onValueChange={value => {
                  if (sleepHours !== Number(value)) selection();
                  setSleepHours(Number(value));
                  setUnusualSleepConfirmed(false);
                }}
                dropdownIconColor={palette.text}
                style={styles.picker}>
                {Array.from({ length: 15 }, (_, hour) => <Picker.Item key={hour} label={`${hour} hr`} value={hour} />)}
              </Picker>
              <Picker
                selectedValue={sleepMinutes}
                onValueChange={value => {
                  if (sleepMinutes !== Number(value)) selection();
                  setSleepMinutes(Number(value));
                  setUnusualSleepConfirmed(false);
                }}
                dropdownIconColor={palette.text}
                style={styles.picker}>
                {[0, 15, 30, 45].map(minutes => <Picker.Item key={minutes} label={`${minutes} min`} value={minutes} />)}
              </Picker>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={symptomSheetOpen} transparent animationType="slide" onRequestClose={dismissSymptomSheet}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.symptomSheet}>
            <View style={styles.symptomFixedHeader} {...symptomSheetPanResponder.panHandlers}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <View style={styles.sheetHeaderCopy}>
                  <Text style={styles.sheetTitle}>Localized symptom</Text>
                  <Text style={styles.sheetCopy}>Record what you notice. This is not a diagnosis.</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close symptom details" onPress={dismissSymptomSheet} style={styles.closeButton}>
                  <MaterialIcons name="close" size={21} color={palette.text} />
                </Pressable>
              </View>
            </View>

            <ScrollView
              ref={symptomScrollRef}
              style={styles.symptomScroll}
              contentContainerStyle={styles.symptomSheetContent}
              keyboardShouldPersistTaps="handled">
              <View
                style={styles.questionGroup}
                onLayout={event => { symptomFieldOffsets.current.location = event.nativeEvent.layout.y; }}>
                <Text style={styles.questionLabel}>Where is it?</Text>
                <Choice
                  dense
                  value={location}
                  onChange={value => {
                    setLocation(value);
                    if (value !== 'other') setOtherLocationDetail('');
                  }}
                  options={(Object.entries(locationLabels) as [ReadinessLocation, string][])
                    .map(([value, label]) => ({ value, label }))}
                />
                {location === 'other' ? (
                  <TextInput
                    value={otherLocationDetail}
                    onChangeText={setOtherLocationDetail}
                    placeholder="Name the specific area"
                    placeholderTextColor={palette.muted}
                    style={styles.input}
                  />
                ) : null}
              </View>

              <View
                style={styles.questionGroup}
                onLayout={event => { symptomFieldOffsets.current.sensation = event.nativeEvent.layout.y; }}>
                <Text style={styles.questionLabel}>How would you describe it?</Text>
                <Choice
                  dense
                  value={sensation}
                  onChange={setSensation}
                  options={[
                    { value: 'minor-tightness', label: sensationLabels['minor-tightness'], detail: 'Tight or stiff; may ease during warm-up.' },
                    { value: 'lingering-niggle', label: sensationLabels['lingering-niggle'], detail: 'Persistent pulling, aching, or discomfort.' },
                    { value: 'severe-acute', label: sensationLabels['severe-acute'], detail: 'Sharp, sudden, or affecting normal movement.' },
                  ]}
                />
              </View>

              <View
                style={styles.questionGroup}
                onLayout={event => { symptomFieldOffsets.current.movement = event.nativeEvent.layout.y; }}>
                <Text style={styles.questionLabel}>Does it affect normal movement or make you hold back?</Text>
                <Choice
                  compact
                  dense
                  value={hesitatesAtMaxEffort}
                  onChange={setHesitatesAtMaxEffort}
                  options={[
                    { value: false, label: 'No' },
                    { value: true, label: 'Yes' },
                  ]}
                />
              </View>

              <View style={styles.questionGroup}>
                <Text style={styles.questionLabel}>Optional note</Text>
                <TextInput
                  value={painNotes}
                  onChangeText={setPainNotes}
                  multiline
                  placeholder="When it began or what you noticed"
                  placeholderTextColor={palette.muted}
                  style={[styles.input, styles.notes]}
                />
              </View>
            </ScrollView>
            <View style={styles.symptomFooter}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !symptomComplete }}
                onPress={saveSymptomSheet}
                style={[styles.symptomSave, !symptomComplete && styles.symptomSaveDisabled]}>
                <Text style={[styles.symptomSaveText, !symptomComplete && styles.symptomSaveTextDisabled]}>Save symptom details</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (palette: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  shell: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { minHeight: 66, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 44, height: 44, borderRadius: 15, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  eyebrow: { color: palette.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  headerTitle: { color: palette.text, fontSize: 18, fontWeight: '900', marginTop: 2 },
  skipTop: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  skipTopText: { color: palette.muted, fontSize: 13, fontWeight: '800' },
  progressWrap: { paddingHorizontal: 20, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' },
  progressItem: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  progressDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  progressDotActive: { borderColor: palette.accent, backgroundColor: palette.accent },
  progressNumber: { color: palette.muted, fontSize: 10, fontWeight: '900' },
  progressNumberActive: { color: '#081000' },
  progressLabel: { color: palette.muted, fontSize: 10, fontWeight: '800', marginLeft: 6 },
  progressLabelActive: { color: palette.text },
  progressLine: { flex: 1, height: 1, backgroundColor: palette.border, marginHorizontal: 8 },
  progressLineActive: { backgroundColor: palette.accent },
  page: { padding: 20, paddingBottom: 28, flexGrow: 1 },
  stage: { gap: 24 },
  stageTitle: { color: palette.text, fontSize: 31, lineHeight: 36, fontWeight: '900' },
  stageCopy: { color: palette.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  questionGroup: { gap: 4 },
  questionLabel: { color: palette.text, fontSize: 15, lineHeight: 20, fontWeight: '900', marginBottom: 7 },
  valueRow: { minHeight: 58, borderRadius: 15, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 },
  valueIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: palette.accentDark, alignItems: 'center', justifyContent: 'center' },
  valueRowLabel: { color: palette.text, fontSize: 14, fontWeight: '800', flex: 1 },
  valueRowValue: { color: palette.text, fontSize: 14, fontWeight: '900' },
  valuePlaceholder: { color: palette.muted },
  unusualRow: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#6D4720', backgroundColor: '#2A1B0C', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, marginTop: 7 },
  unusualRowConfirmed: { borderColor: palette.accent, backgroundColor: palette.accentDark },
  unusualText: { color: palette.text, fontSize: 11, lineHeight: 16, fontWeight: '700', flex: 1 },
  baselineText: { color: palette.muted, fontSize: 11, marginTop: 5 },
  scale: { flexDirection: 'row', gap: 7 },
  scaleItem: { flex: 1, minWidth: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  scaleActive: { borderColor: palette.accent, backgroundColor: palette.accent },
  scaleText: { color: palette.text, fontSize: 14, fontWeight: '900' },
  scaleTextActive: { color: '#081000' },
  scaleEndpoints: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 2 },
  endpoint: { color: palette.muted, fontSize: 11, fontWeight: '700' },
  choiceList: { gap: 7 },
  choiceListHorizontal: { flexDirection: 'row' },
  choice: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9 },
  choiceDense: { minHeight: 44, paddingVertical: 6 },
  choiceCompact: { flex: 1 },
  choiceSelected: { borderColor: palette.accent, backgroundColor: palette.accentDark },
  choiceDot: { width: 17, height: 17, borderRadius: 9, borderWidth: 2, borderColor: palette.muted, alignItems: 'center', justifyContent: 'center' },
  choiceDotSelected: { borderColor: palette.accent },
  choiceDotCenter: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.accent },
  choiceContent: { flex: 1 },
  choiceLabel: { color: palette.text, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  choiceLabelSelected: { color: palette.accent },
  choiceDetail: { color: palette.muted, fontSize: 11, lineHeight: 15, marginTop: 2 },
  symptomSummary: { minHeight: 56, borderRadius: 13, borderWidth: 1, borderColor: '#6D4720', backgroundColor: '#2A1B0C', flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, marginTop: 8 },
  symptomSummaryCopy: { flex: 1 },
  symptomSummaryTitle: { color: palette.text, fontSize: 12, fontWeight: '900' },
  symptomSummaryText: { color: palette.muted, fontSize: 11, marginTop: 2 },
  editText: { color: palette.accent, fontSize: 12, fontWeight: '900' },
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
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: { backgroundColor: palette.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, borderTopWidth: 1, borderColor: palette.border },
  symptomSheet: { height: '82%', maxHeight: 700, backgroundColor: palette.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: palette.border, overflow: 'hidden' },
  symptomFixedHeader: { paddingHorizontal: 18, paddingTop: 9, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: palette.border },
  symptomScroll: { flex: 1 },
  symptomSheetContent: { padding: 18, paddingBottom: 24, gap: 17 },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: palette.border, alignSelf: 'center', marginBottom: 10 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetHeaderCopy: { flex: 1 },
  sheetTitle: { color: palette.text, fontSize: 20, fontWeight: '900' },
  sheetCopy: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  doneButton: { minWidth: 58, minHeight: 44, borderRadius: 12, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13 },
  doneText: { color: '#081000', fontSize: 13, fontWeight: '900' },
  closeButton: { width: 44, height: 44, borderRadius: 13, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' },
  symptomFooter: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 22 : 14, borderTopWidth: 1, borderTopColor: palette.border, backgroundColor: palette.surface },
  symptomSave: { minHeight: 50, borderRadius: 14, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  symptomSaveDisabled: { backgroundColor: palette.surface2, borderWidth: 1, borderColor: palette.border },
  symptomSaveText: { color: '#081000', fontSize: 14, fontWeight: '900' },
  symptomSaveTextDisabled: { color: palette.muted },
  durationPickers: { flexDirection: 'row', gap: 8, marginTop: 14 },
  picker: { flex: 1, color: palette.text, backgroundColor: palette.surface2 },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface2, color: palette.text, paddingHorizontal: 12, fontSize: 14, marginTop: 7 },
  notes: { minHeight: 78, paddingTop: 12, textAlignVertical: 'top' },
});
