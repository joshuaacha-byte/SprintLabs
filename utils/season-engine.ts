import type {
  AthleteProfile,
  LibrarySeasonPhase,
  LibraryWorkout,
  PriorityMeet,
  SeasonCalendar,
} from '@/types';

export type DerivedSeasonPhase = LibrarySeasonPhase | 'needs-calendar';

export type SeasonPhaseResult = {
  phase: DerivedSeasonPhase;
  explanation: string;
  nextMeet: PriorityMeet | null;
  daysToNextMeet: number | null;
  daysToNextAMeet: number | null;
};

const parseDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const localDateKey = (date = new Date()) => date.toLocaleDateString('en-CA');

export function daysBetween(from: string, to?: string | null) {
  const first = parseDate(from);
  const second = parseDate(to);
  if (!first || !second) return null;
  return Math.ceil((second.getTime() - first.getTime()) / 86_400_000);
}

function isBetween(date: string, start?: string | null, end?: string | null) {
  const current = parseDate(date);
  const first = parseDate(start);
  const last = parseDate(end);
  if (!current || !first || !last) return false;
  return current >= first && current <= last;
}

function futureMeets(calendar: SeasonCalendar, today: string) {
  return calendar.priorityMeets
    .filter(meet => (daysBetween(today, meet.date) ?? -1) >= 0)
    .sort((first, second) => first.date.localeCompare(second.date));
}

function activeOverride(profile: AthleteProfile, today: string): LibrarySeasonPhase | null {
  const override = profile.seasonPhaseOverride;
  if (!override?.reason.trim()) return null;
  if (override.expiresOn && (daysBetween(today, override.expiresOn) ?? -1) < 0) return null;
  if (override.phase === 'offseason') return 'general-preparation';
  if (override.phase === 'championship') return 'taper';
  if (override.phase === 'transition') return 'transition';
  return override.phase;
}

export function seasonCalendarFromProfile(profile: AthleteProfile): SeasonCalendar {
  if (profile.seasonCalendar) {
    return {
      ...profile.seasonCalendar,
      priorityMeets: profile.seasonCalendar.priorityMeets ?? [],
    };
  }
  const priorityMeets: PriorityMeet[] = profile.nextMeetDate
    ? [{
        id: `legacy-next-meet:${profile.nextMeetDate}`,
        name: 'Next meet',
        date: profile.nextMeetDate,
        priority: 'B',
        events: [profile.primaryEvent],
        estimated: true,
      }]
    : [];
  return {
    competitionStatus:
      profile.trainingContext === 'in-season' || profile.seasonPhase === 'competition'
        ? 'in-season'
        : profile.trainingContext === 'preseason'
          ? 'preseason'
          : profile.trainingContext === 'postseason' || profile.seasonPhase === 'transition'
            ? 'postseason'
            : profile.trainingContext === 'offseason' || profile.seasonPhase === 'offseason'
              ? 'out-of-season'
              : 'unknown',
    firstMeetDate: profile.nextMeetDate,
    championshipDate: profile.championshipDate,
    priorityMeets,
  };
}

