import type {
  AthleteExperienceLevel,
  AthleteProfile,
  EquipmentType,
  EventPathway,
  EventTag,
  LibraryAthleteLevel,
  LibrarySeasonPhase,
  LibrarySurface,
  LibraryWorkout,
  LibraryWorkoutCategory,
  LibraryWorkoutItem,
  PlannedExercise,
  PlannedWorkout,
  ScheduledDay,
  TrainingDay,
  WeekdayIndex,
} from '@/types';
import { weekdayLabels } from '@/data/workouts';
import { isRecommendationEligible } from '@/utils/workout-library';

export type SuggestedAlternative = {
  workoutId: string;
  name: string;
};

export type SuggestedPlanDay = {
  dayIndex: WeekdayIndex;
  targetCategory: LibraryWorkoutCategory;
  workoutId: string;
  plannedWorkout: PlannedWorkout;
  whyThisFits: string[];
  harderOptionsExcluded: string[];
  requiredSetup: string;
  stopRule: string;
  alternatives: SuggestedAlternative[];
};

export type WeeklyPlanSuggestion =
  | {
      status: 'ready';
      schedule: ScheduledDay[];
      suggestions: SuggestedPlanDay[];
      summary: string;
      warnings: string[];
    }
  | {
      status: 'coach-managed' | 'unsupported-sport' | 'no-match';
      title: string;
      message: string;
      reasons: string[];
    };

type CandidateContext = {
  event: EventTag;
  pathway: EventPathway;
  level: LibraryAthleteLevel;
  phase: LibrarySeasonPhase;
  surfaces: Set<LibrarySurface>;
  profile: AthleteProfile;
};

const dayIndexByTrainingDay: Record<TrainingDay, WeekdayIndex> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const defaultDayPatterns: Record<number, WeekdayIndex[]> = {
  1: [2],
  2: [2, 5],
  3: [1, 3, 5],
  4: [1, 2, 4, 6],
  5: [1, 2, 4, 5, 6],
};

const highCategories = new Set<LibraryWorkoutCategory>([
  'acceleration',
  'maximum-velocity',
  'starts',
  'speed-endurance',
  'special-endurance',
  'testing',
  'meet-preparation',
]);

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function profileEvent(profile: AthleteProfile): EventTag {
  if (profile.primaryEvent === '60m' || profile.primaryEvent === '100m' || profile.primaryEvent === '200m' || profile.primaryEvent === '400m') {
    return profile.primaryEvent;
  }
  return '100m';
}

function profilePathway(profile: AthleteProfile): EventPathway {
  if (profile.primaryEvent === '100m' || profile.primaryEvent === '60m') return 'short-sprint-100-200';
  if (profile.primaryEvent === '400m') return 'long-sprint-200-400';
  return 'long-sprint-200-400';
}

function profileLevel(level: AthleteExperienceLevel): LibraryAthleteLevel {
  if (level === 'beginner') return 'foundation';
  if (level === 'developing') return 'developing';
  if (level === 'intermediate') return 'trained';
  return 'advanced';
}

function profilePhase(profile: AthleteProfile): LibrarySeasonPhase {
  if (profile.seasonPhase === 'offseason' || profile.seasonPhase === 'general-preparation') return 'general-preparation';
  if (profile.seasonPhase === 'specific-preparation') return 'specific-preparation';
  if (profile.seasonPhase === 'pre-competition') return 'pre-competition';
  if (profile.seasonPhase === 'competition') return 'competition';
  if (profile.seasonPhase === 'championship') return 'taper';
  return 'transition';
}

function availableSurfaces(profile: AthleteProfile) {
  const surfaces = new Set<LibrarySurface>();
  if (profile.trackAccess === 'regular') {
    surfaces.add('track');
    surfaces.add('track-curve');
  }
  if (profile.grassAccess === 'regular') surfaces.add('level-grass');
  if (profile.turfAccess === 'regular') surfaces.add('turf');
  if (profile.hillAccess === 'regular') surfaces.add('hill');
  if (profile.indoorAccess === 'regular') surfaces.add('indoor');
  if (profile.weightRoomAccess === 'regular') surfaces.add('gym');
  if (profile.courtAccess === 'regular') surfaces.add('gym');
  if (profile.homeEquipment.includes('other') || profile.homeEquipment.includes('none')) surfaces.add('home');
  return surfaces;
}

