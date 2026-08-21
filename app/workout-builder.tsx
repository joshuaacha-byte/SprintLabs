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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Card, Eyebrow, PrimaryButton, ScreenTitle } from '@/components/sprint-ui';
import { sectionIconName } from '@/utils/workout-icons';
import { Palette, useTheme } from '@/constants/sprintlab';
import { createBlankWorkout, exerciseSuggestions, todayWorkout, weekdayLabels } from '@/data/workouts';
import type {
  ExerciseTracking,
  LibraryWorkout,
  PlannedExercise,
  PlannedWorkout,
  PlannedWorkoutSection,
  TrainingLog,
  WeekdayIndex,
} from '@/types';
import { libraryWorkoutToPlannedWorkout } from '@/utils/plan-selector';
import { getScheduledDay, getTrainingLogs, saveDayWorkout } from '@/utils/storage';
import { workoutToPlannedSnapshot } from '@/utils/training-history';
import { getLibraryWorkouts, isRecommendationEligible } from '@/utils/workout-library';
import { disciplineForCategory, LIBRARY_DISCIPLINES, type LibraryDiscipline } from '@/utils/library-taxonomy';
import { inferTracking } from '@/utils/workout-session';
import { prepareWorkoutLaunch } from '@/utils/workout-launch';
import { completeStep, error, selection, success, tap, warning } from '@/utils/haptics';

const sectionOptions = ['Warm-up', 'Sprinting', 'Plyometrics', 'Strength', 'Conditioning', 'Cooldown'] as const;

const sectionAliases: Record<string, string> = {
  Track: 'Sprinting',
  'Sprint work': 'Sprinting',
  'Core / bodyweight': 'Conditioning',
};

const createWorkoutName = () => `${new Date().toLocaleDateString(undefined, { weekday: 'long' })} workout`;

function normalizedSectionName(title: string) {
  return sectionAliases[title] ?? title;
}

function blankOneOffWorkout(): PlannedWorkout {
  const blank = createBlankWorkout(new Date().getDay() as WeekdayIndex);
  return {
    ...blank,
    id: `one-off-${Date.now()}`,
    title: createWorkoutName(),
    purpose: '',
    durationMinutes: 0,
    sections: sectionOptions.map(title => ({ title, exercises: [] })),
  };
}

function estimateExerciseMinutes(exercise: PlannedExercise) {
  if (exercise.tracking.kind === 'track') {
    return Math.max(2, Math.ceil((exercise.tracking.reps * ((exercise.tracking.restSeconds ?? 90) + 30)) / 60));
  }
  if (exercise.tracking.kind === 'strength') {
    return Math.max(3, Math.ceil((exercise.tracking.sets * ((exercise.tracking.restSeconds ?? 90) + 50)) / 60));
  }
  return 4;
}

function calculateWorkoutMinutes(workout: PlannedWorkout) {
  const exerciseMinutes = workout.sections.reduce(
    (total, section) => total + section.exercises.reduce((sum, exercise) => sum + estimateExerciseMinutes(exercise), 0),
    0,
  );
  return exerciseMinutes ? Math.max(10, exerciseMinutes) : 0;
}

function exerciseCount(workout: PlannedWorkout) {
  return workout.sections.reduce((total, section) => total + section.exercises.length, 0);
}

function normalizeImportedWorkout(workout: PlannedWorkout): PlannedWorkout {
  const sections = sectionOptions.map(title => {
    const matches = workout.sections.filter(section => normalizedSectionName(section.title) === title);
    return { title, exercises: matches.flatMap(section => section.exercises) };
  });
  return { ...workout, id: `one-off-${Date.now()}`, sections };
}

