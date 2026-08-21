import type {
  AthleteExperienceLevel,
  EventTag,
  LibrarySeasonPhase,
  LibraryWorkoutCategory,
} from '../types';

export type WeeklyLoadClass = 'high' | 'low' | 'moderate';

export type WeeklyArchitectureSlot = {
  id: string;
  label: string;
  loadClass: WeeklyLoadClass;
  targetCategory: LibraryWorkoutCategory;
  categoryAlternatives: LibraryWorkoutCategory[];
  preferredWorkoutIds: string[];
  pairStrength: boolean;
  rationale: string;
};

type ArchitectureInput = {
  event: EventTag;
  phase: LibrarySeasonPhase;
  level: AthleteExperienceLevel;
  sessionCount: number;
};

// Matches utils/plan-selector.ts's profilePathway(): 200m and 400m both belong to the
// 'long-sprint-200-400' pathway there (only 60m/100m are 'short-sprint-100-200'). This must stay
// consistent with that classification — a 200m athlete's preferred-workout selection here should
// use the same long-sprint branch as the eligibility filtering already gives them, not the
// short-sprint branch. (Not imported directly to avoid a circular import between the two files;
// keep the event sets in sync by hand, and see scripts/verify-plan-engine-audit-regressions.ts
// for a regression test that catches drift.)
const isLongSprintPathwayEvent = (event: EventTag) => event === '200m' || event === '400m';

function high(
  id: string,
  label: string,
  targetCategory: LibraryWorkoutCategory,
  rationale: string,
  preferredWorkoutIds: string[] = [],
  categoryAlternatives: LibraryWorkoutCategory[] = [],
  pairStrength = false,
): WeeklyArchitectureSlot {
  return {
    id,
    label,
    loadClass: 'high',
    targetCategory,
    categoryAlternatives,
    preferredWorkoutIds,
    pairStrength,
    rationale,
  };
}

function low(
  id: string,
  label: string,
  rationale: string,
  preferredWorkoutIds: string[] = [],
  categoryAlternatives: LibraryWorkoutCategory[] = ['core-bodyweight'],
): WeeklyArchitectureSlot {
  return {
    id,
    label,
    loadClass: 'low',
    targetCategory: 'tempo-recovery',
    categoryAlternatives,
    preferredWorkoutIds,
    pairStrength: false,
    rationale,
  };
}

function moderate(
  id: string,
  label: string,
  targetCategory: LibraryWorkoutCategory,
  rationale: string,
  preferredWorkoutIds: string[] = [],
  categoryAlternatives: LibraryWorkoutCategory[] = [],
): WeeklyArchitectureSlot {
  return {
    id,
    label,
    loadClass: 'moderate',
    targetCategory,
    categoryAlternatives,
    preferredWorkoutIds,
    pairStrength: false,
    rationale,
  };
}