function equipmentTokenAvailable(token: string, profile: AthleteProfile) {
  const value = token.toLowerCase();
  const home = new Set<EquipmentType>(profile.homeEquipment);
  if (!value || value === 'none' || value.includes('optional') || value.includes('preferred')) return true;
  if (value.includes('wall') || value.includes('fence')) return true;
  if (value.includes('cone')) return profile.conesAccess === 'regular' || home.has('cones');
  if (value.includes('starting block')) return profile.startingBlocksAccess === 'regular' || home.has('starting-blocks');
  if (value.includes('sled')) return profile.sledAccess === 'regular' || home.has('sled');
  if (value.includes('timing')) return profile.timingGatesAccess === 'regular' || home.has('timing-gates') || home.has('stopwatch');
  if (value.includes('mini-hurdle') || value.includes('wicket')) return home.has('mini-hurdles');
  if (value.includes('band')) return home.has('resistance-band') || profile.weightRoomAccess === 'regular';
  if (value.includes('dumbbell')) return home.has('dumbbells') || profile.weightRoomAccess === 'regular';
  if (value.includes('kettlebell')) return home.has('kettlebell') || profile.weightRoomAccess === 'regular';
  if (value.includes('weight room') || value.includes('rack') || value.includes('barbell') || value.includes('bench') || value.includes('box') || value.includes('trap bar') || value.includes('plate')) {
    return profile.weightRoomAccess === 'regular';
  }
  if (value.includes('bike') || value.includes('pool')) return profile.indoorAccess === 'regular';
  if (value.includes('specialized') || value.includes('towing') || value.includes('force plate')) return false;
  return true;
}

function logisticsMatch(workout: LibraryWorkout, context: CandidateContext) {
  const surfaceMatches = workout.surface.required.length === 0
    || workout.surface.required.some(surface => context.surfaces.has(surface));
  const equipmentMatches = workout.equipmentRequired.every(requirement =>
    requirement.toLowerCase().split(/\s+or\s+/).some(option => equipmentTokenAvailable(option, context.profile)),
  );
  return surfaceMatches && equipmentMatches;
}

function hardGateMatch(workout: LibraryWorkout, context: CandidateContext) {
  return isRecommendationEligible(workout)
    && (workout.eventPathways.includes('shared') || workout.eventPathways.includes(context.pathway))
    && workout.eventTags.includes(context.event)
    && workout.athleteLevels.includes(context.level)
    && workout.seasonPhases.includes(context.phase)
    && logisticsMatch(workout, context);
}

function requestedCategories(profile: AthleteProfile, count: number): LibraryWorkoutCategory[] {
  const goals = new Set(profile.speedGoals ?? []);
  const categories: LibraryWorkoutCategory[] = [];
  if (goals.has('first-step-quickness') || goals.has('acceleration') || goals.has('track-race-performance')) categories.push('acceleration');
  if (goals.has('maximum-velocity') || goals.has('track-race-performance')) categories.push('maximum-velocity');
  if (goals.has('speed-endurance') || profile.primaryEvent === '200m' || profile.primaryEvent === '400m') categories.push('speed-endurance');
  if (goals.has('explosive-power')) categories.push(profile.weightRoomAccess === 'regular' ? 'strength' : 'plyometrics');
  if (!categories.length) categories.push('acceleration', 'maximum-velocity');

  const safeBase: LibraryWorkoutCategory[] = profile.primaryEvent === '400m'
    ? ['acceleration', 'maximum-velocity', 'speed-endurance', 'strength', 'tempo-recovery']
    : ['acceleration', 'maximum-velocity', 'speed-endurance', 'plyometrics', 'tempo-recovery'];
  return unique([...categories, ...safeBase]).slice(0, count);
}

