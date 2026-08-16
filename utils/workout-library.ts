import AsyncStorage from '@react-native-async-storage/async-storage';
import { starterWorkoutLibrary } from '@/data/workout-library';
import type {
  AthleteSport,
  LibraryApprovalStatus,
  LibraryWorkout,
  LibraryWorkoutItem,
  SpeedGoal,
  SpeedPathway,
  TrainingContext,
  WorkoutLibraryFilters,
  WorkoutLibraryState,
} from '@/types';

const WORKOUT_LIBRARY_KEY = 'sprintlab.workouts.v1';
const WORKOUT_LIBRARY_SCHEMA_VERSION = 1 as const;
const WORKOUT_LIBRARY_SEED_VERSION = 5 as const;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const now = () => new Date().toISOString();

export const defaultWorkoutLibraryFilters: WorkoutLibraryFilters = {
  query: '', category: 'all', athleteLevel: 'all', seasonPhase: 'all', pathway: 'all', eventTag: 'all', equipment: 'all', surface: 'all', status: 'approved', duration: 'all', sort: 'relevance', sport: 'all', speedGoal: 'all', speedPathway: 'all', trainingContext: 'all',
};

function legacyTrackMetadata(workout: LibraryWorkout): Pick<LibraryWorkout, 'sports' | 'speedGoals' | 'speedPathways' | 'trainingContexts' | 'distanceUnit' | 'directionPattern'> {
  const primary = workout.eventTags.includes('400m') && !workout.eventTags.includes('60m') ? 'track-long-sprint' : 'track-short-sprint';
  const goal: SpeedGoal = workout.primaryCategory === 'speed-endurance' || workout.primaryCategory === 'special-endurance' ? 'speed-endurance' : workout.primaryCategory === 'plyometrics' || workout.primaryCategory === 'strength' ? 'explosive-power' : workout.primaryCategory === 'testing' ? 'combine-testing' : workout.primaryCategory === 'maximum-velocity' ? 'maximum-velocity' : 'acceleration';
  const contexts: TrainingContext[] = workout.seasonPhases.includes('competition') ? ['in-season'] : ['offseason', 'preseason', 'general-development'];
  return { sports: ['track-and-field'], speedGoals: [goal], speedPathways: [primary as SpeedPathway], trainingContexts: contexts, distanceUnit: 'meters', directionPattern: workout.surface.required.includes('track-curve') ? 'curved' : 'linear' };
}

function withSportMetadata(workout: LibraryWorkout): LibraryWorkout {
  return { ...legacyTrackMetadata(workout), ...workout };
}

export function calculatedWorkoutMetrics(workout: LibraryWorkout) {
  const items = Object.values(workout.sections).flatMap(section => section.items);
  const multiplier = (item: LibraryWorkoutItem) => (item.sets ?? 1) * (item.reps ?? 1);
  const totalSprintVolumeMeters = items.filter(item => item.countsTowardSprintVolume).reduce((total, item) => total + (item.distanceMeters ?? 0) * multiplier(item), 0);
  const highIntensitySprintVolumeMeters = items.filter(item => item.countsTowardHighIntensityVolume).reduce((total, item) => total + (item.fastZoneMeters ?? item.distanceMeters ?? 0) * multiplier(item), 0);
  return { totalSprintVolumeMeters, highIntensitySprintVolumeMeters };
}