export default function WorkoutBuilderScreen() {
  const router = useRouter();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const params = useLocalSearchParams<{ day?: string; mode?: string }>();
  const unplanned = params.mode === 'unplanned';
  const parsedDay = Number(params.day);
  const dayIndex = (Number.isInteger(parsedDay) && parsedDay >= 0 && parsedDay <= 6 ? parsedDay : new Date().getDay()) as WeekdayIndex;
  const dayLabel = weekdayLabels[dayIndex].full;
  const [workout, setWorkout] = useState<PlannedWorkout>(() => unplanned ? blankOneOffWorkout() : dayIndex === 1 ? todayWorkout : createBlankWorkout(dayIndex));
  const [visibleSections, setVisibleSections] = useState<string[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [detail, setDetail] = useState('');
  const [exerciseQuery, setExerciseQuery] = useState('');
  const [durationOverride, setDurationOverride] = useState(false);
  const [picker, setPicker] = useState<'section' | 'library' | 'recent' | null>(null);
  const [libraryWorkouts, setLibraryWorkouts] = useState<LibraryWorkout[]>([]);
  const [recentLogs, setRecentLogs] = useState<TrainingLog[]>([]);
  const [activeDiscipline, setActiveDiscipline] = useState<LibraryDiscipline | null>(null);
  const [librarySearch, setLibrarySearch] = useState('');

  useFocusEffect(useCallback(() => {
    if (unplanned) {
      const next = blankOneOffWorkout();
      setWorkout(next);
      setVisibleSections([]);
      setDurationOverride(false);
      return;
    }
    getScheduledDay(dayIndex).then(day => {
      const next = day.kind === 'workout' && day.workout ? day.workout : createBlankWorkout(dayIndex);
      setWorkout(next);
      setVisibleSections(next.sections.map(section => section.title));
    });
  }, [dayIndex, unplanned]));

  useEffect(() => {
    if (!unplanned) return;
    Promise.all([getLibraryWorkouts(), getTrainingLogs()]).then(([library, logs]) => {
      setLibraryWorkouts(library.filter(isRecommendationEligible));
      setRecentLogs([...logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12));
    });
  }, [unplanned]);

  const libraryDisciplineCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of libraryWorkouts) {
      const discipline = disciplineForCategory(item.primaryCategory);
      counts.set(discipline.id, (counts.get(discipline.id) ?? 0) + 1);
    }
    return counts;
  }, [libraryWorkouts]);
  const libraryDisciplineWorkouts = useMemo(
    () => activeDiscipline ? libraryWorkouts.filter(item => disciplineForCategory(item.primaryCategory).id === activeDiscipline.id) : [],
    [activeDiscipline, libraryWorkouts],
  );
  const librarySearchResults = useMemo(() => {
    const query = librarySearch.trim().toLowerCase();
    if (!query) return [];
    return libraryWorkouts.filter(item => item.name.toLowerCase().includes(query) || item.purpose.toLowerCase().includes(query));
  }, [librarySearch, libraryWorkouts]);
  const openLibraryPicker = () => { tap(); setActiveDiscipline(null); setLibrarySearch(''); setPicker('library'); };
  const openLibraryDiscipline = (discipline: LibraryDiscipline) => { tap(); setActiveDiscipline(discipline); };
  const backToLibraryCategories = () => { tap(); setActiveDiscipline(null); setLibrarySearch(''); };

  const calculatedDuration = useMemo(() => calculateWorkoutMinutes(workout), [workout]);
  useEffect(() => {
    if (!unplanned || durationOverride) return;
    setWorkout(current => current.durationMinutes === calculatedDuration ? current : { ...current, durationMinutes: calculatedDuration });
  }, [calculatedDuration, durationOverride, unplanned]);

  const totalExercises = exerciseCount(workout);
  const populatedSections = workout.sections.filter(section => visibleSections.includes(section.title) || section.exercises.length);

  const addSection = (title: string) => {
    setVisibleSections(current => current.includes(title) ? current : [...current, title]);
    setPicker(null);
    completeStep();
  };

  const addExercise = (sectionTitle: string, exerciseName: string, exerciseDetail: string, tracking?: ExerciseTracking) => {
    if (!exerciseName.trim()) return;
    setWorkout(current => ({
      ...current,
      sections: current.sections.map(section => section.title === sectionTitle
        ? {
            ...section,
            exercises: [...section.exercises, {
              id: `custom-${Date.now()}-${Math.random()}`,
              name: exerciseName.trim(),
              detail: exerciseDetail.trim() || undefined,
              tracking: tracking ?? inferTracking(sectionTitle, exerciseDetail),
            }],
          }
        : section),
    }));
    setVisibleSections(current => current.includes(sectionTitle) ? current : [...current, sectionTitle]);
    setName('');
    setDetail('');
    setExerciseQuery('');
    setAdding(null);
    completeStep();
  };

  const removeExercise = (sectionTitle: string, id: string) => {
    setWorkout(current => ({
      ...current,
      sections: current.sections.map(section => section.title === sectionTitle
        ? { ...section, exercises: section.exercises.filter(exercise => exercise.id !== id) }
        : section),
    }));
    warning();
  };

  const moveSection = (title: string, direction: -1 | 1) => {
    setVisibleSections(current => {
      const index = current.indexOf(title);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      completeStep();
      return next;
    });
  };

  const moveExercise = (sectionTitle: string, id: string, direction: -1 | 1) => {
    setWorkout(current => ({
      ...current,
      sections: current.sections.map(section => {
        if (section.title !== sectionTitle) return section;
        const index = section.exercises.findIndex(exercise => exercise.id === id);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= section.exercises.length) return section;
        const exercises = [...section.exercises];
        [exercises[index], exercises[target]] = [exercises[target], exercises[index]];
        completeStep();
        return { ...section, exercises };
      }),
    }));
  };

  const sectionMenu = (section: PlannedWorkoutSection) => {
    tap();
    const index = visibleSections.indexOf(section.title);
    Alert.alert(section.title, undefined, [
      ...(index > 0 ? [{ text: 'Move up', onPress: () => moveSection(section.title, -1 as const) }] : []),
      ...(index >= 0 && index < visibleSections.length - 1 ? [{ text: 'Move down', onPress: () => moveSection(section.title, 1 as const) }] : []),
      {
        text: 'Remove section',
        style: 'destructive',
        onPress: () => {
          setWorkout(current => ({
            ...current,
            sections: current.sections.map(item => item.title === section.title ? { ...item, exercises: [] } : item),
          }));
          setVisibleSections(current => current.filter(title => title !== section.title));
          warning();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const importWorkout = (next: PlannedWorkout) => {
    const imported = normalizeImportedWorkout(next);
    setWorkout(imported);
    setVisibleSections(imported.sections.filter(section => section.exercises.length).map(section => section.title));
    setDurationOverride(Boolean(imported.durationMinutes));
    setPicker(null);
    completeStep();
  };

  const buildFromScratch = () => {
    if (!totalExercises) {
      selection();
      return;
    }
    Alert.alert('Start from scratch?', 'This clears the exercises currently in this one-off workout.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear workout',
        style: 'destructive',
        onPress: () => {
          setWorkout(blankOneOffWorkout());
          setVisibleSections([]);
          setDurationOverride(false);
          warning();
        },
      },
    ]);
  };

  const save = async () => {
    try {
      await saveDayWorkout(dayIndex, workout);
      success();
      router.back();
    } catch {
      error();
      Alert.alert('Workout not saved', 'Try again.');
    }
  };

  const startOneOff = async () => {
    if (!workout.title.trim() || !totalExercises) {
      error();
      return Alert.alert('Add exercises to continue', 'Give the workout a name and add at least one exercise.');
    }
    const result = await prepareWorkoutLaunch(workout, 'custom');
    if (result === 'active-session') {
      error();
      return Alert.alert('Workout already in progress', 'Finish or discard the active workout before starting another.', [{ text: 'Open workout', onPress: () => router.push('/workout') }]);
    }
    completeStep();
    if (result === 'readiness-required') router.push({ pathname: '/readiness', params: { launch: 'pending' } });
    else router.push('/workout');
  };

  if (!unplanned) {
    return <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => { tap(); router.back(); }} style={styles.back}><MaterialIcons name="arrow-back" size={22} color={palette.text} /></Pressable>
        <Eyebrow>{dayLabel}</Eyebrow>
        <ScreenTitle subtitle={`Build the session scheduled for ${dayLabel}. You can still make changes while training.`}>Plan workout</ScreenTitle>
        <SessionDetails workout={workout} setWorkout={setWorkout} palette={palette} styles={styles} durationOverride={durationOverride} setDurationOverride={setDurationOverride} calculatedDuration={calculatedDuration} />
        {workout.sections.map(section => <WorkoutSectionCard key={section.title} section={section} adding={adding} setAdding={setAdding} name={name} setName={setName} detail={detail} setDetail={setDetail} query={exerciseQuery} setQuery={setExerciseQuery} addExercise={addExercise} removeExercise={removeExercise} moveExercise={moveExercise} openMenu={() => sectionMenu(section)} palette={palette} styles={styles} />)}
        <PrimaryButton title={`Save ${dayLabel} workout`} onPress={save} disabled={!workout.title.trim()} />
      </ScrollView>
    </SafeAreaView>;
  }

  return <SafeAreaView style={styles.safe}>
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.pageWithFooter} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => { tap(); router.back(); }} style={styles.back}><MaterialIcons name="arrow-back" size={22} color={palette.text} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="More one-off workout options" onPress={() => { tap(); Alert.alert('More options', undefined, [
            { text: 'Log completed workout', onPress: () => router.push('/log') },
            { text: 'Cancel', style: 'cancel' },
          ]); }} style={styles.back}><MaterialIcons name="more-horiz" size={22} color={palette.text} /></Pressable>
        </View>
        <Eyebrow>ONE-OFF SESSION</Eyebrow>
        <ScreenTitle subtitle="Build or import today’s session without changing your weekly plan.">One-off workout</ScreenTitle>

        <View style={styles.sourceActions}>
          <SourceAction icon="menu-book" title="Add from workout library" copy="Choose a complete SprintLab session." onPress={openLibraryPicker} styles={styles} palette={palette} />
          <SourceAction icon="history" title="Copy a recent workout" copy="Reuse and edit a session from History." onPress={() => { tap(); setPicker('recent'); }} styles={styles} palette={palette} />
          <SourceAction icon="edit" title="Build from scratch" copy="Add only the training you’re doing today." selected={!totalExercises} onPress={buildFromScratch} styles={styles} palette={palette} />
        </View>

        <SessionDetails workout={workout} setWorkout={setWorkout} palette={palette} styles={styles} durationOverride={durationOverride} setDurationOverride={setDurationOverride} calculatedDuration={calculatedDuration} />

        <View style={styles.structureHeader}>
          <View>
            <Text style={styles.structureTitle}>Workout structure</Text>
            <Text style={styles.structureCopy}>{totalExercises ? `${totalExercises} exercise${totalExercises === 1 ? '' : 's'} added` : 'Build only the sections you need.'}</Text>
          </View>
        </View>

        {!populatedSections.length ? <Card style={styles.emptyState}>
          <MaterialIcons name="playlist-add" size={28} color={palette.muted} />
          <Text style={styles.emptyTitle}>No exercises added yet</Text>
          <Text style={styles.emptyCopy}>Add a section, choose a library workout, or copy a recent session.</Text>
        </Card> : null}

        {populatedSections.map(section => <WorkoutSectionCard key={section.title} section={section} adding={adding} setAdding={setAdding} name={name} setName={setName} detail={detail} setDetail={setDetail} query={exerciseQuery} setQuery={setExerciseQuery} addExercise={addExercise} removeExercise={removeExercise} moveExercise={moveExercise} openMenu={() => sectionMenu(section)} palette={palette} styles={styles} />)}

        <Pressable accessibilityRole="button" onPress={() => { tap(); setPicker('section'); }} style={styles.addSection}>
          <MaterialIcons name="add" size={20} color={palette.accent} />
          <Text style={styles.addSectionText}>Add workout section</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.stickyFooter}>
        <Text style={styles.planNote}>This session will appear in History and will not replace a workout in your weekly plan.</Text>
        <PrimaryButton title={totalExercises ? 'Review and start' : 'Add exercises to continue'} onPress={startOneOff} disabled={!totalExercises || !workout.title.trim()} />
      </View>
    </View>

    <SelectionModal
      visible={picker !== null}
      title={picker === 'section' ? 'Add workout section' : picker === 'library' ? (activeDiscipline ? activeDiscipline.label : librarySearch.trim() ? 'Search results' : 'Workout library') : 'Recent workouts'}
      onBack={picker === 'library' && (activeDiscipline || librarySearch.trim()) ? backToLibraryCategories : undefined}
      onClose={() => { tap(); setPicker(null); }}
      styles={styles}
      palette={palette}
    >
      {picker === 'section' ? sectionOptions.filter(title => !visibleSections.includes(title)).map(title => <PickerRow key={title} icon={sectionIconName(title)} title={title} onPress={() => addSection(title)} styles={styles} palette={palette} />) : null}

      {picker === 'library' ? <LibraryPicker
        workouts={libraryWorkouts}
        activeDiscipline={activeDiscipline}
        disciplineCounts={libraryDisciplineCounts}
        disciplineWorkouts={libraryDisciplineWorkouts}
        search={librarySearch}
        setSearch={setLibrarySearch}
        searchResults={librarySearchResults}
        openDiscipline={openLibraryDiscipline}
        onPick={item => importWorkout(libraryWorkoutToPlannedWorkout(item))}
        styles={styles}
        palette={palette}
      /> : null}

      {picker === 'recent' ? recentLogs.map(log => <PickerRow key={log.id} icon="history" title={log.plannedWorkout.name} copy={new Date(`${log.date.slice(0, 10)}T12:00:00`).toLocaleDateString()} onPress={() => importWorkout(workoutToPlannedSnapshot(log))} styles={styles} palette={palette} />) : null}
      {picker === 'recent' && !recentLogs.length ? <Text style={styles.modalEmpty}>Completed workouts will appear here after they are saved to History.</Text> : null}
    </SelectionModal>
  </SafeAreaView>;
}

