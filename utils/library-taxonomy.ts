import type { LibraryWorkoutCategory } from '@/types';

/**
 * Library V2's browse-by-intent taxonomy: groups the 24 granular `LibraryWorkoutCategory`
 * values (already the Library's real filter/tag axis — see types/workout-library.ts) into the
 * handful of training-intent buckets an athlete actually thinks in ("I need an acceleration
 * workout"), without inventing a new category system underneath. Every `LibraryWorkoutCategory`
 * belongs to exactly one discipline here — this is a presentation grouping, not a new data model.
 */
export type LibraryDisciplineId =
  | 'acceleration'
  | 'starts-technique'
  | 'max-velocity'
  | 'speed-endurance'
  | 'special-endurance'
  | 'tempo-recovery'
  | 'strength'
  | 'plyometrics'
  | 'mobility-durability'
  | 'agility-cod'
  | 'testing-competition';

export type LibraryDiscipline = {
  id: LibraryDisciplineId;
  label: string;
  description: string;
  icon: string; // MaterialIcons glyph name, kept as a plain string to avoid importing the icon font types here
  categories: LibraryWorkoutCategory[];
};

export const LIBRARY_DISCIPLINES: LibraryDiscipline[] = [
  { id: 'acceleration', label: 'Acceleration', description: 'Drive phase, blocks-adjacent, resisted and general acceleration work.', icon: 'directions-run', categories: ['acceleration', 'resisted-sprinting', 'multidirectional-acceleration'] },
  { id: 'starts-technique', label: 'Starts & Technique', description: 'Block starts, reaction, and technical sprint drills.', icon: 'rocket-launch', categories: ['starts', 'assisted-sprint-exposure'] },
  { id: 'max-velocity', label: 'Max Velocity', description: 'Flys, wickets, and upright top-speed mechanics.', icon: 'bolt', categories: ['maximum-velocity'] },
  { id: 'speed-endurance', label: 'Speed Endurance', description: 'Roughly 80-150m repeated-effort work.', icon: 'stadium', categories: ['speed-endurance', 'repeated-sprint-ability'] },
  { id: 'special-endurance', label: 'Special Endurance', description: 'Longer sprint-specific work for 200m/400m.', icon: 'timeline', categories: ['special-endurance'] },
  { id: 'tempo-recovery', label: 'Tempo & Recovery', description: 'Extensive tempo, recovery, and low-intensity technical days.', icon: 'self-improvement', categories: ['tempo-recovery', 'sport-practice-recovery'] },
  { id: 'strength', label: 'Strength', description: 'Lower, upper, total-body, and explosive strength.', icon: 'fitness-center', categories: ['strength', 'explosive-power'] },
  { id: 'plyometrics', label: 'Plyometrics', description: 'Horizontal, vertical, and reactive jump work.', icon: 'sports-gymnastics', categories: ['plyometrics'] },
  { id: 'mobility-durability', label: 'Mobility & Durability', description: 'Core, trunk, and general durability work.', icon: 'accessibility-new', categories: ['core-bodyweight'] },
  { id: 'agility-cod', label: 'Agility & COD', description: 'Change of direction, deceleration, and reactive agility.', icon: 'sync-alt', categories: ['change-of-direction', 'reactive-agility', 'deceleration', 'court-speed', 'field-conditioning'] },
  { id: 'testing-competition', label: 'Testing & Competition', description: 'Testing, combine, and meet/game-day preparation.', icon: 'emoji-events', categories: ['testing', 'combine-preparation', 'meet-preparation', 'game-day-preparation'] },
];

const CATEGORY_TO_DISCIPLINE = new Map<LibraryWorkoutCategory, LibraryDisciplineId>(
  LIBRARY_DISCIPLINES.flatMap(discipline => discipline.categories.map(category => [category, discipline.id] as const)),
);

export function disciplineForCategory(category: LibraryWorkoutCategory): LibraryDiscipline {
  const id = CATEGORY_TO_DISCIPLINE.get(category);
  return LIBRARY_DISCIPLINES.find(discipline => discipline.id === id) ?? LIBRARY_DISCIPLINES[0];
}

export function disciplineById(id: LibraryDisciplineId): LibraryDiscipline {
  return LIBRARY_DISCIPLINES.find(discipline => discipline.id === id) ?? LIBRARY_DISCIPLINES[0];
}

/** Human-readable label for every LibraryWorkoutCategory — the single source both the browse UI
 * and detail screens should read from, rather than each screen keeping its own copy. */
export const libraryCategoryLabels: Record<LibraryWorkoutCategory, string> = {
  acceleration: 'Acceleration',
  'maximum-velocity': 'Maximum velocity',
  starts: 'Starts',
  'speed-endurance': 'Speed endurance',
  'special-endurance': 'Special endurance',
  'tempo-recovery': 'Tempo / recovery',
  strength: 'Strength',
  plyometrics: 'Plyometrics',
  'core-bodyweight': 'Core / bodyweight',
  testing: 'Testing',
  'meet-preparation': 'Meet prep',
  'multidirectional-acceleration': 'Multidirectional acceleration',
  deceleration: 'Deceleration',
  'change-of-direction': 'Change of direction',
  'reactive-agility': 'Reactive agility',
  'repeated-sprint-ability': 'Repeated sprint ability',
  'resisted-sprinting': 'Resisted sprinting',
  'assisted-sprint-exposure': 'Assisted sprint exposure',
  'combine-preparation': 'Combine preparation',
  'field-conditioning': 'Field conditioning',
  'court-speed': 'Court speed',
  'explosive-power': 'Explosive power',
  'sport-practice-recovery': 'Practice recovery',
  'game-day-preparation': 'Game-day preparation',
};
