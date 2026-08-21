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
  WorkoutCategory,
} from '@/types';
import { weekdayLabels } from '@/data/workouts';
import { deriveSeasonPhase, meetWindowAllowsWorkout, seasonCalendarFromProfile } from '@/utils/season-engine';
import {
  buildWeeklyArchitecture,
  type WeeklyArchitectureSlot,
  type WeeklyLoadClass,
} from '@/utils/weekly-architecture';
import { isRecommendationEligible } from '@/utils/workout-library';

/**
 * MVP scope: phase-specific periodization (specific-preparation/pre-competition/competition/
 * taper/transition role sets and workout-phase gating) is intentionally NOT active yet. Every
 * deterministic plan is generated against this single, broadly-supported phase so a real season
 * phase — or a missing one — can never block generation (see PLAN_ENGINE_QA_REPORT.md, Critical
 * #2). The athlete's actual derived season phase (utils/season-engine.ts) is still computed and
 * stored for Coach context, meet-proximity safety narrowing, and future phase-aware
 * periodization; it is just not used as a workout-eligibility gate here. The phase-specific
 * functions in utils/weekly-architecture.ts remain intact, unused by this MVP path, for that
 * future work — do not delete them.
 */
export const MVP_GENERATION_PHASE: LibrarySeasonPhase = 'general-preparation';

export type SuggestedAlternative = {
  workoutId: string;
  name: string;
};

export type SuggestedPlanDay = {
  dayIndex: WeekdayIndex;
  weeklyRole: string;
  loadClass: WeeklyLoadClass;
  targetCategory: LibraryWorkoutCategory;
  workoutId: string;
  supportWorkoutIds: string[];
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
  season: ReturnType<typeof deriveSeasonPhase>;
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
  if (profile.courtAccess === 'regular') surfaces.add('court');
  if (profile.homeEquipment.includes('other') || profile.homeEquipment.includes('none')) surfaces.add('home');
  return surfaces;
}

function logisticsMatch(workout: LibraryWorkout, _context: CandidateContext) {
  // Location and ordinary equipment were intentionally removed from onboarding, and
  // trackAccess/grassAccess/hillAccess/indoorAccess/startingBlocksAccess/weightRoomAccess/
  // homeEquipment/courtAccess/sledAccess/timingGatesAccess/conesAccess/turfAccess on
  // AthleteProfile are consequently never collected by any onboarding or Settings UI — every
  // athlete carries the same hardcoded defaults (see blankProfile() in app/profile.tsx). Do not
  // reintroduce per-athlete equipment gating or "your equipment" copy from those fields; doing so
  // would present a hardcoded default as if it were a real answer. Missing answers mean "use the
  // standard authored session and show its plain equipment list" — never "the athlete has no
  // track, blocks, or weights". Only genuinely specialized technology remains a recommendation gate.
  return workout.equipmentRequired.every(requirement => {
    const value = requirement.toLowerCase();
    return !value.includes('force plate')
      && !value.includes('towing system')
      && !value.includes('assisted sprint');
  });
}

function hardGateMatch(workout: LibraryWorkout, context: CandidateContext) {
  return isRecommendationEligible(workout)
    && (workout.eventPathways.includes('shared') || workout.eventPathways.includes(context.pathway))
    && workout.eventTags.includes(context.event)
    && workout.athleteLevels.includes(context.level)
    && workout.seasonPhases.includes(context.phase)
    && logisticsMatch(workout, context);
}

