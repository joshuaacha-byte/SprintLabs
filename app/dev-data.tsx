import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Card, Eyebrow, PrimaryButton, ScreenTitle } from '@/components/sprint-ui';
import { Palette, useTheme } from '@/constants/sprintlab';
import type { LibraryWorkout, SprintEvent } from '@/types';
import { getLibraryWorkouts, isRecommendationEligible } from '@/utils/workout-library';
import {
  clearDevDataSnapshot,
  clearGeneratedDevTestData,
  getCompletedWorkoutSessions,
  getScheduleHistory,
  getWeekSchedule,
  hasDevDataSnapshot,
  hasGeneratedDevTestData,
  restoreDevDataSnapshot,
  saveDevDataSnapshot,
} from '@/utils/storage';
import { calculateConsistencyStreak, calculateLongestPlanStreak, calculatePlanStreak } from '@/utils/streaks';
import {
  DEV_SCENARIOS,
  generateCompletedWorkout,
  generatePRSequence,
  generateStreakDays,
  runDevScenario,
  type DevScenarioId,
  type GeneratedWorkoutStatus,
} from '@/utils/dev-data';
import { tap, selection, success, error as errorHaptic } from '@/utils/haptics';

const dateKey = (date = new Date()) => date.toLocaleDateString('en-CA');
const statuses: GeneratedWorkoutStatus[] = ['completed', 'partial', 'abandoned'];
const events: SprintEvent[] = ['60m', '100m', '200m', '300m', '400m'];