function SessionDetails({ workout, setWorkout, palette, styles, durationOverride, setDurationOverride, calculatedDuration }: {
  workout: PlannedWorkout;
  setWorkout: React.Dispatch<React.SetStateAction<PlannedWorkout>>;
  palette: Palette;
  styles: ReturnType<typeof createStyles>;
  durationOverride: boolean;
  setDurationOverride: React.Dispatch<React.SetStateAction<boolean>>;
  calculatedDuration: number;
}) {
  return <Card style={styles.detailsCard}>
    <Text style={styles.cardLabel}>Session details</Text>
    <TextInput accessibilityLabel="Workout name" value={workout.title} onChangeText={title => setWorkout(current => ({ ...current, title }))} placeholder="Workout name" placeholderTextColor={palette.muted} style={styles.input} />
    <TextInput accessibilityLabel="Purpose or notes, optional" value={workout.purpose} onChangeText={purpose => setWorkout(current => ({ ...current, purpose }))} placeholder="Purpose or notes (optional)" placeholderTextColor={palette.muted} multiline style={[styles.input, styles.notesInput]} />
    <View style={styles.durationRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.durationLabel}>Estimated duration</Text>
        <Text style={styles.durationHint}>{!durationOverride && calculatedDuration ? 'Calculated from workout' : 'Optional'}</Text>
      </View>
      <TextInput
        accessibilityLabel="Estimated duration in minutes"
        value={workout.durationMinutes ? String(workout.durationMinutes) : ''}
        onChangeText={value => {
          setDurationOverride(true);
          setWorkout(current => ({ ...current, durationMinutes: Number(value.replace(/\D/g, '')) || 0 }));
        }}
        keyboardType="number-pad"
        placeholder="—"
        placeholderTextColor={palette.muted}
        style={styles.durationInput}
      />
      <Text style={styles.minutes}>min</Text>
    </View>
  </Card>;
}

