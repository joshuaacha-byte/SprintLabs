import type {
  AthleteProfile,
  CompletedWorkoutSession,
  LibraryWorkout,
  LibraryWorkoutCategory,
  ScheduledDay,
} from '@/types';
import { isRecommendationEligible } from '@/utils/workout-library';

/**
 * SprintLab Library V2's shared retrieval/substitution layer. This is the one place that decides
 * "which Library workouts are relevant right now" — the category browse screen, the "Find
 * substitute" flow, Coach/Gemini's candidate list, and any future caller all read from here
 * instead of each re-deriving their own notion of relevance. Everything here is deterministic and
 * storage-free (plain arrays in, plain arrays out) so it is trivially usable both on-device and
 * from the stateless /api/coach route once the caller has already fetched the data.
 */

const averageDuration = (workout: LibraryWorkout) => (workout.metrics.estimatedDurationMinutes[0] + workout.metrics.estimatedDurationMinutes[1]) / 2;
const METABOLIC_RANK: Record<LibraryWorkout['metrics']['metabolicDemand'], number> = { low: 0, moderate: 1, high: 2, 'very-high': 3 };
const norm = (value: string) => value.trim().toLowerCase();

function eligiblePool(workouts: LibraryWorkout[], excludeId?: string) {
  return workouts.filter(workout => workout.id !== excludeId && isRecommendationEligible(workout));
}

// ─── Substitution ───────────────────────────────────────────────────────────

export type SubstituteIntent = 'best-match' | 'shorter' | 'no-track' | 'lower-load' | 'different-equipment' | 'indoor';

export const SUBSTITUTE_INTENTS: { id: SubstituteIntent; label: string; description: string }[] = [
  { id: 'best-match', label: 'Best match', description: 'Closest overall match to the original session.' },
  { id: 'shorter', label: 'Shorter', description: 'Meaningfully less time than the original.' },
  { id: 'no-track', label: 'No track', description: 'Does not require a track surface.' },
  { id: 'lower-load', label: 'Lower load', description: 'Lighter metabolic/CNS demand.' },
  { id: 'different-equipment', label: 'Different equipment', description: 'Avoids the original session’s required equipment.' },
  { id: 'indoor', label: 'Indoor', description: 'Usable indoors — gym, home, or indoor track.' },
];

function matchesIntent(original: LibraryWorkout, candidate: LibraryWorkout, intent: SubstituteIntent): boolean {
  if (intent === 'shorter') return averageDuration(candidate) < averageDuration(original) - 5;
  if (intent === 'no-track') return !candidate.surface.required.includes('track') && !candidate.surface.required.includes('track-curve');
  if (intent === 'lower-load') {
    return METABOLIC_RANK[candidate.metrics.metabolicDemand] < METABOLIC_RANK[original.metrics.metabolicDemand]
      || (original.metrics.highCns && !candidate.metrics.highCns);
  }
  if (intent === 'different-equipment') {
    const originalEquipment = new Set(original.equipmentRequired.map(norm));
    return candidate.equipmentRequired.every(item => !originalEquipment.has(norm(item)));
  }
  if (intent === 'indoor') return [...candidate.surface.required, ...candidate.surface.preferred].some(surface => surface === 'gym' || surface === 'home' || surface === 'indoor');
  return true; // best-match: no hard filter, scoring alone ranks it
}

export type SubstituteCandidate = { workout: LibraryWorkout; score: number; reasons: string[] };

/** Scores + ranks how well `candidate` preserves the training purpose of `original` — the same
 * function powering both the manual "Find substitute" UI and Coach's replace_workout proposals,
 * so a workout being tagged the same primary category never alone makes it interchangeable. */