export function validateWorkoutForApproval(workout: LibraryWorkout) {
  const errors: string[] = [];
  const containsTbd = JSON.stringify(workout).toLowerCase().includes('tbd');
  if (containsTbd) errors.push('Approved workouts cannot contain TBD content.');
  if (!workout.name || !workout.purpose || !workout.intendedAthlete) errors.push('Name, purpose, and intended athlete are required.');
  if (!workout.eventPathways.length || !workout.eventTags.length || !workout.athleteLevels.length || !workout.seasonPhases.length) errors.push('At least one pathway, event, level, and phase are required.');
  if (!workout.surface.required.length) errors.push('At least one required surface is needed.');
  if (!workout.intensitySummary || !workout.recoverySummary || !workout.coachingCues.length || !workout.safetyNotes.length || !workout.sourceNotes.length) errors.push('Intensity, recovery, cues, safety notes, and a source note are required.');
  if (Object.values(workout.sections).some(section => !section || !Array.isArray(section.items))) errors.push('All six workout sections are required.');
  const calculated = calculatedWorkoutMetrics(workout);
  if (calculated.totalSprintVolumeMeters !== workout.metrics.totalSprintVolumeMeters || calculated.highIntensitySprintVolumeMeters !== workout.metrics.highIntensitySprintVolumeMeters) errors.push('Stored sprint-volume metrics do not match the section items.');
  if (workout.metrics.highCns && !workout.recoverySummary) errors.push('High-CNS sessions require recovery guidance.');
  if (workout.primaryCategory === 'special-endurance' && (!workout.eventTags.some(event => event === '200m' || event === '400m') || !workout.seasonPhases.length)) errors.push('Special-endurance workouts require 200m/400m event and phase restrictions.');
  if (workout.primaryCategory === 'plyometrics' && workout.athleteLevels.includes('advanced') && workout.name.toLowerCase().includes('drop-jump')) errors.push('Advanced drop-jump content requires explicit reviewer override and cannot be approved by this prototype.');
  if (workout.name.toLowerCase().includes('overspeed') || workout.name.toLowerCase().includes('downhill')) errors.push('Assisted/downhill speed remains draft-only in this prototype.');
  return errors;
}

export const isRecommendationEligible = (workout: LibraryWorkout) => workout.approvalStatus === 'approved' && validateWorkoutForApproval(workout).length === 0;

function isLegacyPlaceholder(workout: LibraryWorkout) {
  return Object.values(workout.sections).some(section => section.items.some(item => item.name === 'Curated sprint-volume record'));
}

function withSixSections(workout: LibraryWorkout, seed?: LibraryWorkout): LibraryWorkout {
  const sections = workout.sections as Partial<LibraryWorkout['sections']>;
  return {
    ...workout,
    sections: {
      warmup: sections.warmup ?? seed?.sections.warmup ?? { id: 'warmup', label: 'Warm-up', items: [] },
      sprintWork: sections.sprintWork ?? seed?.sections.sprintWork ?? { id: 'sprint-work', label: 'Sprint work', items: [] },
      plyometrics: sections.plyometrics ?? seed?.sections.plyometrics ?? { id: 'plyometrics', label: 'Plyometrics', items: [] },
      strength: sections.strength ?? seed?.sections.strength ?? { id: 'strength', label: 'Strength', items: [] },
      coreBodyweight: sections.coreBodyweight ?? seed?.sections.coreBodyweight ?? { id: 'core-bodyweight', label: 'Core / bodyweight', items: [] },
      cooldown: sections.cooldown ?? seed?.sections.cooldown ?? { id: 'cooldown', label: 'Cooldown', items: [] },
    },
  };
}

function normalizedState(raw: unknown): WorkoutLibraryState {
  if (!raw || typeof raw !== 'object') return { schemaVersion: WORKOUT_LIBRARY_SCHEMA_VERSION, seededVersion: WORKOUT_LIBRARY_SEED_VERSION, workouts: clone(starterWorkoutLibrary) };
  const candidate = raw as Partial<WorkoutLibraryState>;
  const existing = Array.isArray(candidate.workouts) ? candidate.workouts as LibraryWorkout[] : [];
  const existingById = new Map(existing.map(workout => [workout.id, workout]));
  const seeded = starterWorkoutLibrary.map(workout => {
    const previous = existingById.get(workout.id);
    // Approved V1 seeds could not be silently edited, so they can safely receive
    // the reviewed V2 protocol. Draft revisions and custom edits survive.
    const useNewSeed = !previous
      || isLegacyPlaceholder(previous)
      || (previous.approvalStatus === 'approved' && (previous.version ?? 1) < workout.version);
    return withSportMetadata(withSixSections(useNewSeed ? workout : previous, workout));
  });
  const customWorkouts = existing
    .filter(workout => !starterWorkoutLibrary.some(seed => seed.id === workout.id))
    .map(workout => withSportMetadata(withSixSections(workout)));
  return {
    schemaVersion: WORKOUT_LIBRARY_SCHEMA_VERSION,
    seededVersion: WORKOUT_LIBRARY_SEED_VERSION,
    workouts: [...seeded, ...customWorkouts],
  };
}