function generalPreparation(input: ArchitectureInput) {
  const long = isLongSprintPathwayEvent(input.event);
  const base: WeeklyArchitectureSlot[] = [
    high(
      'acceleration-strength',
      'Acceleration + strength',
      'acceleration',
      'Build force and acceleration quality early in the week, then consolidate lower-body strength on the same high-output day.',
      long ? ['ACC-04', 'ACC-06', 'ACC-02'] : ['ACC-03', 'ACC-06', 'ACC-02'],
      ['starts'],
      true,
    ),
    low(
      'tempo-capacity',
      'Extensive tempo / capacity',
      'Develop low-intensity work capacity without turning a recovery day into another maximal sprint session.',
      long ? ['TEM-02', 'TEM-01'] : ['TEM-01', 'TEM-03'],
    ),
    high(
      'max-velocity-strength',
      'Maximum velocity + strength',
      'maximum-velocity',
      'Keep upright speed exposure in the week and pair a second reviewed strength session with a high-output day.',
      long ? ['MAX-05', 'MAX-04', 'MAX-02'] : ['MAX-02', 'MAX-01', 'MAX-04'],
      ['acceleration'],
      true,
    ),
    low(
      'technical-low',
      'Technical low day',
      'Restore rhythm and movement quality without repeating the week’s longer grass-tempo prescription.',
      ['TEM-03'],
    ),
    high(
      'speed-endurance',
      long ? 'Speed endurance' : 'Speed endurance / sprint quality',
      'speed-endurance',
      long
        ? 'Introduce controlled longer sprint quality while the competition runway is still long; special endurance remains out.'
        : 'Extend high-quality sprinting without using race-specific special endurance this early.',
      long ? ['SED-04', 'SED-03'] : ['SED-01', 'SED-04', 'SED-03'],
      ['maximum-velocity'],
      false,
    ),
  ];

  if (input.level === 'beginner') {
    base[4] = moderate(
      'elastic-power',
      'Elastic power foundation',
      'plyometrics',
      'A foundation athlete gets a lower-complexity power exposure instead of a third demanding sprint day.',
      ['PLY-01', 'PLY-07'],
      ['core-bodyweight', 'tempo-recovery'],
    );
  }
  return base;
}

function specificPreparation(input: ArchitectureInput) {
  const long = isLongSprintPathwayEvent(input.event);
  return [
    high(
      'acceleration-strength',
      'Acceleration + strength',
      'acceleration',
      'Preserve acceleration while the week becomes more event-specific.',
      long ? ['ACC-06', 'ACC-04'] : ['ACC-03', 'ACC-06'],
      ['starts'],
      true,
    ),
    low('tempo-capacity', 'Extensive tempo / capacity', 'Keep a low day between high-output exposures.', long ? ['TEM-02', 'TEM-01'] : ['TEM-01', 'TEM-03']),
    high(
      'max-velocity-strength',
      'Maximum velocity + strength',
      'maximum-velocity',
      'Maintain upright speed and strength before longer event-specific work.',
      long ? ['MAX-05', 'MAX-04', 'MAX-02'] : ['MAX-02', 'MAX-04', 'MAX-03'],
      ['acceleration'],
      true,
    ),
    low('technical-low', 'Technical low day', 'Use a short technical day instead of duplicating the longer tempo session.', ['TEM-03']),
    high(
      'event-specific-endurance',
      long ? 'Long-sprint endurance' : 'Speed endurance',
      long && input.level !== 'beginner' && input.level !== 'developing' ? 'special-endurance' : 'speed-endurance',
      long
        ? 'Progress toward long-sprint demands using an Approved record that matches experience and phase.'
        : 'Extend sprint quality without sacrificing full recovery.',
      long ? ['SPE-01', 'SPE-02', 'SED-05', 'SED-04'] : ['SED-02', 'SED-03', 'SED-04'],
      long ? ['speed-endurance'] : ['maximum-velocity'],
    ),
  ];
}

function preCompetition(input: ArchitectureInput) {
  const long = isLongSprintPathwayEvent(input.event);
  return [
    high('starts-strength', 'Starts / acceleration + strength', 'starts', 'Sharpen the first phase of the race and keep strength consolidated on a high day.', ['STA-02', 'STA-01', 'ACC-03'], ['acceleration'], true),
    low('tempo-capacity', 'Tempo / recovery', 'Protect recovery between race-quality sessions.', ['TEM-03', 'TEM-01']),
    high('max-velocity', 'Maximum velocity', 'maximum-velocity', 'Maintain top-speed exposure as race work becomes more specific.', long ? ['MAX-05', 'MAX-04', 'MAX-02'] : ['MAX-02', 'MAX-04', 'MAX-03'], ['acceleration'], false),
    low('technical-low', 'Technical low day', 'Keep rhythm without adding another high-output exposure.', ['TEM-03']),
    high(
      'race-specific-endurance',
      long ? 'Race-specific endurance' : 'Speed endurance',
      long && input.level !== 'beginner' && input.level !== 'developing' ? 'special-endurance' : 'speed-endurance',
      'Use only reviewed event-specific work that fits the athlete’s level and meet window.',
      long ? ['SPE-04', 'SPE-01', 'SPE-02', 'SPE-03', 'SED-05'] : ['SED-03', 'SED-02'],
      ['speed-endurance'],
    ),
  ];
}