function SourceAction({ icon, title, copy, onPress, selected, styles, palette }: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  copy: string;
  onPress: () => void;
  selected?: boolean;
  styles: ReturnType<typeof createStyles>;
  palette: Palette;
}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.sourceAction, selected && styles.sourceActionSelected]}>
    <View style={styles.sourceIcon}><MaterialIcons name={icon} size={19} color={selected ? palette.accent : palette.text} /></View>
    <View style={{ flex: 1 }}><Text style={styles.sourceTitle}>{title}</Text><Text style={styles.sourceCopy}>{copy}</Text></View>
    <MaterialIcons name="chevron-right" size={20} color={palette.muted} />
  </Pressable>;
}

function WorkoutSectionCard({ section, adding, setAdding, name, setName, detail, setDetail, query, setQuery, addExercise, removeExercise, moveExercise, openMenu, palette, styles }: {
  section: PlannedWorkoutSection;
  adding: string | null;
  setAdding: React.Dispatch<React.SetStateAction<string | null>>;
  name: string;
  setName: React.Dispatch<React.SetStateAction<string>>;
  detail: string;
  setDetail: React.Dispatch<React.SetStateAction<string>>;
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  addExercise: (sectionTitle: string, exerciseName: string, exerciseDetail: string, tracking?: ExerciseTracking) => void;
  removeExercise: (sectionTitle: string, id: string) => void;
  moveExercise: (sectionTitle: string, id: string, direction: -1 | 1) => void;
  openMenu: () => void;
  palette: Palette;
  styles: ReturnType<typeof createStyles>;
}) {
  const suggestions = (exerciseSuggestions[section.title] ?? exerciseSuggestions[section.title === 'Sprinting' ? 'Track' : section.title] ?? [])
    .filter(suggestion => suggestion.name.toLowerCase().includes(query.trim().toLowerCase()));
  const sectionMinutes = section.exercises.reduce((total, exercise) => total + estimateExerciseMinutes(exercise), 0);
  return <Card style={styles.sectionCard}>
    <View style={styles.sectionHead}>
      <MaterialIcons name="drag-handle" size={20} color={palette.muted} />
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text>
        <Text style={styles.sectionMeta}>{section.exercises.length} exercise{section.exercises.length === 1 ? '' : 's'}{sectionMinutes ? ` · ~${sectionMinutes} min` : ''}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${section.title} options`} onPress={openMenu} style={styles.iconButton}><MaterialIcons name="more-horiz" size={20} color={palette.muted} /></Pressable>
    </View>
    {section.exercises.map((exercise, index) => <View key={exercise.id} style={styles.exercise}>
      <View style={{ flex: 1 }}><Text style={styles.exerciseName}>{exercise.name}</Text>{exercise.detail ? <Text style={styles.exerciseDetail}>{exercise.detail}</Text> : null}</View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${exercise.name} options`}
        onPress={() => { tap(); Alert.alert(exercise.name, undefined, [
          ...(index > 0 ? [{ text: 'Move up', onPress: () => moveExercise(section.title, exercise.id, -1 as const) }] : []),
          ...(index < section.exercises.length - 1 ? [{ text: 'Move down', onPress: () => moveExercise(section.title, exercise.id, 1 as const) }] : []),
          { text: 'Remove exercise', style: 'destructive', onPress: () => removeExercise(section.title, exercise.id) },
          { text: 'Cancel', style: 'cancel' },
        ]); }}
        style={styles.remove}
      ><MaterialIcons name="more-horiz" size={18} color={palette.muted} /></Pressable>
    </View>)}
    {adding === section.title ? <View style={styles.addPanel}>
      <TextInput value={query} onChangeText={setQuery} placeholder="Search saved exercises" placeholderTextColor={palette.muted} style={styles.input} />
      {suggestions.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestions}>{suggestions.map(suggestion => <Pressable key={suggestion.name} onPress={() => addExercise(section.title, suggestion.name, suggestion.detail, suggestion.tracking)} style={styles.suggestion}><MaterialIcons name="add" size={16} color={palette.accent} /><Text style={styles.suggestionText}>{suggestion.name}</Text></Pressable>)}</ScrollView> : <Text style={styles.noSuggestions}>No saved exercise matches. Add a custom exercise below.</Text>}
      <Text style={styles.suggestedLabel}>Custom exercise</Text>
      <TextInput value={name} onChangeText={setName} placeholder={`${section.title} exercise name`} placeholderTextColor={palette.muted} style={styles.input} />
      <TextInput value={detail} onChangeText={setDetail} placeholder="Reps, distance, intensity, rest…" placeholderTextColor={palette.muted} style={styles.input} />
      <View style={styles.addActions}>
        <Pressable onPress={() => { tap(); setAdding(null); setName(''); setDetail(''); setQuery(''); }} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
        <Pressable disabled={!name.trim()} onPress={() => addExercise(section.title, name, detail)} style={[styles.addCustom, !name.trim() && styles.disabled]}><Text style={styles.addCustomText}>Add exercise</Text></Pressable>
      </View>
    </View> : <Pressable onPress={() => { tap(); setAdding(section.title); }} style={styles.addRow}><MaterialIcons name="add" size={19} color={palette.accent} /><Text style={styles.addText}>Add exercise</Text></Pressable>}
  </Card>;
}