export default function DevDataScreen() {
  const router = useRouter();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState({ hasTestData: false, snapshotAt: null as string | null, planStreak: 0, longestStreak: 0, consistencyStreak: 0, completedCount: 0 });

  const [workoutPickerOpen, setWorkoutPickerOpen] = useState(false);
  const [workouts, setWorkouts] = useState<LibraryWorkout[]>([]);
  const [selectedWorkout, setSelectedWorkout] = useState<LibraryWorkout | null>(null);
  const [manualDate, setManualDate] = useState(dateKey());
  const [manualStatus, setManualStatus] = useState<GeneratedWorkoutStatus>('completed');
  const [manualRpe, setManualRpe] = useState('6');
  const [manualDuration, setManualDuration] = useState('60');
  const [manualNotes, setManualNotes] = useState('');

  const [streakLength, setStreakLength] = useState('7');
  const [prEvent, setPrEvent] = useState<SprintEvent>('100m');
  const [prResult, setPrResult] = useState('');
  const [prDate, setPrDate] = useState(dateKey());

  const refresh = useCallback(async () => {
    const [hasTestData, snapshotAt, schedule, scheduleHistory, sessions] = await Promise.all([
      hasGeneratedDevTestData(),
      hasDevDataSnapshot(),
      getWeekSchedule(),
      getScheduleHistory(),
      getCompletedWorkoutSessions(),
    ]);
    setSummary({
      hasTestData,
      snapshotAt,
      planStreak: calculatePlanStreak(schedule, sessions, new Date(), scheduleHistory),
      longestStreak: calculateLongestPlanStreak(schedule, sessions, new Date(), scheduleHistory),
      consistencyStreak: calculateConsistencyStreak(schedule, sessions, new Date(), scheduleHistory),
      completedCount: sessions.length,
    });
  }, []);

  useFocusEffect(useCallback(() => {
    refresh();
    getLibraryWorkouts().then(list => setWorkouts(list.filter(isRecommendationEligible)));
  }, [refresh]));

  const run = async (label: string, action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await refresh();
      success();
      Alert.alert(label, 'Done. Real streak/PR/milestone/Coach data now reflects this.');
    } catch (err) {
      errorHaptic();
      Alert.alert('Could not complete this action', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const runScenario = (id: DevScenarioId, label: string) => run(label, () => runDevScenario(id));

  const generateManualWorkout = () => {
    if (!selectedWorkout) { errorHaptic(); Alert.alert('Choose a workout', 'Pick a workout from the library first.'); return; }
    run('Workout generated', () => generateCompletedWorkout({
      workout: selectedWorkout,
      dateKey: manualDate,
      status: manualStatus,
      rpe: Number(manualRpe) || 6,
      durationMinutes: Number(manualDuration) || 60,
      notes: manualNotes,
    }));
  };

  const addPrResult = () => {
    const timeSeconds = Number(prResult);
    if (!timeSeconds || timeSeconds <= 0) { errorHaptic(); Alert.alert('Enter a result', 'Enter a time in seconds, e.g. 11.24.'); return; }
    run('PR result added', () => generatePRSequence(prEvent, [{ dateKey: prDate, timeSeconds }], 'Development test PR entry.'));
  };

  const setStreakTo = () => {
    const length = Math.max(1, Math.round(Number(streakLength) || 0));
    run(`Streak set to ${length}`, () => generateStreakDays(length));
  };

  const addStreakDay = () => run('Added one streak day', () => generateStreakDays(summary.planStreak + 1));

  const clearTestData = () => {
    Alert.alert(
      'Clear generated test data?',
      'Removes only development-generated records (prefixed for test data). Your real workouts, if any, are never touched.',
      [{ text: 'Cancel', style: 'cancel' }, {
        text: 'Clear test data', style: 'destructive', onPress: () => run('Test data cleared', () => clearGeneratedDevTestData()),
      }],
    );
  };

  const takeSnapshot = () => run('Snapshot saved', () => saveDevDataSnapshot());

  const restoreSnapshot = () => {
    Alert.alert(
      'Restore snapshot?',
      'Replaces current History/streak/schedule data with what was saved in the snapshot. Anything generated or changed since will be lost.',
      [{ text: 'Cancel', style: 'cancel' }, {
        text: 'Restore', style: 'destructive', onPress: () => run('Snapshot restored', async () => {
          const restored = await restoreDevDataSnapshot();
          if (!restored) throw new Error('No snapshot was saved yet.');
        }),
      }],
    );
  };

  const discardSnapshot = () => run('Snapshot discarded', () => clearDevDataSnapshot());

  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.headerRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => { tap(); router.back(); }} style={styles.back}><MaterialIcons name="arrow-back" size={22} color={palette.text} /></Pressable>
        <View style={{ flex: 1 }} />
      </View>
      <Eyebrow>Developer-only · never shown in production</Eyebrow>
      <ScreenTitle subtitle="Generates real completed sessions through SprintLab's own storage and streak/PR engines — nothing here fakes what the UI displays.">Development Data</ScreenTitle>

      {(summary.hasTestData || summary.snapshotAt) ? <View style={styles.activeBanner}><MaterialIcons name="science" size={16} color={palette.orange} /><Text style={styles.activeBannerText}>TEST DATA ACTIVE{summary.snapshotAt ? ' · snapshot saved' : ''}</Text></View> : null}

      <Card style={styles.summaryCard}>
        <Text style={styles.cardLabel}>Current state (computed live, not stored)</Text>
        <View style={styles.summaryGrid}>
          <SummaryStat label="Plan Streak" value={String(summary.planStreak)} />
          <SummaryStat label="Longest" value={String(summary.longestStreak)} />
          <SummaryStat label="Consistency" value={`${summary.consistencyStreak} wk`} />
          <SummaryStat label="Completed sessions" value={String(summary.completedCount)} />
        </View>
      </Card>

      <SectionLabel text="Quick scenario presets" />
      <View style={styles.presetGrid}>
        {DEV_SCENARIOS.map(scenario => <Pressable key={scenario.id} disabled={busy} onPress={() => { tap(); runScenario(scenario.id, scenario.label); }} style={styles.presetTile}>
          <Text style={styles.presetLabel}>{scenario.label}</Text>
          <Text style={styles.presetDescription}>{scenario.description}</Text>
        </Pressable>)}
      </View>

      <SectionLabel text="Streak controls" />
      <Card style={styles.formCard}>
        <Text style={styles.hint}>Generates real dated completions on the athlete&apos;s actual scheduled-workout weekdays and lets utils/streaks.ts compute the result — nothing is written as a raw streak number.</Text>
        <View style={styles.row}>
          <TextInput value={streakLength} onChangeText={setStreakLength} keyboardType="number-pad" placeholder="7" placeholderTextColor={palette.muted} style={[styles.input, styles.grow]} />
          <Pressable disabled={busy} onPress={setStreakTo} style={styles.smallButton}><Text style={styles.smallButtonText}>Set streak</Text></Pressable>
        </View>
        <View style={styles.row}>
          <Pressable disabled={busy} onPress={addStreakDay} style={styles.smallButton}><Text style={styles.smallButtonText}>+1 day</Text></Pressable>
          <Pressable disabled={busy} onPress={() => runScenario('broken-streak', 'Broken streak')} style={styles.smallButton}><Text style={styles.smallButtonText}>Broken streak</Text></Pressable>
          <Pressable disabled={busy} onPress={refresh} style={styles.smallButton}><Text style={styles.smallButtonText}>Recalculate</Text></Pressable>
        </View>
      </Card>

      <SectionLabel text="Completed workout generator" />
      <Card style={styles.formCard}>
        <Pressable onPress={() => { tap(); setWorkoutPickerOpen(true); }} style={styles.pickerButton}>
          <MaterialIcons name="menu-book" size={18} color={palette.accent} />
          <Text style={styles.pickerButtonText}>{selectedWorkout ? selectedWorkout.name : 'Choose a workout from the library'}</Text>
        </Pressable>
        <View style={styles.row}>
          <LabeledInput label="Date" value={manualDate} onChangeText={setManualDate} styles={styles} />
          <LabeledInput label="RPE" value={manualRpe} onChangeText={setManualRpe} keyboardType="number-pad" styles={styles} />
        </View>
        <View style={styles.row}>
          <LabeledInput label="Duration (min)" value={manualDuration} onChangeText={setManualDuration} keyboardType="number-pad" styles={styles} />
        </View>
        <View style={styles.chips}>{statuses.map(status => <Pressable key={status} onPress={() => { selection(); setManualStatus(status); }} style={[styles.choice, manualStatus === status && styles.choiceSelected]}><Text style={[styles.choiceText, manualStatus === status && styles.choiceTextSelected]}>{status}</Text></Pressable>)}</View>
        <TextInput value={manualNotes} onChangeText={setManualNotes} placeholder="Notes · optional" placeholderTextColor={palette.muted} style={styles.input} />
        <PrimaryButton title="Generate workout" onPress={generateManualWorkout} disabled={busy} />
      </Card>

      <SectionLabel text="PR controls" />
      <Card style={styles.formCard}>
        <View style={styles.chips}>{events.map(event => <Pressable key={event} onPress={() => { selection(); setPrEvent(event); }} style={[styles.choice, prEvent === event && styles.choiceSelected]}><Text style={[styles.choiceText, prEvent === event && styles.choiceTextSelected]}>{event}</Text></Pressable>)}</View>
        <View style={styles.row}>
          <LabeledInput label="Result (seconds)" value={prResult} onChangeText={setPrResult} keyboardType="decimal-pad" styles={styles} />
          <LabeledInput label="Date" value={prDate} onChangeText={setPrDate} styles={styles} />
        </View>
        <View style={styles.row}>
          <Pressable disabled={busy} onPress={addPrResult} style={styles.smallButton}><Text style={styles.smallButtonText}>Add result</Text></Pressable>
          <Pressable disabled={busy} onPress={() => runScenario('pr-improvement', 'PR improvement sequence')} style={styles.smallButton}><Text style={styles.smallButtonText}>3-result improving preset</Text></Pressable>
        </View>
      </Card>

      <SectionLabel text="Snapshot" />
      <Card style={styles.formCard}>
        <Text style={styles.hint}>{summary.snapshotAt ? `Snapshot saved ${new Date(summary.snapshotAt).toLocaleString()}.` : 'No snapshot saved yet.'}</Text>
        <View style={styles.row}>
          <Pressable disabled={busy} onPress={takeSnapshot} style={styles.smallButton}><Text style={styles.smallButtonText}>Save snapshot</Text></Pressable>
          <Pressable disabled={busy || !summary.snapshotAt} onPress={restoreSnapshot} style={[styles.smallButton, !summary.snapshotAt && styles.disabled]}><Text style={styles.smallButtonText}>Restore snapshot</Text></Pressable>
          <Pressable disabled={busy || !summary.snapshotAt} onPress={discardSnapshot} style={[styles.smallButton, !summary.snapshotAt && styles.disabled]}><Text style={styles.smallButtonText}>Discard</Text></Pressable>
        </View>
      </Card>

      <SectionLabel text="Destructive" />
      <Card style={{ ...styles.formCard, ...styles.dangerCard }}>
        <Text style={styles.hint}>Removes every record this screen generated (identified by a development-only id prefix). Your real workouts are never affected.</Text>
        <Pressable disabled={busy} onPress={clearTestData} style={styles.dangerButton}><Text style={styles.dangerButtonText}>Clear generated test data</Text></Pressable>
      </Card>
    </ScrollView>

    <Modal visible={workoutPickerOpen} transparent animationType="slide" onRequestClose={() => setWorkoutPickerOpen(false)}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setWorkoutPickerOpen(false)} />
        <SafeAreaView style={styles.modalSheet}>
          <View style={styles.modalHead}><Text style={styles.modalTitle}>Choose a workout</Text><Pressable onPress={() => setWorkoutPickerOpen(false)}><MaterialIcons name="close" size={21} color={palette.text} /></Pressable></View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            {workouts.map(item => <Pressable key={item.id} onPress={() => { tap(); setSelectedWorkout(item); setWorkoutPickerOpen(false); }} style={styles.modalRow}>
              <Text style={styles.modalRowTitle}>{item.name}</Text>
              <Text style={styles.modalRowCopy}>{item.primaryCategory.replaceAll('-', ' ')}</Text>
            </Pressable>)}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  </SafeAreaView>;
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <View style={styles.statBox}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function SectionLabel({ text }: { text: string }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <Text style={styles.sectionLabel}>{text}</Text>;
}

function LabeledInput({ label, value, onChangeText, keyboardType, styles }: { label: string; value: string; onChangeText: (v: string) => void; keyboardType?: 'number-pad' | 'decimal-pad'; styles: ReturnType<typeof createStyles> }) {
  const palette = useTheme();
  return <View style={styles.grow}><Text style={styles.inputLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} placeholderTextColor={palette.muted} style={styles.input} /></View>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  page: { padding: 20, paddingBottom: 48, gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  back: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  activeBanner: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 34, borderRadius: 10, backgroundColor: '#2A1B0C', paddingHorizontal: 11, alignSelf: 'flex-start' },
  activeBannerText: { color: palette.orange, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  summaryCard: { gap: 10 },
  cardLabel: { color: palette.muted, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statBox: { flexBasis: '23%', flexGrow: 1, gap: 2 },
  statValue: { color: palette.text, fontSize: 18, fontWeight: '900' },
  statLabel: { color: palette.muted, fontSize: 9, fontWeight: '700' },
  sectionLabel: { color: palette.muted, fontWeight: '900', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginTop: 6 },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetTile: { flexBasis: '47%', flexGrow: 1, minHeight: 76, borderRadius: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, padding: 11, gap: 4 },
  presetLabel: { color: palette.text, fontSize: 12, fontWeight: '900' },
  presetDescription: { color: palette.muted, fontSize: 10, lineHeight: 14 },
  formCard: { gap: 10 },
  hint: { color: palette.muted, fontSize: 11, lineHeight: 16 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  grow: { flex: 1 },
  input: { backgroundColor: palette.surface2, borderColor: palette.border, borderWidth: 1, borderRadius: 12, minHeight: 44, color: palette.text, paddingHorizontal: 12, fontSize: 14 },
  inputLabel: { color: palette.muted, fontSize: 10, fontWeight: '800', marginBottom: 4 },
  smallButton: { minHeight: 42, paddingHorizontal: 12, borderRadius: 11, backgroundColor: palette.accentDark, alignItems: 'center', justifyContent: 'center' },
  smallButtonText: { color: palette.accent, fontSize: 11, fontWeight: '900' },
  disabled: { opacity: 0.4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { minHeight: 34, paddingHorizontal: 11, borderRadius: 9, justifyContent: 'center', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface2 },
  choiceSelected: { borderColor: palette.accent, backgroundColor: palette.accentDark },
  choiceText: { color: palette.muted, fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  choiceTextSelected: { color: palette.accent },
  pickerButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface2, paddingHorizontal: 12 },
  pickerButtonText: { color: palette.text, fontSize: 13, fontWeight: '700', flex: 1 },
  dangerCard: { borderColor: '#55282D' },
  dangerButton: { minHeight: 48, borderRadius: 13, backgroundColor: '#301719', alignItems: 'center', justifyContent: 'center' },
  dangerButtonText: { color: palette.red, fontSize: 13, fontWeight: '900' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.62)' },
  modalSheet: { maxHeight: '78%', backgroundColor: palette.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: palette.border },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8 },
  modalTitle: { color: palette.text, fontSize: 18, fontWeight: '900' },
  modalContent: { padding: 14, paddingBottom: 28, gap: 8 },
  modalRow: { minHeight: 56, borderRadius: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface2, paddingHorizontal: 12, justifyContent: 'center', gap: 2 },
  modalRowTitle: { color: palette.text, fontSize: 13, fontWeight: '900' },
  modalRowCopy: { color: palette.muted, fontSize: 10, textTransform: 'capitalize' },
});