/** Initializes once only; later seed changes never overwrite local edits. */
export async function getWorkoutLibraryState(): Promise<WorkoutLibraryState> {
  const stored = await AsyncStorage.getItem(WORKOUT_LIBRARY_KEY);
  if (!stored) {
    const initial: WorkoutLibraryState = { schemaVersion: WORKOUT_LIBRARY_SCHEMA_VERSION, seededVersion: WORKOUT_LIBRARY_SEED_VERSION, workouts: clone(starterWorkoutLibrary.map(withSportMetadata)) };
    await AsyncStorage.setItem(WORKOUT_LIBRARY_KEY, JSON.stringify(initial));
    return initial;
  }
  const raw = JSON.parse(stored) as Partial<WorkoutLibraryState>;
  const state = normalizedState(raw);
  if (raw.schemaVersion !== WORKOUT_LIBRARY_SCHEMA_VERSION || raw.seededVersion !== WORKOUT_LIBRARY_SEED_VERSION) {
    await AsyncStorage.setItem(WORKOUT_LIBRARY_KEY, JSON.stringify(state));
  }
  return state;
}

export async function getLibraryWorkouts() { return (await getWorkoutLibraryState()).workouts; }

export async function getLibraryWorkout(id: string) { return (await getLibraryWorkouts()).find(workout => workout.id === id) ?? null; }

export async function saveLibraryWorkout(workout: LibraryWorkout) {
  const state = await getWorkoutLibraryState();
  const existing = state.workouts.find(item => item.id === workout.id);
  if (existing?.approvalStatus === 'approved' && workout.approvalStatus === 'approved' && JSON.stringify(existing) !== JSON.stringify(workout)) {
    throw new Error('Approved workouts cannot be silently edited. Create a draft revision first.');
  }
  if (workout.approvalStatus === 'approved') {
    const errors = validateWorkoutForApproval(workout);
    if (errors.length) throw new Error(errors.join(' '));
  }
  const next = { ...workout, updatedAt: now() };
  const workouts = state.workouts.some(item => item.id === workout.id) ? state.workouts.map(item => item.id === workout.id ? next : item) : [next, ...state.workouts];
  await AsyncStorage.setItem(WORKOUT_LIBRARY_KEY, JSON.stringify({ ...state, workouts }));
  return next;
}

export async function duplicateLibraryWorkout(id: string) {
  const workout = await getLibraryWorkout(id);
  if (!workout) throw new Error('Workout not found.');
  const stamp = Date.now();
  const copy: LibraryWorkout = {
    ...clone(workout), id: `${workout.id}-copy-${stamp}`, slug: `${workout.slug}-copy-${stamp}`, name: `Copy of ${workout.name}`, version: 1, approvalStatus: 'draft', archivedAt: undefined, createdAt: now(), updatedAt: now(),
  };
  return saveLibraryWorkout(copy);
}

export async function archiveLibraryWorkout(id: string) {
  const workout = await getLibraryWorkout(id);
  if (!workout) throw new Error('Workout not found.');
  const state = await getWorkoutLibraryState();
  const archived = { ...workout, approvalStatus: 'archived' as LibraryApprovalStatus, archivedAt: now(), updatedAt: now() };
  await AsyncStorage.setItem(WORKOUT_LIBRARY_KEY, JSON.stringify({ ...state, workouts: state.workouts.map(item => item.id === id ? archived : item) }));
  return archived;
}