function SelectionModal({ visible, title, onBack, onClose, children, styles, palette }: React.PropsWithChildren<{
  visible: boolean;
  title: string;
  onBack?: () => void;
  onClose: () => void;
  styles: ReturnType<typeof createStyles>;
  palette: Palette;
}>) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onBack ?? onClose}>
    <View style={styles.modalBackdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <SafeAreaView style={styles.modalSheet}>
        <View style={styles.modalHead}>
          <View style={styles.modalHeadStart}>
            {onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.iconButton}><MaterialIcons name="arrow-back" size={20} color={palette.text} /></Pressable> : null}
            <Text style={styles.modalTitle}>{title}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.iconButton}><MaterialIcons name="close" size={21} color={palette.text} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalContent}>{children}</ScrollView>
      </SafeAreaView>
    </View>
  </Modal>;
}

const libraryWorkoutExerciseCount = (item: LibraryWorkout) =>
  Object.values(item.sections).reduce((total, section) => total + section.items.length, 0);

const libraryWorkoutMetaLine = (item: LibraryWorkout) => {
  const duration = item.metrics.estimatedDurationMinutes;
  const durationText = duration[0] === duration[1] ? `${duration[0]} min` : `${duration[0]}–${duration[1]} min`;
  const level = item.athleteLevels[0] ? item.athleteLevels[0].replace(/^\w/, letter => letter.toUpperCase()) : null;
  const exercises = libraryWorkoutExerciseCount(item);
  const equipment = item.equipmentRequired.length ? item.equipmentRequired.slice(0, 2).join(', ') + (item.equipmentRequired.length > 2 ? '…' : '') : 'No special equipment';
  return [durationText, level, `${exercises} exercise${exercises === 1 ? '' : 's'}`, equipment].filter(Boolean).join(' · ');
};

