import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Card, Eyebrow, PrimaryButton, ScreenTitle } from '@/components/sprint-ui';
import { palette } from '@/constants/sprintlab';
import { createBlankWorkout, exerciseSuggestions, todayWorkout, weekdayLabels } from '@/data/workouts';
import { ExerciseTracking, PlannedWorkout, WeekdayIndex } from '@/types';
import { getScheduledDay, saveDayWorkout } from '@/utils/storage';
import { inferTracking } from '@/utils/workout-session';
import { prepareWorkoutLaunch } from '@/utils/workout-launch';

export default function WorkoutBuilderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ day?: string; mode?: string }>();
  const unplanned = params.mode === 'unplanned';
  const parsedDay = Number(params.day);
  const dayIndex = (Number.isInteger(parsedDay) && parsedDay >= 0 && parsedDay <= 6 ? parsedDay : new Date().getDay()) as WeekdayIndex;
  const dayLabel = weekdayLabels[dayIndex].full;
  const [workout, setWorkout] = useState<PlannedWorkout>(dayIndex === 1 ? todayWorkout : createBlankWorkout(dayIndex));
  const [adding, setAdding] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [detail, setDetail] = useState('');
  useFocusEffect(useCallback(() => {
    if (unplanned) {
      setWorkout(createBlankWorkout(new Date().getDay() as WeekdayIndex));
      return;
    }
    getScheduledDay(dayIndex).then(day => setWorkout(day.kind === 'workout' && day.workout ? day.workout : createBlankWorkout(dayIndex)));
  }, [dayIndex, unplanned]));
  const addExercise = (sectionTitle: string, exerciseName: string, exerciseDetail: string, tracking?: ExerciseTracking) => {
    if (!exerciseName.trim()) return;
    setWorkout(current => ({ ...current, sections: current.sections.map(section => section.title === sectionTitle ? { ...section, exercises: [...section.exercises, { id: `custom-${Date.now()}-${Math.random()}`, name: exerciseName.trim(), detail: exerciseDetail.trim() || undefined, tracking: tracking ?? inferTracking(sectionTitle, exerciseDetail) }] } : section) }));
    setName(''); setDetail(''); setAdding(null);
  };
  const removeExercise = (sectionTitle: string, id: string) => setWorkout(current => ({ ...current, sections: current.sections.map(section => section.title === sectionTitle ? { ...section, exercises: section.exercises.filter(exercise => exercise.id !== id) } : section) }));
  const save = async () => {
    await saveDayWorkout(dayIndex, workout);
    router.back();
  };
  const startOneOff = async () => {
    const exerciseCount = workout.sections.reduce((total, section) => total + section.exercises.length, 0);
    if (!workout.title.trim() || workout.durationMinutes <= 0 || !exerciseCount) {
      return Alert.alert('Finish the workout first', 'Add a name, estimated duration, and at least one exercise.');
    }
    const result = await prepareWorkoutLaunch(workout, 'custom');
    if (result === 'active-session') {
      return Alert.alert('Workout already in progress', 'Finish or discard the active workout before starting another.', [{ text: 'Open workout', onPress: () => router.push('/workout') }]);
    }
    if (result === 'readiness-required') router.push({ pathname: '/readiness', params: { launch: 'pending' } });
    else router.push('/workout');
  };
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Pressable onPress={() => router.back()} style={styles.back}><MaterialIcons name="arrow-back" size={22} color={palette.text} /></Pressable>
    <Eyebrow>{unplanned ? 'One-off session' : dayLabel}</Eyebrow><ScreenTitle subtitle={unplanned ? 'Build a workout for today without changing your recurring weekly plan.' : `Build the session scheduled for ${dayLabel}. You can still make changes while training.`}>{unplanned ? 'Unplanned workout' : 'Plan workout'}</ScreenTitle>
    <View><Text style={styles.label}>Workout name</Text><TextInput value={workout.title} onChangeText={title => setWorkout(current => ({ ...current, title }))} style={styles.input} /></View>
    <View><Text style={styles.label}>Purpose</Text><TextInput value={workout.purpose} onChangeText={purpose => setWorkout(current => ({ ...current, purpose }))} multiline style={[styles.input, styles.purpose]} /></View>
    <View><Text style={styles.label}>Estimated duration (minutes)</Text><TextInput value={workout.durationMinutes ? String(workout.durationMinutes) : ''} onChangeText={value => setWorkout(current => ({ ...current, durationMinutes: Number(value.replace(/\D/g, '')) || 0 }))} keyboardType="number-pad" placeholder="80" placeholderTextColor="#647382" style={styles.input} /></View>
    {workout.sections.map(section => <Card key={section.title} style={styles.sectionCard}>
      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>{section.title}</Text><Text style={styles.count}>{section.exercises.length}</Text></View>
      {section.exercises.map(exercise => <View key={exercise.id} style={styles.exercise}><View style={{ flex: 1 }}><Text style={styles.exerciseName}>{exercise.name}</Text>{exercise.detail && <Text style={styles.exerciseDetail}>{exercise.detail}</Text>}</View><Pressable onPress={() => removeExercise(section.title, exercise.id)} style={styles.remove}><MaterialIcons name="close" size={18} color={palette.muted} /></Pressable></View>)}
      {adding === section.title ? <View style={styles.addPanel}>
        <Text style={styles.suggestedLabel}>Suggested</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestions}>{(exerciseSuggestions[section.title] ?? []).map(suggestion => <Pressable key={suggestion.name} onPress={() => addExercise(section.title, suggestion.name, suggestion.detail, suggestion.tracking)} style={styles.suggestion}><MaterialIcons name="add" size={16} color={palette.accent} /><Text style={styles.suggestionText}>{suggestion.name}</Text></Pressable>)}</ScrollView>
        <Text style={styles.suggestedLabel}>Or create your own</Text><TextInput value={name} onChangeText={setName} placeholder={`${section.title} exercise name`} placeholderTextColor="#647382" style={styles.input} /><TextInput value={detail} onChangeText={setDetail} placeholder="Reps, distance, intensity, rest…" placeholderTextColor="#647382" style={styles.input} />
        <View style={styles.addActions}><Pressable onPress={() => { setAdding(null); setName(''); setDetail(''); }} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable><Pressable onPress={() => addExercise(section.title, name, detail)} style={[styles.addCustom, !name.trim() && { opacity: 0.4 }]}><Text style={styles.addCustomText}>Add exercise</Text></Pressable></View>
      </View> : <Pressable onPress={() => setAdding(section.title)} style={styles.addRow}><MaterialIcons name="add" size={20} color={palette.accent} /><Text style={styles.addText}>Add to {section.title.toLowerCase()}</Text></Pressable>}
    </Card>)}
    <PrimaryButton title={unplanned ? 'Continue to readiness and start' : `Save ${dayLabel} workout`} onPress={unplanned ? startOneOff : save} disabled={!workout.title.trim() || workout.durationMinutes <= 0} />
    {unplanned ? <Text style={styles.oneOffHint}>This session will be recorded in History, but it will not replace any day in your weekly plan.</Text> : null}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: palette.bg }, page: { padding: 20, paddingBottom: 36, gap: 16 }, back: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' }, label: { color: palette.text, fontWeight: '800', fontSize: 14, marginBottom: 6 }, input: { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, borderRadius: 13, minHeight: 50, color: palette.text, paddingHorizontal: 14, fontSize: 15 }, purpose: { minHeight: 76, paddingTop: 13, textAlignVertical: 'top' }, sectionCard: { paddingVertical: 10 }, sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 5, paddingBottom: 8 }, sectionTitle: { color: palette.text, fontSize: 18, fontWeight: '900' }, count: { color: palette.muted, fontSize: 12, fontWeight: '900' }, exercise: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopColor: palette.border, borderTopWidth: 1, paddingHorizontal: 5 }, exerciseName: { color: palette.text, fontSize: 14, fontWeight: '800' }, exerciseDetail: { color: palette.muted, fontSize: 12, marginTop: 3 }, remove: { width: 34, height: 34, borderRadius: 10, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }, addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 46, gap: 6, borderTopWidth: 1, borderTopColor: palette.border, marginTop: 2 }, addText: { color: palette.accent, fontWeight: '900', fontSize: 13 }, addPanel: { borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 13, gap: 10 }, suggestedLabel: { color: palette.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' }, suggestions: { gap: 8 }, suggestion: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: palette.surface2, borderRadius: 20, paddingVertical: 9, paddingHorizontal: 11 }, suggestionText: { color: palette.text, fontSize: 12, fontWeight: '700' }, addActions: { flexDirection: 'row', gap: 8 }, cancel: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }, cancelText: { color: palette.muted, fontWeight: '800' }, addCustom: { flex: 1.5, minHeight: 44, borderRadius: 12, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' }, addCustomText: { color: '#0B1000', fontWeight: '900' }, oneOffHint: { color: palette.muted, fontSize: 11, lineHeight: 16, textAlign: 'center' } });