export async function restoreLibraryWorkoutToDraft(id: string) {
  const workout = await getLibraryWorkout(id);
  if (!workout) throw new Error('Workout not found.');
  const state = await getWorkoutLibraryState();
  const restored = { ...workout, approvalStatus: 'draft' as LibraryApprovalStatus, archivedAt: undefined, updatedAt: now() };
  await AsyncStorage.setItem(WORKOUT_LIBRARY_KEY, JSON.stringify({ ...state, workouts: state.workouts.map(item => item.id === id ? restored : item) }));
  return restored;
}

function matchesDuration(workout: LibraryWorkout, duration: WorkoutLibraryFilters['duration']) {
  const minutes = workout.metrics.estimatedDurationMinutes[1];
  if (duration === 'all') return true;
  if (duration === 'under-45') return minutes < 45;
  if (duration === '45-60') return minutes >= 45 && minutes <= 60;
  if (duration === '61-75') return minutes >= 61 && minutes <= 75;
  return minutes > 75;
}

export function filterLibraryWorkouts(workouts: LibraryWorkout[], filters: WorkoutLibraryFilters) {
  const query = filters.query.trim().toLowerCase();
  const filtered = workouts.filter(workout => {
    const searchable = [workout.name, workout.purpose, workout.intendedAthlete, ...workout.coachingCues, ...workout.equipmentRequired, ...workout.equipmentOptional, ...workout.eventTags, ...workout.eventPathways, workout.primaryCategory].join(' ').toLowerCase();
    return (!query || searchable.includes(query))
      && (filters.category === 'all' || workout.primaryCategory === filters.category || workout.secondaryCategories.includes(filters.category))
      && (filters.athleteLevel === 'all' || workout.athleteLevels.includes(filters.athleteLevel))
      && (filters.seasonPhase === 'all' || workout.seasonPhases.includes(filters.seasonPhase))
      && (filters.pathway === 'all' || workout.eventPathways.includes(filters.pathway))
      && (filters.eventTag === 'all' || workout.eventTags.includes(filters.eventTag))
      && (filters.equipment === 'all' || [...workout.equipmentRequired, ...workout.equipmentOptional].some(item => item.toLowerCase().includes(filters.equipment.toLowerCase())))
      && (filters.surface === 'all' || workout.surface.required.includes(filters.surface) || workout.surface.preferred.includes(filters.surface))
      && (filters.status === 'all' || workout.approvalStatus === filters.status)
      && (filters.sport === 'all' || (workout.sports ?? ['track-and-field']).includes(filters.sport as AthleteSport))
      && (filters.speedGoal === 'all' || (workout.speedGoals ?? []).includes(filters.speedGoal as SpeedGoal))
      && (filters.speedPathway === 'all' || (workout.speedPathways ?? []).includes(filters.speedPathway as SpeedPathway))
      && (filters.trainingContext === 'all' || (workout.trainingContexts ?? []).includes(filters.trainingContext as TrainingContext))
      && matchesDuration(workout, filters.duration);
  });
  return [...filtered].sort((first, second) => {
    if (filters.sort === 'name') return first.name.localeCompare(second.name);
    if (filters.sort === 'duration') return first.metrics.estimatedDurationMinutes[0] - second.metrics.estimatedDurationMinutes[0] || first.name.localeCompare(second.name);
    if (filters.sort === 'recently-updated') return second.updatedAt.localeCompare(first.updatedAt);
    if (filters.sort === 'progression') return first.progressionLevel - second.progressionLevel || first.name.localeCompare(second.name);
    if (query) {
      const firstScore = first.name.toLowerCase().startsWith(query) ? 2 : first.name.toLowerCase().includes(query) ? 1 : 0;
      const secondScore = second.name.toLowerCase().startsWith(query) ? 2 : second.name.toLowerCase().includes(query) ? 1 : 0;
      return secondScore - firstScore || first.name.localeCompare(second.name);
    }
    return first.name.localeCompare(second.name);
  });
}