function LibraryPicker({ workouts, activeDiscipline, disciplineCounts, disciplineWorkouts, search, setSearch, searchResults, openDiscipline, onPick, styles, palette }: {
  workouts: LibraryWorkout[];
  activeDiscipline: LibraryDiscipline | null;
  disciplineCounts: Map<string, number>;
  disciplineWorkouts: LibraryWorkout[];
  search: string;
  setSearch: (value: string) => void;
  searchResults: LibraryWorkout[];
  openDiscipline: (discipline: LibraryDiscipline) => void;
  onPick: (item: LibraryWorkout) => void;
  styles: ReturnType<typeof createStyles>;
  palette: Palette;
}) {
  if (!workouts.length) return <Text style={styles.modalEmpty}>No approved library workouts are available.</Text>;

  const searching = Boolean(search.trim());

  return <View style={{ gap: 10 }}>
    {!activeDiscipline ? <View style={styles.librarySearchRow}>
      <MaterialIcons name="search" size={18} color={palette.muted} />
      <TextInput value={search} onChangeText={setSearch} placeholder="Search workouts by name" placeholderTextColor={palette.muted} style={styles.librarySearchInput} />
      {search ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearch('')}><MaterialIcons name="close" size={18} color={palette.muted} /></Pressable> : null}
    </View> : null}

    {searching ? <>
      {searchResults.map(item => <LibraryWorkoutRow key={item.id} item={item} onPress={() => onPick(item)} styles={styles} palette={palette} />)}
      {!searchResults.length ? <Text style={styles.modalEmpty}>No workouts match &quot;{search.trim()}&quot;.</Text> : null}
    </> : activeDiscipline ? <>
      {disciplineWorkouts.map(item => <LibraryWorkoutRow key={item.id} item={item} onPress={() => onPick(item)} styles={styles} palette={palette} />)}
      {!disciplineWorkouts.length ? <Text style={styles.modalEmpty}>No approved sessions in {activeDiscipline.label} yet.</Text> : null}
    </> : <View style={styles.libraryDisciplineGrid}>
      {LIBRARY_DISCIPLINES.map(discipline => <Pressable key={discipline.id} onPress={() => openDiscipline(discipline)} style={styles.libraryDisciplineTile}>
        <View style={styles.disciplineIcon}><MaterialIcons name={discipline.icon as keyof typeof MaterialIcons.glyphMap} size={20} color={palette.accent} /></View>
        <Text style={styles.disciplineLabel}>{discipline.label}</Text>
        <Text style={styles.disciplineCount}>{disciplineCounts.get(discipline.id) ?? 0} session{(disciplineCounts.get(discipline.id) ?? 0) === 1 ? '' : 's'}</Text>
      </Pressable>)}
    </View>}
  </View>;
}