function selectedDays(profile: AthleteProfile) {
  const blocked = new Set<WeekdayIndex>();
  if (profile.preferredRestDayAnswered !== false) {
    blocked.add(dayIndexByTrainingDay[profile.preferredRestDay]);
  }
  (profile.sportPracticeDays ?? []).forEach(day => blocked.add(dayIndexByTrainingDay[day]));
  (profile.otherSportDays ?? []).forEach(day => blocked.add(dayIndexByTrainingDay[day]));
  (profile.gameOrCompetitionDays ?? []).forEach(value => {
    if (value in dayIndexByTrainingDay) {
      blocked.add(dayIndexByTrainingDay[value as TrainingDay]);
      return;
    }
    const date = new Date(`${value}T12:00:00`);
    const daysAway = Math.ceil((date.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
    if (!Number.isNaN(date.getTime()) && daysAway >= 0 && daysAway <= 6) blocked.add(date.getDay() as WeekdayIndex);
  });
  (profile.seasonCalendar?.priorityMeets ?? []).forEach(meet => {
    const date = new Date(`${meet.date}T12:00:00`);
    const daysAway = Math.ceil((date.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
    if (!Number.isNaN(date.getTime()) && daysAway >= 0 && daysAway <= 6) blocked.add(date.getDay() as WeekdayIndex);
  });

  if (profile.availableTrainingDays.length) {
    return unique(profile.availableTrainingDays.map(day => dayIndexByTrainingDay[day]))
      .filter(day => !blocked.has(day))
      .sort((a, b) => {
      const order = [1, 2, 3, 4, 5, 6, 0];
      return order.indexOf(a) - order.indexOf(b);
    });
  }
  const count = Math.min(5, Math.max(1, profile.trainingDaysPerWeek > 0 ? profile.trainingDaysPerWeek : 3));
  const preferred = defaultDayPatterns[count] ?? defaultDayPatterns[3];
  const busySchoolDays = new Set((profile.busySchoolDays ?? []).map(day => dayIndexByTrainingDay[day]));
  const chosen = preferred.filter(day => !blocked.has(day) && !busySchoolDays.has(day));
  const calendarOrder: WeekdayIndex[] = [1, 2, 3, 4, 5, 6, 0];
  for (const day of calendarOrder) {
    if (chosen.length >= count) break;
    if (!blocked.has(day) && !busySchoolDays.has(day) && !chosen.includes(day)) chosen.push(day);
  }
  for (const day of calendarOrder) {
    if (chosen.length >= count) break;
    if (!blocked.has(day) && !chosen.includes(day)) chosen.push(day);
  }
  return chosen.sort((a, b) => calendarOrder.indexOf(a) - calendarOrder.indexOf(b));
}

export function blockedWeekdayReasons(profile: AthleteProfile) {
  const reasons = new Map<WeekdayIndex, string[]>();
  const add = (day: WeekdayIndex, reason: string) => reasons.set(day, [...(reasons.get(day) ?? []), reason]);
  if (profile.preferredRestDayAnswered !== false) {
    add(dayIndexByTrainingDay[profile.preferredRestDay], 'Preferred rest day');
  }
  (profile.sportPracticeDays ?? []).forEach(day => add(dayIndexByTrainingDay[day], 'Team practice'));
  (profile.otherSportDays ?? []).forEach(day => add(dayIndexByTrainingDay[day], 'Another sport'));
  (profile.gameOrCompetitionDays ?? []).forEach(value => {
    if (value in dayIndexByTrainingDay) {
      add(dayIndexByTrainingDay[value as TrainingDay], 'Recurring game or competition');
      return;
    }
    const date = new Date(`${value}T12:00:00`);
    const daysAway = Math.ceil((date.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
    if (!Number.isNaN(date.getTime()) && daysAway >= 0 && daysAway <= 6) add(date.getDay() as WeekdayIndex, `Competition on ${value}`);
  });
  (profile.seasonCalendar?.priorityMeets ?? []).forEach(meet => {
    const date = new Date(`${meet.date}T12:00:00`);
    const daysAway = Math.ceil((date.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
    if (!Number.isNaN(date.getTime()) && daysAway >= 0 && daysAway <= 6) add(date.getDay() as WeekdayIndex, `${meet.priority}-priority: ${meet.name}`);
  });
  return reasons;
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
  dayIndex: WeekdayIndex,
) {
  const today = new Date();
  const daysAhead = (dayIndex - today.getDay() + 7) % 7;
  const workoutDate = new Date(today);
  workoutDate.setDate(today.getDate() + daysAhead);
  const date = workoutDate.toLocaleDateString('en-CA');
  const calendar = seasonCalendarFromProfile(context.profile);
  return workouts
    .filter(workout => hardGateMatch(workout, context))
    .filter(workout => meetWindowAllowsWorkout(workout, context.season, date, calendar))
    .filter(workout => workout.primaryCategory === requested || workout.secondaryCategories.includes(requested))
    .filter(workout => !usedIds.has(workout.id))
    .map(workout => ({ workout, score: categoryScore(workout, requested, context) }))
    .sort((first, second) => second.score - first.score
      || first.workout.progressionLevel - second.workout.progressionLevel
      || first.workout.id.localeCompare(second.workout.id));
}

function rankedForSlot(
  workouts: LibraryWorkout[],
  slot: WeeklyArchitectureSlot,
  context: CandidateContext,
  usedIds: Set<string>,
  dayIndex: WeekdayIndex,
) {
  const categories = [slot.targetCategory, ...slot.categoryAlternatives];
  for (const category of categories) {
    const ranked = rankedForCategory(workouts, category, context, usedIds, dayIndex)
      .map(item => {
        const preferredIndex = slot.preferredWorkoutIds.indexOf(item.workout.id);
        return {
          ...item,
          score: item.score + (preferredIndex >= 0 ? Math.max(0, 30 - preferredIndex * 4) : 0),
        };
      })
      .sort((first, second) => {
        const firstPreferred = slot.preferredWorkoutIds.indexOf(first.workout.id);
        const secondPreferred = slot.preferredWorkoutIds.indexOf(second.workout.id);
        const firstRank = firstPreferred < 0 ? 99 : firstPreferred;
        const secondRank = secondPreferred < 0 ? 99 : secondPreferred;
        return firstRank - secondRank
          || second.score - first.score
          || first.workout.id.localeCompare(second.workout.id);
      });
    if (ranked.length) return { category, ranked };
  }
  return { category: slot.targetCategory, ranked: [] as { workout: LibraryWorkout; score: number }[] };
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

function toPlannedExercise(item: LibraryWorkoutItem, section: 'warmup' | 'sprintWork' | 'plyometrics' | 'strength' | 'coreBodyweight' | 'cooldown'): PlannedExercise {
  const detail = itemDetail(item);
  const cue = item.coachingCues[0];
  if (section === 'sprintWork' && item.distanceMeters) {
    return {
      id: item.id,
      name: item.name,
      detail,
      cue,
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
      cue,
      tracking: {
        kind: 'strength',
        sets: Math.max(1, item.sets ?? 1),
        targetReps: item.reps ? String(item.reps) : 'Quality reps',
        restSeconds: item.recovery?.afterSetSeconds ?? item.recovery?.rangeSeconds?.[1],
      },
    };
  }
  return { id: item.id, name: item.name, detail, cue, tracking: { kind: 'completion' } };
}

/** Library primary categories are more granular than the domain WorkoutCategory a PlannedWorkout carries. */
const libraryCategoryToWorkoutCategory: Record<LibraryWorkoutCategory, WorkoutCategory> = {
  acceleration: 'acceleration',
  'maximum-velocity': 'maximum-velocity',
  starts: 'acceleration',
  'speed-endurance': 'speed-endurance',
  'special-endurance': 'special-endurance',
  'tempo-recovery': 'tempo',
  strength: 'strength',
  plyometrics: 'plyometrics',
  'core-bodyweight': 'strength',
  testing: 'testing',
  'meet-preparation': 'competition',
  'multidirectional-acceleration': 'acceleration',
  deceleration: 'acceleration',
  'change-of-direction': 'mixed',
  'reactive-agility': 'mixed',
  'repeated-sprint-ability': 'speed-endurance',
  'resisted-sprinting': 'acceleration',
  'assisted-sprint-exposure': 'maximum-velocity',
  'combine-preparation': 'competition',
  'field-conditioning': 'mixed',
  'court-speed': 'acceleration',
  'explosive-power': 'plyometrics',
  'sport-practice-recovery': 'recovery',
  'game-day-preparation': 'competition',
};

export function libraryWorkoutToPlannedWorkout(workout: LibraryWorkout): PlannedWorkout {
  const mapSection = (key: 'warmup' | 'sprintWork' | 'plyometrics' | 'strength' | 'coreBodyweight' | 'cooldown', title: string) => ({
    title,
    exercises: workout.sections[key].items.map(item => toPlannedExercise(item, key)),
  });
  return {
    id: workout.id,
    title: workout.name,
    purpose: workout.purpose,
    durationMinutes: Math.round((workout.metrics.estimatedDurationMinutes[0] + workout.metrics.estimatedDurationMinutes[1]) / 2),
    category: libraryCategoryToWorkoutCategory[workout.primaryCategory],
    eventTags: workout.eventTags,
    sections: [
      mapSection('warmup', 'Warm-up'),
      mapSection('sprintWork', 'Track'),
      mapSection('plyometrics', 'Plyometrics'),
      mapSection('strength', 'Strength'),
      mapSection('coreBodyweight', 'Core / bodyweight'),
      mapSection('cooldown', 'Cooldown'),
    ],
  };
}

function pairPlannedWorkouts(primary: LibraryWorkout, support?: LibraryWorkout): PlannedWorkout {
  const planned = libraryWorkoutToPlannedWorkout(primary);
  if (!support) return planned;
  const supportPlan = libraryWorkoutToPlannedWorkout(support);
  const supportSections = supportPlan.sections
    .filter(section => ['Strength', 'Core / bodyweight', 'Plyometrics'].includes(section.title))
    .filter(section => section.exercises.length > 0)
    .map(section => ({
      ...section,
      title: section.title === 'Strength' ? 'Strength · paired' : `${section.title} · paired`,
    }));
  return {
    ...planned,
    id: `${primary.id}+${support.id}`,
    title: `${primary.name} + ${support.name}`,
    purpose: `${primary.purpose} Paired with ${support.name.toLowerCase()} on the same high-output day.`,
    durationMinutes: planned.durationMinutes + supportPlan.durationMinutes,
    sections: [...planned.sections, ...supportSections],
  };
}

function suggestionDetails(
  dayIndex: WeekdayIndex,
  slot: WeeklyArchitectureSlot,
  requested: LibraryWorkoutCategory,
  ranked: { workout: LibraryWorkout; score: number }[],
  context: CandidateContext,
  support?: LibraryWorkout,
): SuggestedPlanDay {
  const selected = ranked[0].workout;
  const why = [
    `${slot.label} is the ${slot.loadClass}-output role assigned by this week’s ${context.event} microcycle`,
    slot.rationale,
    `${selected.primaryCategory.replaceAll('-', ' ')} matches that role`,
    `${context.event} and ${context.phase.replaceAll('-', ' ')} are approved for this record`,
    `${context.level.replaceAll('-', ' ')} experience is within the reviewed range`,
  ];
  if (support) why.push(`${support.name} is an Approved strength pairing; its authored sets and exercises are included.`);
  const excluded: string[] = [];
  if (selected.metrics.highCns) excluded.push('The next calendar role is lower output so high-speed work is not stacked blindly.');
  if (context.phase === 'general-preparation') excluded.push('Special-endurance and race-model work stay out of this general-preparation week.');
  return {
    dayIndex,
    weeklyRole: slot.label,
    loadClass: slot.loadClass,
    targetCategory: requested,
    workoutId: selected.id,
    supportWorkoutIds: support ? [support.id] : [],
    plannedWorkout: pairPlannedWorkouts(selected, support),
    whyThisFits: why,
    harderOptionsExcluded: excluded,
    requiredSetup: [
      selected.surface.required.join(' or '),
      [...selected.equipmentRequired, ...(support?.equipmentRequired ?? [])].join(', '),
    ].filter(Boolean).join(' · ') || 'No special setup',
    stopRule: selected.safetyNotes[0] ?? 'Stop if pain or technique changes.',
    alternatives: ranked.slice(1, 3).map(item => ({ workoutId: item.workout.id, name: item.workout.name })),
  };
}

/**
 * A day the deterministic selector didn't schedule a session for. Two genuinely different cases,
 * distinguished so Today/Plan never call a plan-driven rest day "not scheduled" — only a day with
 * a real external commitment (team practice, another sport, a game/meet) keeps the "something
 * else already happens here" framing; a day that's simply not one of the athlete's chosen training
 * days per week (or their preferred rest day) is an intentional Rest Day, not an unresolved gap.
 * `blockedReasons` — from `blockedWeekdayReasons(profile)` — carries that distinction in; 'Preferred
 * rest day' alone doesn't count as an external commitment.
 */
function restDay(dayIndex: WeekdayIndex, blockedReasons: string[] = []): ScheduledDay {
  const hasExternalCommitment = blockedReasons.some(reason => reason !== 'Preferred rest day');
  return {
    dayIndex,
    shortLabel: weekdayLabels[dayIndex].short,
    fullLabel: weekdayLabels[dayIndex].full,
    kind: 'rest',
    restTitle: hasExternalCommitment ? 'Open / existing training' : 'Rest day',
    restNote: hasExternalCommitment
      ? 'No SprintLab speed session is scheduled. Team practice, coach work, and recovery still count as training demands.'
      : 'No training is scheduled today. Recovery is part of the plan — not a missed session.',
  };
}

type GeneralSpeedRole = {
  label: string;
  loadClass: WeeklyLoadClass;
  category: LibraryWorkoutCategory;
  preferredIds: string[];
  pairStrength?: boolean;
  rationale: string;
};

type GeneralSpeedTier = 'foundation' | 'trained' | 'advanced';

const tierSuffix: Record<GeneralSpeedTier, '01' | '02' | '03'> = {
  foundation: '01',
  trained: '02',
  advanced: '03',
};

function generalSpeedTier(level: LibraryAthleteLevel): GeneralSpeedTier {
  if (level === 'advanced') return 'advanced';
  if (level === 'trained') return 'trained';
  return 'foundation';
}

function adjustedGeneralSpeedTier(
  profile: AthleteProfile,
  phase: ReturnType<typeof deriveSeasonPhase>['phase'],
  level: LibraryAthleteLevel,
) {
  const startingTier = generalSpeedTier(level);
  const shouldRegress = profile.currentPain === true
    || profile.trainingContext === 'return-to-training'
    || phase === 'taper';
  if (!shouldRegress || startingTier === 'foundation') {
    return { tier: startingTier, selectionLevel: level, reason: undefined };
  }
  const tier: GeneralSpeedTier = startingTier === 'advanced' ? 'trained' : 'foundation';
  const selectionLevel: LibraryAthleteLevel = tier === 'trained' ? 'trained' : 'developing';
  const cause = profile.currentPain
    ? 'reported pain or limitation'
    : profile.trainingContext === 'return-to-training'
      ? 'return-to-training context'
      : 'taper context';
  return {
    tier,
    selectionLevel,
    reason: `This session was reduced one reviewed level because of the athlete’s ${cause}.`,
  };
}

function generalSpeedRoles(
  sessionCount: number,
  football: boolean,
  inSeason: boolean,
  level: LibraryAthleteLevel,
  tier: GeneralSpeedTier,
  limitedLinearSpace: boolean,
): GeneralSpeedRole[] {
  if (limitedLinearSpace) {
    const limitedRoles: GeneralSpeedRole[] = [
      {
        label: 'Limited-space acceleration',
        loadClass: 'moderate',
        category: 'acceleration',
        preferredIds: ['GEN-COURT-ACC-01'],
        pairStrength: !inSeason,
        rationale: 'The available court or indoor lane supports short acceleration, but not a fake maximum-velocity session.',
      },
      {
        label: 'Movement and trunk support',
        loadClass: 'low',
        category: 'core-bodyweight',
        preferredIds: ['CORE-02', 'CORE-01'],
        rationale: 'General strength support fills a real need without pretending limited space can provide upright speed.',
      },
      {
        label: 'Elastic movement foundation',
        loadClass: 'low',
        category: 'plyometrics',
        preferredIds: ['PLY-01', 'CORE-02'],
        rationale: 'Low-complexity jumps and landings support acceleration while preserving recovery.',
      },
      {
        label: 'Low technical support',
        loadClass: 'low',
        category: 'tempo-recovery',
        preferredIds: ['GEN-LOW-01', 'CORE-01'],
        rationale: 'The fourth session stays low; a fifth filler workout is not added just because five days were available.',
      },
    ];
    return limitedRoles.slice(0, Math.min(sessionCount, 4));
  }

  if (inSeason) {
    const microdose: GeneralSpeedRole = {
      label: 'In-season speed microdose',
      loadClass: 'moderate',
      category: 'maximum-velocity',
      preferredIds: ['GEN-MICRO-01'],
      rationale: 'A brief combined exposure maintains acceleration and upright speed without pretending practice load does not exist.',
    };
    const low: GeneralSpeedRole = {
      label: 'In-season recovery support',
      loadClass: 'low',
      category: 'tempo-recovery',
      preferredIds: ['GEN-LOW-01', 'TEM-03', 'CORE-01'],
      rationale: 'The second day remains low so the sport schedule stays in control.',
    };
    const support: GeneralSpeedRole = {
      label: 'Reduced strength support',
      loadClass: 'low',
      category: 'core-bodyweight',
      preferredIds: ['CORE-01', 'GEN-LOW-01'],
      rationale: 'Accessory volume is reduced in season rather than adding another demanding session.',
    };
    return [microdose, low, support].slice(0, Math.min(sessionCount, 3));
  }

  const acceleration: GeneralSpeedRole = {
    label: football ? '40-yard acceleration' : 'Linear acceleration',
    loadClass: 'high',
    category: football ? 'combine-preparation' : 'acceleration',
    preferredIds: football
      ? [`F40-ACC-${tierSuffix[tier]}`]
      : [`GEN-ACC-${tierSuffix[tier]}`],
    pairStrength: true,
    rationale: 'A quality acceleration exposure develops the first portion of linear speed with full recovery.',
  };
  const upright: GeneralSpeedRole = {
    label: football ? 'Upright speed for the 20–40 yard segment' : 'Upright maximum velocity',
    loadClass: 'high',
    category: football ? 'combine-preparation' : 'maximum-velocity',
    preferredIds: football
      ? [`F40-MAX-${tierSuffix[tier]}`]
      : [`GEN-MAX-${tierSuffix[tier]}`],
    pairStrength: true,
    rationale: 'Acceleration alone is incomplete; upright speed receives its own quality exposure.',
  };
  const lowTechnical: GeneralSpeedRole = {
    label: 'Low technical / extensive work',
    loadClass: 'low',
    category: 'tempo-recovery',
    preferredIds: ['GEN-LOW-01', 'TEM-03', 'CORE-02'],
    rationale: 'This day stays genuinely lower output so it supports rather than competes with speed quality.',
  };
  const support: GeneralSpeedRole = {
    label: 'Movement and trunk support',
    loadClass: 'low',
    category: 'core-bodyweight',
    preferredIds: ['CORE-02', 'GEN-LOW-01'],
    rationale: 'The separate support day stays low because primary strength work is already paired with the two quality speed days.',
  };
  const integration: GeneralSpeedRole = {
    label: football ? '40-yard integration' : 'Acceleration integration',
    loadClass: 'high',
    category: football ? 'combine-preparation' : 'acceleration',
    preferredIds: football ? ['F40-TRANSFER-01', 'GEN-INTEGRATE-01'] : ['GEN-INTEGRATE-01'],
    pairStrength: false,
    rationale: football
      ? 'A third quality day is reserved for experienced five-day profiles and connects early acceleration with longer upright running.'
      : 'A third quality exposure is used only in a five-day plan and remains separated from the other high-output days.',
  };

  if (sessionCount <= 2) return [acceleration, upright];
  if (sessionCount === 3) return [acceleration, lowTechnical, upright];
  if (sessionCount === 4) return [acceleration, lowTechnical, upright, support];
  if (level === 'foundation' || level === 'developing') {
    return [
      acceleration,
      lowTechnical,
      upright,
      support,
      {
        label: 'Elastic movement foundation',
        loadClass: 'low',
        category: 'plyometrics',
        preferredIds: ['PLY-01', 'PLY-07', 'CORE-02'],
        rationale: 'Newer athletes use the fifth day for movement quality instead of receiving a third demanding sprint exposure.',
      },
    ];
  }
  return [acceleration, lowTechnical, upright, support, integration];
}

/**
 * Deterministic strength-record preference order for a paired strength day — replaces a flat
 * STR-01/STR-02 alternation. Depends only on the athlete's library level and which purpose-slot
 * of the week this pairing fills; deliberately does NOT depend on onboarding equipment answers
 * (gym-equipment availability does not customize the base plan — see PLAN_ENGINE_QA_REPORT.md),
 * random rotation, or day-index parity for its own sake.
 *
 * `purposeSlot` is the 0-based ordinal of paired-strength occurrences so far this week, not a
 * raw day index. The active MVP architecture (utils/weekly-architecture.ts's generalPreparation,
 * and generalSpeedRoles() in this file) always places exactly two paired-strength sessions per
 * week, in a fixed order: the first is always the acceleration/force-purpose sprint session, the
 * second is always the maximum-velocity/explosive-purpose one. This holds for every sport, event,
 * and day-count the MVP produces, so purposeSlot 0/1 reliably identifies the sprint session's
 * purpose rather than an arbitrary position.
 *
 * - Foundation/developing: STR-01 (force-oriented) / STR-02 (explosive) — the two records whose
 *   own authored `intendedAthlete` copy describes them as the complete foundational pair for
 *   every experience level; this tier generally favors that simpler foundational template.
 * - Trained/advanced: STR-04 (posterior-chain) / STR-05 (unilateral) as the primary, more
 *   specialized choice for each purpose — appropriate once an athlete has progressed past the
 *   foundational template — with STR-01/STR-02 kept as a genuine fallback (never actually needed
 *   today, since STR-04/05 are always eligible, but preserved so a future level/phase gate can't
 *   silently produce an unpaired day).
 * STR-03 stays last in every list: an approved, always-eligible safety net, never the default —
 * it only becomes a possible pick if the earlier preferred records ever become ineligible or
 * already used, never because of the athlete's equipment answers.
 */
function strengthPreferenceOrder(level: LibraryAthleteLevel, purposeSlot: number): string[] {
  const isForcePurpose = purposeSlot === 0;
  if (level === 'foundation' || level === 'developing') {
    return isForcePurpose ? ['STR-01', 'STR-04', 'STR-03'] : ['STR-02', 'STR-05', 'STR-03'];
  }
  return isForcePurpose ? ['STR-04', 'STR-01', 'STR-03'] : ['STR-05', 'STR-02', 'STR-03'];
}

function firstEligibleById(
  workouts: LibraryWorkout[],
  ids: string[],
  profile: AthleteProfile,
  season: ReturnType<typeof deriveSeasonPhase>,
  selectionLevel?: LibraryAthleteLevel,
) {
  const surfaces = availableSurfaces(profile);
  const level = selectionLevel ?? profileLevel(profile.experienceLevel);
  // MVP: eligibility always uses MVP_GENERATION_PHASE — see that constant's doc comment. A
  // missing calendar (season.phase === 'needs-calendar') no longer blocks selection.
  const phase = MVP_GENERATION_PHASE;
  const ordered = ids
    .map(id => workouts.find(workout => workout.id === id))
    .filter((workout): workout is LibraryWorkout => Boolean(workout));
  return ordered.find(workout => isRecommendationEligible(workout)
    && workout.athleteLevels.includes(level)
    && workout.seasonPhases.includes(phase)
    && logisticsMatch(workout, {
    event: '100m',
    pathway: 'shared',
    level,
    phase,
    surfaces,
    profile,
    season,
  }));
}

function buildGeneralSpeedWeek(
  profile: AthleteProfile,
  workouts: LibraryWorkout[],
  days: WeekdayIndex[],
  season: ReturnType<typeof deriveSeasonPhase>,
): WeeklyPlanSuggestion {
  // MVP: workout-phase eligibility always uses MVP_GENERATION_PHASE, never the athlete's derived
  // `season.phase` (see the constant's doc comment) — so a missing calendar, or a real phase like
  // taper/pre-competition/transition, can never block generation. `season` is still threaded
  // through for meet-proximity safety narrowing and the summary/warning copy below.
  const phase = MVP_GENERATION_PHASE;
  const sport = profile.primarySport ?? profile.sport ?? 'general-athletic-performance';
  const football = sport === 'football';
  const level = profileLevel(profile.experienceLevel);
  const tierSelection = adjustedGeneralSpeedTier(profile, phase, level);
  const surfaces = availableSurfaces(profile);
  const limitedLinearSpace = false;
  // inSeason periodization is one of the disabled phase-dependent behaviors for this MVP (it
  // would need GEN-MICRO-01-style 'competition'-only records, which are unreachable now that
  // eligibility is pinned to MVP_GENERATION_PHASE) — always false until phase periodization returns.
  const roles = generalSpeedRoles(days.length, football, false, level, tierSelection.tier, limitedLinearSpace);
  const suggestions: SuggestedPlanDay[] = [];
  const failures: string[] = [];
  const used = new Set<string>();
  let strengthPairingsSoFar = 0;

  roles.forEach((role, index) => {
    const dayIndex = days[index];
    let primary = firstEligibleById(
      workouts,
      role.preferredIds.filter(id => !used.has(id)),
      profile,
      season,
      tierSelection.selectionLevel,
    );
    if (!primary) {
      const safeFallbacks = phase === 'competition'
        ? ['GEN-MICRO-01', 'GEN-LOW-01', 'CORE-01']
        : [
            `${football ? 'F40' : 'GEN'}-ACC-${tierSuffix[tierSelection.tier]}`,
            `${football ? 'F40' : 'GEN'}-MAX-${tierSuffix[tierSelection.tier]}`,
            'GEN-LOW-01',
            'STR-03',
            'CORE-02',
          ];
      primary = firstEligibleById(
        workouts,
        safeFallbacks.filter(id => !used.has(id)),
        profile,
        season,
        tierSelection.selectionLevel,
      );
    }
    if (!primary) {
      failures.push(`${weekdayLabels[dayIndex].full}: no Approved session matches this weekly role and training phase.`);
      return;
    }

    let strength: LibraryWorkout | undefined;
    if (role.pairStrength) {
      const strengthIds = strengthPreferenceOrder(level, strengthPairingsSoFar);
      strengthPairingsSoFar += 1;
      strength = firstEligibleById(workouts, strengthIds.filter(id => id !== primary?.id && !used.has(id)), profile, season);
    }
    const plannedWorkout = pairPlannedWorkouts(primary, strength);
    const alternatives = role.preferredIds
      .map(id => workouts.find(workout => workout.id === id))
      .filter((workout): workout is LibraryWorkout => Boolean(
        workout
        && workout.id !== primary?.id
        && isRecommendationEligible(workout)
        && workout.athleteLevels.includes(tierSelection.selectionLevel)
        && workout.seasonPhases.includes(phase),
      ))
      .slice(0, 2)
      .map(workout => ({ workoutId: workout.id, name: workout.name }));
    suggestions.push({
      dayIndex,
      weeklyRole: role.label,
      loadClass: role.loadClass,
      targetCategory: role.category,
      workoutId: primary.id,
      supportWorkoutIds: strength ? [strength.id] : [],
      plannedWorkout,
      whyThisFits: [
        role.rationale,
        `${primary.name} is an authored, Approved library session.`,
        football
          ? 'The researched 40-yard pathway separates early acceleration from upright-speed exposure.'
          : 'This general linear-speed foundation develops acceleration, upright speed, and repeatable sprint quality.',
        strength
          ? `${strength.name} is paired on the same output day so strength does not create another hard sprint day.`
          : 'No separate strength pairing was added to this role.',
        ...(tierSelection.reason ? [tierSelection.reason] : []),
      ],
      harderOptionsExcluded: [
        'Change-of-direction and sport-skill prescriptions are excluded until dedicated sport pathways are reviewed.',
        role.loadClass === 'low' ? 'Maximal sprinting is intentionally excluded from this lower-output day.' : 'Volume stays secondary to high-quality sprinting and full recovery.',
      ],
      requiredSetup: [
        primary.surface.required.join(' or '),
        [...primary.equipmentRequired, ...(strength?.equipmentRequired ?? [])].join(', '),
      ].filter(Boolean).join(' · ') || 'No special setup',
      stopRule: primary.safetyNotes[0] ?? 'Stop if pain or technique changes.',
      alternatives,
    });
    used.add(primary.id);
    if (strength) used.add(strength.id);
  });

  if (failures.length || suggestions.length !== roles.length) {
    return {
      status: 'no-match',
      title: 'A complete safe week could not be matched',
      message: 'SprintLab will not fill missing days with random sessions.',
      reasons: failures,
    };
  }
  const suggestionByDay = new Map(suggestions.map(item => [item.dayIndex, item]));
  const blockedReasons = blockedWeekdayReasons(profile);
  const schedule = ([1, 2, 3, 4, 5, 6, 0] as WeekdayIndex[]).map(dayIndex => {
    const suggestion = suggestionByDay.get(dayIndex);
    return suggestion
      ? { dayIndex, shortLabel: weekdayLabels[dayIndex].short, fullLabel: weekdayLabels[dayIndex].full, kind: 'workout' as const, workout: suggestion.plannedWorkout }
      : restDay(dayIndex, blockedReasons.get(dayIndex));
  });
  const high = suggestions.filter(item => item.loadClass === 'high').length;
  const low = suggestions.filter(item => item.loadClass === 'low').length;
  return {
    status: 'ready',
    schedule,
    suggestions,
    summary: football
      ? `${suggestions.length} training days in the researched 40-yard pathway: ${high} quality speed, ${low} lower-output/support, and ${7 - suggestions.length} protected open/rest days. ${season.explanation}`
      : `${suggestions.length} general linear-speed training days: ${high} quality speed, ${low} lower-output/support, and ${7 - suggestions.length} protected open/rest days. The week develops acceleration, upright speed, and supporting qualities around the athlete’s schedule.`,
    warnings: [
      'This preview does not change the current plan until you save it.',
      'Practice, competition, and the preferred full rest day were excluded before sessions were matched.',
      ...(limitedLinearSpace ? ['A true upright-speed day was excluded because the saved training space does not provide a safe longer sprint lane.'] : []),
      'The app organizes training; it does not diagnose injuries or replace qualified coaching.',
    ],
  };
}

export function buildDeterministicWeeklyPlan(
  profile: AthleteProfile,
  workouts: LibraryWorkout[],
): WeeklyPlanSuggestion {
  if (profile.loggingOnlyMode) {
    return {
      status: 'coach-managed',
      title: 'Logging mode is ready',
      message: 'SprintLab will not create a training calendar in logging mode.',
      reasons: ['Record planned or unplanned sessions whenever you train.', 'The Library, workout execution, History, and Progress remain available.'],
    };
  }
  if (profile.trainingPlanMode === 'log-coach-plan') {
    return {
      status: 'coach-managed',
      title: 'Your coach plan stays in control',
      message: 'SprintLab will not generate or replace coach-created sessions.',
      reasons: ['You can keep editing the weekly schedule manually.', 'Workout execution, History, and Progress remain available.'],
    };
  }
  // MVP: `season` (the athlete's real derived season phase, or 'needs-calendar' if no calendar
  // has been entered yet) is still computed and threaded through for meet-proximity safety
  // narrowing and summary copy below, but it is never a hard gate on generation — see
  // MVP_GENERATION_PHASE's doc comment.
  const season = deriveSeasonPhase(profile);

  const days = selectedDays(profile);
  if (!days.length) {
    return {
      status: 'no-match',
      title: 'No open speed-training day',
      message: 'The selected rest day, practices, and competitions occupy every available day.',
      reasons: ['Change the preferred rest day, practice schedule, or available speed-training days before building a week.'],
    };
  }
  const primarySport = profile.primarySport ?? profile.sport ?? 'track-and-field';
  if (primarySport !== 'track-and-field') {
    return buildGeneralSpeedWeek(profile, workouts, days, season);
  }

  const context: CandidateContext = {
    event: profileEvent(profile),
    pathway: profilePathway(profile),
    level: profileLevel(profile.experienceLevel),
    phase: MVP_GENERATION_PHASE,
    surfaces: availableSurfaces(profile),
    profile,
    season,
  };
  const architecture = buildWeeklyArchitecture({
    event: context.event,
    phase: context.phase,
    level: profile.experienceLevel,
    sessionCount: days.length,
  });
  const usedIds = new Set<string>();
  const suggestions: SuggestedPlanDay[] = [];
  const failures: string[] = [];
  let strengthPairingsSoFar = 0;

  days.forEach((dayIndex, index) => {
    const slot = architecture[index];
    const match = rankedForSlot(workouts, slot, context, usedIds, dayIndex);
    const requested = match.category;
    const ranked = match.ranked;
    if (!ranked.length) {
      failures.push(`${weekdayLabels[dayIndex].full} (${slot.label}): no Approved record matches the event, phase, experience, and weekly role. SprintLab did not replace it with generic tempo.`);
      return;
    }
    let support: LibraryWorkout | undefined;
    if (slot.pairStrength) {
      const preferredStrengthIds = strengthPreferenceOrder(context.level, strengthPairingsSoFar);
      strengthPairingsSoFar += 1;
      const supportSlot: WeeklyArchitectureSlot = {
        id: `${slot.id}-support`,
        label: 'Paired strength',
        loadClass: 'moderate',
        targetCategory: 'strength',
        categoryAlternatives: ['core-bodyweight'],
        preferredWorkoutIds: preferredStrengthIds,
        pairStrength: false,
        rationale: 'Consolidate compatible strength on a high-output day.',
      };
      support = rankedForSlot(workouts, supportSlot, context, usedIds, dayIndex).ranked[0]?.workout;
      if (!support) {
        failures.push(`${weekdayLabels[dayIndex].full} (${slot.label}): no Approved strength pairing matches this experience level and phase.`);
        return;
      }
    }
    const detail = suggestionDetails(dayIndex, slot, requested, ranked, context, support);
    suggestions.push(detail);
    usedIds.add(ranked[0].workout.id);
    support && usedIds.add(support.id);
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
  const blockedReasons = blockedWeekdayReasons(profile);
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
      : restDay(dayIndex, blockedReasons.get(dayIndex));
  });

  return {
    status: 'ready',
    schedule,
    suggestions,
    summary: `${suggestions.length} structured training days for a ${context.event} athlete in ${context.phase.replaceAll('-', ' ')}: ${suggestions.filter(item => item.loadClass === 'high').length} high-output, ${suggestions.filter(item => item.loadClass === 'low').length} lower-output, and ${7 - suggestions.length} protected open/rest days. ${season.explanation}`,
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
    supportWorkoutIds: [],
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

function scheduleFromSuggestions(suggestions: SuggestedPlanDay[]) {
  const suggestionByDay = new Map(suggestions.map(item => [item.dayIndex, item]));
  return ([1, 2, 3, 4, 5, 6, 0] as WeekdayIndex[]).map(dayIndex => {
    const suggestion = suggestionByDay.get(dayIndex);
    return suggestion
      ? {
          dayIndex,
          shortLabel: weekdayLabels[dayIndex].short,
          fullLabel: weekdayLabels[dayIndex].full,
          kind: 'workout' as const,
          workout: suggestion.plannedWorkout,
        }
      : restDay(dayIndex);
  });
}

export function updateSuggestedWorkout(
  plan: Extract<WeeklyPlanSuggestion, { status: 'ready' }>,
  dayIndex: WeekdayIndex,
  plannedWorkout: PlannedWorkout,
) {
  const suggestions = plan.suggestions.map(item => item.dayIndex === dayIndex ? { ...item, plannedWorkout } : item);
  return { ...plan, suggestions, schedule: scheduleFromSuggestions(suggestions) };
}

export function removeSuggestedWorkout(
  plan: Extract<WeeklyPlanSuggestion, { status: 'ready' }>,
  dayIndex: WeekdayIndex,
) {
  const suggestions = plan.suggestions.filter(item => item.dayIndex !== dayIndex);
  return {
    ...plan,
    suggestions,
    schedule: scheduleFromSuggestions(suggestions),
    summary: `${suggestions.length} reviewed session${suggestions.length === 1 ? '' : 's'} remain after your changes.`,
  };
}

export function moveSuggestedWorkout(
  plan: Extract<WeeklyPlanSuggestion, { status: 'ready' }>,
  fromDay: WeekdayIndex,
  toDay: WeekdayIndex,
) {
  if (fromDay === toDay) return plan;
  const source = plan.suggestions.find(item => item.dayIndex === fromDay);
  if (!source) return plan;
  const target = plan.suggestions.find(item => item.dayIndex === toDay);
  const suggestions = plan.suggestions.map(item => {
    if (item.dayIndex === fromDay) {
      return {
        ...item,
        dayIndex: toDay,
        whyThisFits: [...item.whyThisFits, `Moved to ${weekdayLabels[toDay].full} during review`],
      };
    }
    if (target && item.dayIndex === toDay) {
      return {
        ...item,
        dayIndex: fromDay,
        whyThisFits: [...item.whyThisFits, `Swapped to ${weekdayLabels[fromDay].full} during review`],
      };
    }
    return item;
  });
  return { ...plan, suggestions, schedule: scheduleFromSuggestions(suggestions) };
}