export function deriveSeasonPhase(profile: AthleteProfile, today = localDateKey()): SeasonPhaseResult {
  const override = activeOverride(profile, today);
  const calendar = seasonCalendarFromProfile(profile);
  const meets = futureMeets(calendar, today);
  const nextMeet = meets[0] ?? (
    calendar.firstMeetDate
      ? {
          id: `first-meet:${calendar.firstMeetDate}`,
          name: 'First meet',
          date: calendar.firstMeetDate,
          priority: 'B' as const,
          events: [profile.primaryEvent],
          estimated: true,
        }
      : null
  );
  const nextAMeet = meets.find(meet => meet.priority === 'A');
  const nextA = nextAMeet?.date ?? calendar.championshipDate;
  const daysToNextMeet = nextMeet ? daysBetween(today, nextMeet.date) : null;
  const daysToNextAMeet = daysBetween(today, nextA);

  if (override) {
    return {
      phase: override,
      explanation: `Coach/editor phase override: ${profile.seasonPhaseOverride?.reason}`,
      nextMeet,
      daysToNextMeet,
      daysToNextAMeet,
    };
  }

  const hasCalendar =
    calendar.competitionStatus !== 'unknown'
    || Boolean(calendar.seasonStartDate)
    || Boolean(calendar.firstMeetDate)
    || calendar.priorityMeets.length > 0;
  if (!hasCalendar) {
    return {
      phase: 'needs-calendar',
      explanation: 'Add a first meet or season status so SprintLab does not guess your training phase.',
      nextMeet: null,
      daysToNextMeet: null,
      daysToNextAMeet: null,
    };
  }

  const daysAfterSeason = calendar.seasonEndDate
    ? -(daysBetween(today, calendar.seasonEndDate) ?? 0)
    : null;
  if (daysAfterSeason !== null && daysAfterSeason >= 0 && daysAfterSeason <= 21) {
    return {
      phase: 'transition',
      explanation: 'Transition: the saved season ended within the last 21 days.',
      nextMeet,
      daysToNextMeet,
      daysToNextAMeet,
    };
  }
  if (daysToNextAMeet !== null && daysToNextAMeet >= 0 && daysToNextAMeet <= 14) {
    return {
      phase: 'taper',
      explanation: `Taper: an A-priority competition is ${daysToNextAMeet} day${daysToNextAMeet === 1 ? '' : 's'} away.`,
      nextMeet,
      daysToNextMeet,
      daysToNextAMeet,
    };
  }
  if (
    calendar.competitionStatus === 'in-season'
    || isBetween(today, calendar.seasonStartDate, calendar.seasonEndDate)
  ) {
    return {
      phase: 'competition',
      explanation: 'Competition: the saved calendar places you in season.',
      nextMeet,
      daysToNextMeet,
      daysToNextAMeet,
    };
  }
  if (daysToNextMeet !== null && daysToNextMeet >= 0 && daysToNextMeet <= 56) {
    return {
      phase: 'pre-competition',
      explanation: `Pre-competition: the next meet is ${daysToNextMeet} day${daysToNextMeet === 1 ? '' : 's'} away.`,
      nextMeet,
      daysToNextMeet,
      daysToNextAMeet,
    };
  }
  if (daysToNextMeet !== null && daysToNextMeet >= 0 && daysToNextMeet <= 112) {
    return {
      phase: 'specific-preparation',
      explanation: `Specific preparation: the next meet is about ${Math.ceil(daysToNextMeet / 7)} weeks away.`,
      nextMeet,
      daysToNextMeet,
      daysToNextAMeet,
    };
  }
  return {
    phase: 'general-preparation',
    explanation: daysToNextMeet !== null
      ? `General preparation: the next meet is about ${Math.ceil(daysToNextMeet / 7)} weeks away.`
      : 'General preparation: no near-term meet is on the calendar.',
    nextMeet,
    daysToNextMeet,
    daysToNextAMeet,
  };
}

export function meetWindowAllowsWorkout(
  workout: LibraryWorkout,
  phase: SeasonPhaseResult,
  workoutDate: string,
  calendar: SeasonCalendar,
) {
  const future = futureMeets(calendar, workoutDate);
  const immediate = future.find(meet => {
    const days = daysBetween(workoutDate, meet.date);
    return days !== null && days >= 0 && days <= 3;
  });
  if (!immediate) return true;

  const days = daysBetween(workoutDate, immediate.date) ?? 99;
  if (days <= 1) {
    return workout.primaryCategory === 'meet-preparation'
      || workout.primaryCategory === 'tempo-recovery'
      || workout.primaryCategory === 'core-bodyweight';
  }
  if (immediate.priority === 'A' || phase.phase === 'taper') {
    return !workout.metrics.highCns
      || workout.primaryCategory === 'meet-preparation'
      || workout.primaryCategory === 'maximum-velocity';
  }
  return workout.primaryCategory !== 'special-endurance';
}