function LibraryWorkoutRow({ item, onPress, styles, palette }: { item: LibraryWorkout; onPress: () => void; styles: ReturnType<typeof createStyles>; palette: Palette }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.pickerRow}>
    <View style={styles.sourceIcon}><MaterialIcons name="menu-book" size={19} color={palette.accent} /></View>
    <View style={{ flex: 1 }}>
      <Text style={styles.pickerTitle}>{item.name}</Text>
      <Text style={styles.pickerCopy} numberOfLines={2}>{libraryWorkoutMetaLine(item)}</Text>
    </View>
    <MaterialIcons name="chevron-right" size={20} color={palette.muted} />
  </Pressable>;
}

function PickerRow({ icon, title, copy, onPress, styles, palette }: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  copy?: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  palette: Palette;
}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.pickerRow}>
    <View style={styles.sourceIcon}><MaterialIcons name={icon} size={19} color={palette.accent} /></View>
    <View style={{ flex: 1 }}><Text style={styles.pickerTitle}>{title}</Text>{copy ? <Text style={styles.pickerCopy}>{copy}</Text> : null}</View>
    <MaterialIcons name="chevron-right" size={20} color={palette.muted} />
  </Pressable>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  screen: { flex: 1 },
  page: { padding: 20, paddingBottom: 36, gap: 14 },
  pageWithFooter: { padding: 20, paddingBottom: 190, gap: 14 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  sourceActions: { gap: 8 },
  sourceAction: { minHeight: 66, borderRadius: 15, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sourceActionSelected: { borderColor: palette.accent, backgroundColor: palette.accentDark },
  sourceIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sourceTitle: { color: palette.text, fontSize: 13, fontWeight: '900' },
  sourceCopy: { color: palette.muted, fontSize: 11, lineHeight: 15, marginTop: 2 },
  detailsCard: { gap: 9, padding: 13 },
  cardLabel: { color: palette.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  input: { backgroundColor: palette.surface2, borderColor: palette.border, borderWidth: 1, borderRadius: 12, minHeight: 46, color: palette.text, paddingHorizontal: 12, fontSize: 14 },
  notesInput: { minHeight: 54, maxHeight: 78, paddingTop: 12, textAlignVertical: 'top' },
  durationRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 },
  durationLabel: { color: palette.text, fontSize: 12, fontWeight: '800' },
  durationHint: { color: palette.muted, fontSize: 10, marginTop: 2 },
  durationInput: { width: 58, height: 42, borderRadius: 11, backgroundColor: palette.surface2, color: palette.text, textAlign: 'center', fontSize: 14, fontWeight: '900' },
  minutes: { color: palette.muted, fontSize: 11, fontWeight: '800' },
  structureHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 },
  structureTitle: { color: palette.text, fontSize: 18, fontWeight: '900' },
  structureCopy: { color: palette.muted, fontSize: 11, marginTop: 3 },
  emptyState: { minHeight: 145, alignItems: 'center', justifyContent: 'center', padding: 20 },
  emptyTitle: { color: palette.text, fontSize: 15, fontWeight: '900', marginTop: 8 },
  emptyCopy: { color: palette.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 4, maxWidth: 260 },
  sectionCard: { padding: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 },
  sectionTitle: { color: palette.text, fontSize: 12, fontWeight: '900', letterSpacing: .7 },
  sectionMeta: { color: palette.muted, fontSize: 10, marginTop: 2 },
  iconButton: { width: 38, height: 38, borderRadius: 11, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' },
  exercise: { minHeight: 51, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopColor: palette.border, borderTopWidth: 1, paddingHorizontal: 3 },
  exerciseName: { color: palette.text, fontSize: 13, fontWeight: '800' },
  exerciseDetail: { color: palette.muted, fontSize: 11, marginTop: 2 },
  remove: { width: 32, height: 32, borderRadius: 9, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 43, gap: 6, borderTopWidth: 1, borderTopColor: palette.border },
  addText: { color: palette.accent, fontWeight: '900', fontSize: 12 },
  addSection: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: palette.border, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  addSectionText: { color: palette.accent, fontSize: 13, fontWeight: '900' },
  addPanel: { borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 11, gap: 9 },
  suggestions: { gap: 7 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: palette.surface2, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 10 },
  suggestionText: { color: palette.text, fontSize: 11, fontWeight: '700' },
  suggestedLabel: { color: palette.muted, fontSize: 10, fontWeight: '900', letterSpacing: .8, textTransform: 'uppercase' },
  noSuggestions: { color: palette.muted, fontSize: 10, lineHeight: 14 },
  addActions: { flexDirection: 'row', gap: 8 },
  cancel: { flex: 1, minHeight: 43, borderRadius: 11, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: palette.muted, fontWeight: '800' },
  addCustom: { flex: 1.5, minHeight: 43, borderRadius: 11, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' },
  addCustomText: { color: '#0B1000', fontWeight: '900' },
  disabled: { opacity: .4 },
  stickyFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: palette.bg, borderTopWidth: 1, borderTopColor: palette.border, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, gap: 8 },
  planNote: { color: palette.muted, fontSize: 10, lineHeight: 14, textAlign: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.62)' },
  modalSheet: { maxHeight: '78%', backgroundColor: palette.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: palette.border },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8 },
  modalHeadStart: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  modalTitle: { color: palette.text, fontSize: 20, fontWeight: '900' },
  modalContent: { padding: 14, paddingBottom: 28, gap: 8 },
  pickerRow: { minHeight: 62, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface2, paddingHorizontal: 11, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pickerTitle: { color: palette.text, fontSize: 13, fontWeight: '900' },
  pickerCopy: { color: palette.muted, fontSize: 10, lineHeight: 14, marginTop: 2 },
  modalEmpty: { color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', padding: 24 },
  librarySearchRow: { minHeight: 46, borderRadius: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface2, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, marginBottom: 2 },
  librarySearchInput: { flex: 1, minHeight: 44, color: palette.text, fontSize: 13 },
  libraryDisciplineGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  libraryDisciplineTile: { flexBasis: '47%', flexGrow: 1, minHeight: 98, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface2, padding: 12, gap: 7 },
  disciplineIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: palette.accentDark, alignItems: 'center', justifyContent: 'center' },
  disciplineLabel: { color: palette.text, fontSize: 12, fontWeight: '900' },
  disciplineCount: { color: palette.muted, fontSize: 10, fontWeight: '700' },
});