export function getSubstituteCandidates(
  original: LibraryWorkout,
  pool: LibraryWorkout[],
  intent: SubstituteIntent = 'best-match',
  limit = 6,
): SubstituteCandidate[] {
  const filtered = eligiblePool(pool, original.id).filter(candidate => matchesIntent(original, candidate, intent));

  const scored = filtered.map(candidate => {
    const reasons: string[] = [];
    let score = 0;

    if (candidate.primaryCategory === original.primaryCategory) { score += 40; reasons.push(`Same primary stimulus (${candidate.primaryCategory.replaceAll('-', ' ')})`); }
    else if (candidate.secondaryCategories.includes(original.primaryCategory) || original.secondaryCategories.includes(candidate.primaryCategory)) { score += 20; reasons.push('Related training stimulus'); }

    const sharedEvents = candidate.eventTags.filter(event => original.eventTags.includes(event));
    if (sharedEvents.length) { score += 15 * (sharedEvents.length / Math.max(original.eventTags.length, 1)); reasons.push(`Suits ${sharedEvents.join('/')}`); }

    if (candidate.eventPathways.some(pathway => original.eventPathways.includes(pathway))) score += 8;

    const durationDiff = Math.abs(averageDuration(candidate) - averageDuration(original));
    score += Math.max(0, 10 - durationDiff / 6);
    if (durationDiff <= 10) reasons.push('Similar duration');

    const volumeDiff = Math.abs(candidate.metrics.totalSprintVolumeMeters - original.metrics.totalSprintVolumeMeters);
    score += Math.max(0, 10 - volumeDiff / 100);

    const metabolicDiff = Math.abs(METABOLIC_RANK[candidate.metrics.metabolicDemand] - METABOLIC_RANK[original.metrics.metabolicDemand]);
    score += Math.max(0, 10 - metabolicDiff * 4);
    if (metabolicDiff === 0) reasons.push('Same load profile');

    if (candidate.athleteLevels.some(level => original.athleteLevels.includes(level))) score += 5;

    if (original.progressionWorkoutId === candidate.id || original.regressionWorkoutId === candidate.id) { score += 15; reasons.push('Direct progression/regression of this session'); }

    return { workout: candidate, score: Math.round(score), reasons: reasons.slice(0, 2) };
  });

  return scored.sort((first, second) => second.score - first.score).slice(0, limit);
}

// ─── Discovery ──────────────────────────────────────────────────────────────

/** Approved sessions matching the athlete's event, sport, and experience — the same "compatible
 * with this athlete" signal used for a "Recommended for you" row, kept intentionally simple. */
export function recommendedForProfile(workouts: LibraryWorkout[], profile: AthleteProfile | null, limit = 6): LibraryWorkout[] {
  if (!profile) return [];
  const sport = profile.primarySport ?? profile.sport ?? 'track-and-field';
  const level = profile.experienceLevel;
  const goals = new Set(profile.speedGoals ?? []);

  const scored = eligiblePool(workouts).map(workout => {
    let score = 0;
    if ((workout.sports ?? ['track-and-field']).includes(sport)) score += 10;
    if ((workout.athleteLevels as string[]).includes(level)) score += 6;
    if ((workout.speedGoals ?? []).some(goal => goals.has(goal))) score += 8;
    if (sport === 'track-and-field' && profile.primaryEvent && (workout.eventTags as string[]).includes(profile.primaryEvent)) score += 10;
    return { workout, score };
  });
  return scored.filter(item => item.score > 0).sort((first, second) => second.score - first.score).slice(0, limit).map(item => item.workout);
}

/** Approved sessions sharing a primary category with what's actually in this week's schedule —
 * only counting scheduled workouts whose id still resolves to a real Library record. */
export function relevantToWeek(workouts: LibraryWorkout[], schedule: ScheduledDay[], limit = 6): LibraryWorkout[] {
  const scheduledIds = new Set(schedule.flatMap(day => day.workout ? [day.workout.id] : []));
  const scheduledLibraryWorkouts = workouts.filter(workout => scheduledIds.has(workout.id));
  if (!scheduledLibraryWorkouts.length) return [];
  const categories = new Set(scheduledLibraryWorkouts.map(workout => workout.primaryCategory));
  return eligiblePool(workouts)
    .filter(workout => categories.has(workout.primaryCategory) && !scheduledIds.has(workout.id))
    .slice(0, limit);
}

