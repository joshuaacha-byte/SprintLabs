import { buildWeeklyArchitecture } from '../utils/weekly-architecture.ts';
import { starterWorkoutLibrary } from '../data/workout-library.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function signature(
  event: '100m' | '200m' | '400m',
  phase: 'general-preparation' | 'specific-preparation' | 'pre-competition' | 'competition' | 'taper' | 'transition',
  level: 'beginner' | 'developing' | 'intermediate' | 'advanced',
  sessionCount: number,
) {
  return buildWeeklyArchitecture({ event, phase, level, sessionCount });
}

const longGeneral = signature('400m', 'general-preparation', 'intermediate', 5);
assert(longGeneral.map(slot => slot.loadClass).join(',') === 'high,low,high,low,high', '400 m general preparation must use a high/low/high/low/high structure.');
assert(longGeneral.filter(slot => slot.pairStrength).length === 2, 'A trained five-day general-preparation week must pair two strength sessions.');
assert(longGeneral.some(slot => slot.targetCategory === 'maximum-velocity'), '400 m general preparation must preserve maximum-velocity exposure.');
assert(longGeneral.some(slot => slot.targetCategory === 'speed-endurance'), '400 m general preparation must include controlled speed endurance.');
assert(longGeneral.every(slot => slot.targetCategory !== 'special-endurance'), 'General preparation must not prescribe special endurance.');
assert(new Set(longGeneral.map(slot => slot.id)).size === longGeneral.length, 'Weekly roles must not be duplicated.');

const shortGeneral = signature('100m', 'general-preparation', 'intermediate', 4);
assert(shortGeneral.map(slot => slot.loadClass).join(',') === 'high,low,high,low', 'Four-day 100 m general preparation must alternate high and low output.');
assert(shortGeneral[0].targetCategory === 'acceleration', 'Short-sprint general preparation must begin with acceleration.');
assert(shortGeneral[2].targetCategory === 'maximum-velocity', 'Short-sprint general preparation must include upright speed.');

const foundationGeneral = signature('200m', 'general-preparation', 'beginner', 5);
assert(foundationGeneral.filter(slot => slot.loadClass === 'high').length === 2, 'Foundation athletes must not receive three demanding sprint days.');
assert(foundationGeneral[4].targetCategory === 'plyometrics', 'The fifth foundation session must become lower-complexity elastic work.');

const longSpecific = signature('400m', 'specific-preparation', 'intermediate', 5);
assert(longSpecific.some(slot => slot.targetCategory === 'special-endurance'), 'A trained 400 m athlete may progress to reviewed special endurance in specific preparation.');

const competition = signature('200m', 'competition', 'intermediate', 4);
assert(competition.filter(slot => slot.pairStrength).length === 0, 'Competition weeks must not automatically attach full strength sessions.');
assert(competition.some(slot => slot.preferredWorkoutIds.includes('MAX-06')), 'Competition weeks must prefer the reviewed maximum-velocity microdose.');

const taper = signature('400m', 'taper', 'advanced', 5);
assert(taper.every(slot => slot.loadClass !== 'high'), 'Taper architecture must not introduce full high-output roles.');
assert(taper.some(slot => slot.targetCategory === 'meet-preparation'), 'Taper architecture must use reviewed meet-preparation roles.');

const transition = signature('100m', 'transition', 'developing', 5);
assert(transition.every(slot => slot.loadClass !== 'high'), 'Transition must remain low or moderate output.');

const libraryById = new Map(starterWorkoutLibrary.map(workout => [workout.id, workout]));
const maxDevelopment = libraryById.get('MAX-02');
assert(maxDevelopment?.seasonPhases.includes('general-preparation'), 'The reviewed fly-20 exposure must be eligible in general preparation.');
assert(maxDevelopment?.athleteLevels.includes('advanced'), 'Advanced athletes must retain a reviewed general-preparation maximum-velocity option.');

const longGeneralSpeedEndurance = libraryById.get('SED-04');
assert(longGeneralSpeedEndurance?.seasonPhases.includes('general-preparation'), 'The controlled 120 m session must be eligible for trained long sprinters in general preparation.');
assert(longGeneralSpeedEndurance?.intensitySummary.includes('92-95%'), 'General-preparation speed endurance must expose its controlled intensity range.');

const noGymStrength = libraryById.get('STR-03');
assert(noGymStrength?.athleteLevels.includes('advanced'), 'Advanced athletes without a gym still need an Approved no-gym strength option.');
assert((noGymStrength?.sections.strength.items.length ?? 0) >= 5, 'No-gym support must contain programmed exercises, not a placeholder.');

const forceStrength = libraryById.get('STR-01');
const explosiveStrength = libraryById.get('STR-02');
for (const workout of [forceStrength, explosiveStrength]) {
  assert(workout?.athleteLevels.includes('foundation'), `${workout?.id ?? 'Strength template'} must remain available to beginners.`);
  assert((workout?.sections.plyometrics.items.length ?? 0) >= 1, `${workout?.id ?? 'Strength template'} must include explosive work.`);
  assert((workout?.sections.strength.items.length ?? 0) >= 6, `${workout?.id ?? 'Strength template'} must include squat/deadlift, hinge, unilateral, push, pull, and trunk work.`);
}
const requiredForcePatterns = ['squat', 'RDL', 'split squat', 'bench press', 'Pull-up', 'trunk'];
const forceExerciseNames = [
  ...(forceStrength?.sections.plyometrics.items ?? []),
  ...(forceStrength?.sections.strength.items ?? []),
].map(item => item.name).join(' ');
requiredForcePatterns.forEach(pattern => {
  assert(forceExerciseNames.toLowerCase().includes(pattern.toLowerCase()), `STR-01 must retain the ${pattern} pattern.`);
});

const preferredIds = [
  ...longGeneral,
  ...shortGeneral,
  ...foundationGeneral,
  ...longSpecific,
  ...competition,
  ...taper,
  ...transition,
].flatMap(slot => slot.preferredWorkoutIds);
preferredIds.forEach(id => {
  assert(libraryById.get(id)?.approvalStatus === 'approved', `Planner architecture references a non-Approved workout: ${id}`);
});

console.log('Planner architecture scenarios passed.');