function selectedDays(profile: AthleteProfile) {
  if (profile.availableTrainingDays.length) {
    return unique(profile.availableTrainingDays.map(day => dayIndexByTrainingDay[day])).sort((a, b) => {
      const order = [1, 2, 3, 4, 5, 6, 0];
      return order.indexOf(a) - order.indexOf(b);
    });
  }
  const count = Math.min(5, Math.max(1, profile.trainingDaysPerWeek > 0 ? profile.trainingDaysPerWeek : 3));
  return defaultDayPatterns[count] ?? defaultDayPatterns[3];
}

function categoryScore(workout: LibraryWorkout, requested: LibraryWorkoutCategory, context: CandidateContext) {
  const eventScore = workout.eventTags.includes(context.event) ? 25 : 0;
  const phaseScore = workout.seasonPhases.includes(context.phase) ? 20 : 0;
  const categoryFit = workout.primaryCategory === requested ? 40 : workout.secondaryCategories.includes(requested) ? 24 : 0;
  const goalScore = workout.speedGoals?.some(goal => context.profile.speedGoals?.includes(goal)) ? 10 : 0;
  const durationLimit = context.profile.usualSessionDurationMinutes || 60;
  const durationScore = workout.metrics.estimatedDurationMinutes[0] <= durationLimit ? 5 : 0;
  return categoryFit + eventScore + phaseScore + goalScore + durationScore - workout.progressionLevel;
}

function rankedForCategory(
  workouts: LibraryWorkout[],
  requested: LibraryWorkoutCategory,
  context: CandidateContext,
  usedIds: Set<string>,
) {
  return workouts
    .filter(workout => hardGateMatch(workout, context))
    .filter(workout => workout.primaryCategory === requested || workout.secondaryCategories.includes(requested))
    .map(workout => ({ workout, score: categoryScore(workout, requested, context) - (usedIds.has(workout.id) ? 100 : 0) }))
    .sort((first, second) => second.score - first.score
      || first.workout.progressionLevel - second.workout.progressionLevel
      || first.workout.id.localeCompare(second.workout.id));
}

function formatRange(range?: [number, number]) {
  if (!range) return '';
  return range[0] === range[1] ? `${range[0]}s` : `${range[0]}–${range[1]}s`;
}

function itemDetail(item: LibraryWorkoutItem) {
  const structure = [
    item.sets ? `${item.sets} set${item.sets === 1 ? '' : 's'}` : '',
    item.reps ? `${item.reps} rep${item.reps === 1 ? '' : 's'}` : '',
    item.distanceMeters ? `${item.distanceMeters}m` : '',
    item.durationSeconds ? `${Math.round(item.durationSeconds / 60)} min` : '',
  ].filter(Boolean).join(' · ');
  const prescription = [
    item.intensity?.description,
    item.recovery?.description || formatRange(item.recovery?.rangeSeconds),
    item.notes,
  ].filter(Boolean).join(' · ');
  return [structure, prescription].filter(Boolean).join(' — ');
}

function toPlannedExercise(item: LibraryWorkoutItem, section: 'warmup' | 'sprintWork' | 'plyometrics' | 'strength' | 'cooldown'): PlannedExercise {
  const detail = itemDetail(item);
  if (section === 'sprintWork' && item.distanceMeters) {
    return {
      id: item.id,
      name: item.name,
      detail,
      tracking: {
        kind: 'track',
        reps: Math.max(1, (item.sets ?? 1) * (item.reps ?? 1)),
        distanceMeters: item.distanceMeters,
        targetIntensity: item.intensity?.max ?? item.intensity?.min,
        restSeconds: item.recovery?.afterRepSeconds ?? item.recovery?.rangeSeconds?.[1],
      },
    };
  }
  if (section === 'strength') {
    return {
      id: item.id,
      name: item.name,
      detail,
      tracking: {
        kind: 'strength',
        sets: Math.max(1, item.sets ?? 1),
        targetReps: item.reps ? String(item.reps) : 'Quality reps',
        restSeconds: item.recovery?.afterSetSeconds ?? item.recovery?.rangeSeconds?.[1],
      },
    };
  }
  return { id: item.id, name: item.name, detail, tracking: { kind: 'completion' } };
}