/** The most recently completed Library-sourced sessions, most recent first, deduped by workout. */
export function recentlyUsed(workouts: LibraryWorkout[], sessions: CompletedWorkoutSession[], limit = 6): LibraryWorkout[] {
  const byId = new Map(workouts.map(workout => [workout.id, workout] as const));
  const ordered = [...sessions]
    .filter(session => session.review.completed)
    .sort((first, second) => (second.finishedAt ?? '').localeCompare(first.finishedAt ?? ''));
  const seen = new Set<string>();
  const result: LibraryWorkout[] = [];
  for (const session of ordered) {
    const workout = byId.get(session.plannedWorkoutSnapshot.id);
    if (!workout || seen.has(workout.id) || !isRecommendationEligible(workout)) continue;
    seen.add(workout.id);
    result.push(workout);
    if (result.length >= limit) break;
  }
  return result;
}

// ─── Category grouping (browse-by-intent) ──────────────────────────────────

export function groupByPrimaryCategory(workouts: LibraryWorkout[]): Map<LibraryWorkoutCategory, LibraryWorkout[]> {
  const groups = new Map<LibraryWorkoutCategory, LibraryWorkout[]>();
  for (const workout of workouts) {
    const list = groups.get(workout.primaryCategory) ?? [];
    list.push(workout);
    groups.set(workout.primaryCategory, list);
  }
  return groups;
}

// ─── AI-facing candidate summaries ──────────────────────────────────────────

/** Compact shape handed to Gemini — id, category, and enough metadata to reason about fit,
 * deliberately excluding full sections/exercises so a candidate list stays small in the prompt. */
export type LibraryCandidateSummary = {
  id: string;
  name: string;
  category: LibraryWorkoutCategory;
  durationMinutes: [number, number];
  equipment: string[];
  surface: string[];
  intensitySummary: string;
  purpose: string;
};

export function toCandidateSummary(workout: LibraryWorkout): LibraryCandidateSummary {
  return {
    id: workout.id,
    name: workout.name,
    category: workout.primaryCategory,
    durationMinutes: workout.metrics.estimatedDurationMinutes,
    equipment: workout.equipmentRequired,
    surface: workout.surface.required,
    intensitySummary: workout.intensitySummary,
    purpose: workout.purpose,
  };
}

/** The compact candidate set Coach/Gemini should reason over for a given day: today's scheduled
 * workout's own substitutes (if any) plus a few profile-relevant sessions — never the full
 * library. Deduplicated and capped so the prompt stays small regardless of caller. */
export function buildCoachLibraryCandidates(input: {
  workouts: LibraryWorkout[];
  profile: AthleteProfile | null;
  schedule: ScheduledDay[];
  todayWorkoutId?: string;
  limit?: number;
}): LibraryCandidateSummary[] {
  const limit = input.limit ?? 8;
  const seen = new Set<string>();
  const ordered: LibraryWorkout[] = [];

  const todayWorkout = input.todayWorkoutId ? input.workouts.find(workout => workout.id === input.todayWorkoutId) : undefined;
  if (todayWorkout) {
    for (const candidate of getSubstituteCandidates(todayWorkout, input.workouts, 'best-match', 4)) {
      if (!seen.has(candidate.workout.id)) { seen.add(candidate.workout.id); ordered.push(candidate.workout); }
    }
  }
  for (const workout of relevantToWeek(input.workouts, input.schedule, 4)) {
    if (!seen.has(workout.id)) { seen.add(workout.id); ordered.push(workout); }
  }
  for (const workout of recommendedForProfile(input.workouts, input.profile, 4)) {
    if (!seen.has(workout.id)) { seen.add(workout.id); ordered.push(workout); }
  }

  return ordered.slice(0, limit).map(toCandidateSummary);
}