function competition(input: ArchitectureInput) {
  return [
    high('quality-acceleration', 'Short acceleration quality', 'acceleration', 'Keep acceleration sharp without chasing general-preparation volume.', ['ACC-03', 'ACC-02'], ['starts'], false),
    low('recovery', 'Recovery / technical tempo', 'Absorb competition and practice demands.', ['TEM-03', 'TEM-04']),
    high('speed-microdose', 'Maximum-velocity microdose', 'maximum-velocity', 'Maintain speed with a smaller competition-phase dose.', ['MAX-06', 'MAX-02'], ['meet-preparation']),
    low('technical-low', 'Technical low day', 'Preserve rhythm and freshness between demanding days.', ['TEM-03']),
    moderate('meet-primer', 'Competition preparation', 'meet-preparation', 'Use a reviewed primer when the calendar window allows it.', [], ['tempo-recovery', 'maximum-velocity']),
  ];
}

function taper() {
  return [
    moderate('start-primer', 'Short start primer', 'meet-preparation', 'Keep a small familiar exposure without creating fatigue.', [], ['starts', 'acceleration']),
    low('recovery', 'Recovery / mobility', 'Prioritize freshness near the A-priority competition.', ['TEM-03', 'TEM-04']),
    moderate('speed-microdose', 'Speed microdose', 'maximum-velocity', 'Maintain coordination and speed with reduced volume.', ['MAX-06'], ['meet-preparation']),
    low('technical-low', 'Technical rehearsal', 'Use only brief, familiar movement before competition.', ['TEM-03']),
    moderate('meet-primer-two', 'Meet preparation', 'meet-preparation', 'No novel or high-volume work is added during taper.', [], ['tempo-recovery']),
  ];
}

function transition() {
  return [
    low('recovery', 'Recovery movement', 'Use low-cost movement while transitioning out of the season.', ['TEM-04', 'TEM-03']),
    moderate('general-strength', 'General strength', 'strength', 'Rebuild general strength without race-specific loading.', ['STR-03', 'STR-01'], ['core-bodyweight']),
    low('technical-low', 'Technical low day', 'Keep movement familiar and low pressure.', ['TEM-03']),
    moderate('elastic-foundation', 'Elastic foundation', 'plyometrics', 'Use lower-complexity elastic work if the athlete feels recovered.', ['PLY-01', 'PLY-07'], ['core-bodyweight']),
    low('recovery-two', 'Recovery / mobility', 'Leave room for physical and mental recovery.', ['TEM-04', 'TEM-03']),
  ];
}

function spreadSlots(slots: WeeklyArchitectureSlot[], count: number) {
  const safeCount = Math.max(1, Math.min(5, count));
  const picks: Record<number, number[]> = {
    1: [0],
    2: [0, 2],
    3: [0, 1, 2],
    4: [0, 1, 2, 3],
    5: [0, 1, 2, 3, 4],
  };
  return picks[safeCount].map(index => slots[index]);
}

export function buildWeeklyArchitecture(input: ArchitectureInput): WeeklyArchitectureSlot[] {
  const phaseSlots =
    input.phase === 'general-preparation' ? generalPreparation(input)
      : input.phase === 'specific-preparation' ? specificPreparation(input)
        : input.phase === 'pre-competition' ? preCompetition(input)
          : input.phase === 'competition' ? competition(input)
            : input.phase === 'taper' ? taper()
              : transition();
  return spreadSlots(phaseSlots, input.sessionCount);
}