export function libraryWorkoutToPlannedWorkout(workout: LibraryWorkout): PlannedWorkout {
  const mapSection = (key: 'warmup' | 'sprintWork' | 'plyometrics' | 'strength' | 'cooldown', title: string) => ({
    title,
    exercises: workout.sections[key].items.map(item => toPlannedExercise(item, key)),
  });
  return {
    id: workout.id,
    title: workout.name,
    purpose: workout.purpose,
    durationMinutes: Math.round((workout.metrics.estimatedDurationMinutes[0] + workout.metrics.estimatedDurationMinutes[1]) / 2),
    sections: [
      mapSection('warmup', 'Warm-up'),
      mapSection('sprintWork', 'Track'),
      mapSection('plyometrics', 'Plyometrics'),
      mapSection('strength', 'Strength'),
      { title: 'Conditioning', exercises: [] },
      mapSection('cooldown', 'Cooldown'),
    ],
  };
}

function suggestionDetails(
  dayIndex: WeekdayIndex,
  requested: LibraryWorkoutCategory,
  ranked: Array<{ workout: LibraryWorkout; score: number }>,
  context: CandidateContext,
): SuggestedPlanDay {
  const selected = ranked[0].workout;
  const why = [
    `${selected.primaryCategory.replaceAll('-', ' ')} matches this day’s training target`,
    `${context.event} and ${context.phase.replaceAll('-', ' ')} are approved for this record`,
    `${context.level.replaceAll('-', ' ')} experience is within the reviewed range`,
  ];
  const excluded: string[] = [];
  if (context.level !== 'advanced') excluded.push('Advanced progressions stay locked until the required experience is present.');
  if (!context.profile.startingBlocksAccess || context.profile.startingBlocksAccess === 'none') excluded.push('Block-dependent options were excluded because blocks were not selected.');
  if (selected.metrics.highCns) excluded.push('The weekly layout avoids placing another high-speed session on the next day.');
  return {
    dayIndex,
    targetCategory: requested,
    workoutId: selected.id,
    plannedWorkout: libraryWorkoutToPlannedWorkout(selected),
    whyThisFits: why,
    harderOptionsExcluded: excluded,
    requiredSetup: [
      selected.surface.required.join(' or '),
      selected.equipmentRequired.join(', '),
    ].filter(Boolean).join(' · ') || 'No special setup',
    stopRule: selected.safetyNotes[0] ?? 'Stop if pain or technique changes.',
    alternatives: ranked.slice(1, 3).map(item => ({ workoutId: item.workout.id, name: item.workout.name })),
  };
}

function restDay(dayIndex: WeekdayIndex): ScheduledDay {
  return {
    dayIndex,
    shortLabel: weekdayLabels[dayIndex].short,
    fullLabel: weekdayLabels[dayIndex].full,
    kind: 'rest',
    restTitle: 'Rest / existing training',
    restNote: 'No SprintLab speed session is scheduled. Team practice, coach work, and recovery still count as training demands.',
  };
}

