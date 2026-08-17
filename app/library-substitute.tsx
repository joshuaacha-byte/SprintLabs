import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Card, Eyebrow, ScreenTitle } from '@/components/sprint-ui';
import { Palette, useTheme } from '@/constants/sprintlab';
import type { LibraryWorkout } from '@/types';
import { libraryCategoryLabels } from '@/utils/library-taxonomy';
import { getSubstituteCandidates, SUBSTITUTE_INTENTS, type SubstituteCandidate, type SubstituteIntent } from '@/utils/library-retrieval';
import { getLibraryWorkout, getLibraryWorkouts } from '@/utils/workout-library';
import { getScheduledDayForDate } from '@/utils/storage';
import { applyAIPlanChange } from '@/utils/plan-change-apply';
import { error, selection, success, tap } from '@/utils/haptics';

/**
 * SprintLab Library V2 — "Find substitute". Reuses the same retrieval (utils/library-retrieval.ts)
 * and mutation pipeline (utils/plan-change-apply.ts) Coach's replace_workout proposals use, so a
 * manual substitution and an AI-proposed one are the exact same operation under the hood.
 */

export default function LibrarySubstituteScreen() {
  const router = useRouter();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { date } = useLocalSearchParams<{ date: string }>();
  const [original, setOriginal] = useState<LibraryWorkout | null | undefined>(undefined); // undefined = loading, null = not found/custom
  const [currentWorkoutId, setCurrentWorkoutId] = useState<string | null>(null);
  const [pool, setPool] = useState<LibraryWorkout[]>([]);
  const [intent, setIntent] = useState<SubstituteIntent>('best-match');
  const [applying, setApplying] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!date) return;
    setOriginal(undefined);
    Promise.all([getScheduledDayForDate(date), getLibraryWorkouts()]).then(async ([day, workouts]) => {
      setPool(workouts);
      const workoutId = day.kind === 'workout' ? day.workout?.id : undefined;
      setCurrentWorkoutId(workoutId ?? null);
      if (!workoutId) { setOriginal(null); return; }
      const sourceWorkout = await getLibraryWorkout(workoutId);
      setOriginal(sourceWorkout);
    });
  }, [date]));

  const candidates: SubstituteCandidate[] = useMemo(
    () => original ? getSubstituteCandidates(original, pool, intent, 8) : [],
    [original, pool, intent],
  );

  const applySubstitute = (candidate: LibraryWorkout) => {
    if (!original || !currentWorkoutId || !date) return;
    Alert.alert(
      `Replace with ${candidate.name}?`,
      `${date === new Date().toLocaleDateString('en-CA') ? 'Today' : date} will be updated. This preserves the rest of your plan and history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace session',
          onPress: async () => {
            setApplying(candidate.id);
            const result = await applyAIPlanChange({
              type: 'replace_workout',
              date,
              workoutId: currentWorkoutId,
              newWorkoutId: candidate.id,
              reason: `Manual substitution from the Library (replacing ${original.name}).`,
            });
            setApplying(null);
            if (!result.ok) {
              error();
              Alert.alert('Could not replace this session', result.errors.join(' '));
              return;
            }
            success();
            router.back();
          },
        },
      ],
    );
  };

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page}>
    <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => { tap(); router.back(); }} style={styles.back}><MaterialIcons name="arrow-back" size={22} color={palette.text} /></Pressable>
    <Eyebrow>Find substitute</Eyebrow>
    <ScreenTitle subtitle={original ? `Keeps the purpose of ${original.name} while matching what you need today.` : 'Loading the scheduled session…'}>
      Replace this session
    </ScreenTitle>

    {original === null ? <Card style={styles.emptyCard}>
      <MaterialIcons name="info-outline" size={22} color={palette.muted} />
      <Text style={styles.emptyText}>This day doesn’t have a Library-sourced session to substitute — it’s either a rest day or a custom workout.</Text>
    </Card> : null}

    {original ? <>
      <View style={styles.intentRow}>
        {SUBSTITUTE_INTENTS.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: intent === item.id }} onPress={() => { if (intent !== item.id) selection(); setIntent(item.id); }} style={[styles.intentChip, intent === item.id && styles.intentChipActive]}>
          <Text style={[styles.intentChipText, intent === item.id && styles.intentChipTextActive]}>{item.label}</Text>
        </Pressable>)}
      </View>

      {candidates.length ? candidates.map(candidate => <Card key={candidate.workout.id} style={styles.candidateCard}>
        <View style={styles.candidateHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.candidateName}>{candidate.workout.name}</Text>
            <Text style={styles.candidateCategory}>{libraryCategoryLabels[candidate.workout.primaryCategory]}</Text>
          </View>
          <Text style={styles.candidateDuration}>{candidate.workout.metrics.estimatedDurationMinutes[0]}–{candidate.workout.metrics.estimatedDurationMinutes[1]} min</Text>
        </View>
        {candidate.reasons.length ? <Text style={styles.candidateReasons}>{candidate.reasons.join(' · ')}</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={applying !== null}
          onPress={() => { tap(); applySubstitute(candidate.workout); }}
          style={[styles.useButton, applying === candidate.workout.id && styles.useButtonBusy]}
        >
          <Text style={styles.useButtonText}>{applying === candidate.workout.id ? 'Replacing…' : 'Use this instead'}</Text>
        </Pressable>
      </Card>) : <Card style={styles.emptyCard}>
        <MaterialIcons name="filter-alt-off" size={22} color={palette.muted} />
        <Text style={styles.emptyText}>No Approved sessions match “{SUBSTITUTE_INTENTS.find(item => item.id === intent)?.label}” right now. Try Best match or a different intent.</Text>
      </Card>}
    </> : null}
  </ScrollView></SafeAreaView>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  page: { padding: 20, paddingBottom: 40, gap: 14 },
  back: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  intentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  intentChip: { minHeight: 38, borderRadius: 11, paddingHorizontal: 13, justifyContent: 'center', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface2 },
  intentChipActive: { borderColor: palette.accent, backgroundColor: palette.accentDark },
  intentChipText: { color: palette.muted, fontSize: 12, fontWeight: '800' },
  intentChipTextActive: { color: palette.accent },
  candidateCard: { gap: 9 },
  candidateHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  candidateName: { color: palette.text, fontSize: 16, fontWeight: '900' },
  candidateCategory: { color: palette.accent, fontSize: 11, fontWeight: '800', marginTop: 3, textTransform: 'capitalize' },
  candidateDuration: { color: palette.muted, fontSize: 12, fontWeight: '800' },
  candidateReasons: { color: palette.muted, fontSize: 11, lineHeight: 16 },
  useButton: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' },
  useButtonBusy: { opacity: 0.6 },
  useButtonText: { color: palette.accent, fontSize: 13, fontWeight: '900' },
  emptyCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  emptyText: { flex: 1, color: palette.muted, fontSize: 12, lineHeight: 18 },
});