export function buildDeterministicWeeklyPlan(
  profile: AthleteProfile,
  workouts: LibraryWorkout[],
): WeeklyPlanSuggestion {
  if (profile.trainingPlanMode === 'log-coach-plan' || profile.loggingOnlyMode) {
    return {
      status: 'coach-managed',
      title: 'Your coach plan stays in control',
      message: 'SprintLab will not replace a coach-created or logging-only plan.',
      reasons: ['You can keep editing the weekly schedule manually.', 'Workout execution, History, and Progress remain available.'],
    };
  }
  const primarySport = profile.primarySport ?? profile.sport ?? 'track-and-field';
  if (primarySport !== 'track-and-field') {
    return {
      status: 'unsupported-sport',
      title: 'Track is the first complete planning pathway',
      message: 'Your profile and logs support multiple sports, but reviewed automatic plans are currently limited to track & field.',
      reasons: profile.sports?.includes('track-and-field')
        ? ['Set Track & field as the main profile focus to preview the track pathway.']
        : ['Keep logging your speed work while sport-specific libraries are reviewed.'],
    };
  }

  const context: CandidateContext = {
    event: profileEvent(profile),
    pathway: profilePathway(profile),
    level: profileLevel(profile.experienceLevel),
    phase: profilePhase(profile),
    surfaces: availableSurfaces(profile),
    profile,
  };
  const days = selectedDays(profile);
  const categories = requestedCategories(profile, days.length);
  const usedIds = new Set<string>();
  const suggestions: SuggestedPlanDay[] = [];
  const failures: string[] = [];

  days.forEach((dayIndex, index) => {
    let requested = categories[index] ?? 'tempo-recovery';
    const previousDay = index > 0 ? days[index - 1] : null;
    const previousSuggestion = suggestions[index - 1];
    const consecutive = previousDay !== null && ((dayIndex - previousDay + 7) % 7 === 1);
    if (consecutive && previousSuggestion && highCategories.has(previousSuggestion.targetCategory) && highCategories.has(requested)) {
      requested = index === days.length - 1 && profile.weightRoomAccess === 'regular' ? 'strength' : 'tempo-recovery';
    }
    let ranked = rankedForCategory(workouts, requested, context, usedIds);
    if (!ranked.length && requested !== 'tempo-recovery') {
      ranked = rankedForCategory(workouts, 'tempo-recovery', context, usedIds);
      if (ranked.length) requested = 'tempo-recovery';
    }
    if (!ranked.length) {
      failures.push(`${weekdayLabels[dayIndex].full}: no Approved ${requested.replaceAll('-', ' ')} record matches the selected event, phase, level, surface, and equipment.`);
      return;
    }
    const detail = suggestionDetails(dayIndex, requested, ranked, context);
    suggestions.push(detail);
    usedIds.add(detail.workoutId);
  });

  if (!suggestions.length || failures.length) {
    return {
      status: 'no-match',
      title: 'No safe complete week matched yet',
      message: 'SprintLab did not invent sessions to fill the calendar.',
      reasons: failures.length ? failures : ['Review training access, experience, season phase, and available days.'],
    };
  }

  const suggestionByDay = new Map(suggestions.map(item => [item.dayIndex, item]));
  const schedule: ScheduledDay[] = ([1, 2, 3, 4, 5, 6, 0] as WeekdayIndex[]).map(dayIndex => {
    const suggestion = suggestionByDay.get(dayIndex);
    return suggestion
      ? {
          dayIndex,
          shortLabel: weekdayLabels[dayIndex].short,
          fullLabel: weekdayLabels[dayIndex].full,
          kind: 'workout',
          workout: suggestion.plannedWorkout,
        }
      : restDay(dayIndex);
  });

  return {
    status: 'ready',
    schedule,
    suggestions,
    summary: `${suggestions.length} Approved track sessions for a ${context.event} athlete in ${context.phase.replaceAll('-', ' ')}.`,
    warnings: [
      'This preview does not change the current plan until you save it.',
      'Daily readiness can still be a reason to stop, modify, or consult a coach.',
      'The app organizes training; it does not diagnose injuries or replace qualified coaching.',
    ],
  };
}

export function replaceSuggestedWorkout(
  plan: Extract<WeeklyPlanSuggestion, { status: 'ready' }>,
  dayIndex: WeekdayIndex,
  workoutId: string,
  workouts: LibraryWorkout[],
) {
  const current = plan.suggestions.find(item => item.dayIndex === dayIndex);
  const replacement = workouts.find(item => item.id === workoutId);
  if (!current || !replacement || !isRecommendationEligible(replacement)) return plan;
  const nextDay: SuggestedPlanDay = {
    ...current,
    workoutId: replacement.id,
    plannedWorkout: libraryWorkoutToPlannedWorkout(replacement),
    whyThisFits: [
      `${replacement.primaryCategory.replaceAll('-', ' ')} is an Approved alternative for this day`,
      'The original profile, phase, and logistics filters remain in effect',
    ],
    requiredSetup: [replacement.surface.required.join(' or '), replacement.equipmentRequired.join(', ')].filter(Boolean).join(' · ') || 'No special setup',
    stopRule: replacement.safetyNotes[0] ?? 'Stop if pain or technique changes.',
  };
  const suggestions = plan.suggestions.map(item => item.dayIndex === dayIndex ? nextDay : item);
  const schedule = plan.schedule.map(day => day.dayIndex === dayIndex ? { ...day, kind: 'workout' as const, workout: nextDay.plannedWorkout } : day);
  return { ...plan, suggestions, schedule };
}
