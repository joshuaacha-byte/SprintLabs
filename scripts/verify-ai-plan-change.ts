// Offline tests for SprintLab Intelligence I-2's plan-change validator. No Gemini call,
// no AsyncStorage/device — pure fixtures against utils/plan-change-validator.ts, which is
// the layer that actually protects data integrity (the apply step is a thin wrapper that
// re-runs this same validator against fresh live state; see utils/plan-change-apply.ts).
// Usage: node --experimental-strip-types --loader ./scripts/alias-loader.mjs ./scripts/verify-ai-plan-change.ts
import { scaleWorkoutVolume, validatePlanChangeProposal, type PlanChangeContext } from '../utils/plan-change-validator.ts';
import type { PlanChangeProposal, PlannedWorkout } from '../types/index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAILED: ${message}`);
}

const TODAY = '2026-08-15';
const YESTERDAY = '2026-08-14';
const FUTURE_1 = '2026-08-17'; // Monday
const FUTURE_2 = '2026-08-18'; // Tuesday
const FUTURE_HISTORY = '2026-08-16'; // future date, but already logged (e.g. an edited-in-advance completed session)

const trackWorkout: PlannedWorkout = {
  id: 'wk-accel-01',
  title: 'Acceleration development',
  purpose: 'Build early acceleration mechanics.',
  durationMinutes: 60,
  sections: [
    {
      title: 'Track',
      exercises: [
        { id: 'ex-1', name: '20m accel', tracking: { kind: 'track', reps: 6, distanceMeters: 20, targetIntensity: 95, restSeconds: 180 } },
      ],
    },
    {
      title: 'Strength',
      exercises: [
        { id: 'ex-2', name: 'Trap bar deadlift', tracking: { kind: 'strength', sets: 4, targetReps: '3-5', targetLoad: 185, restSeconds: 150 } },
      ],
    },
  ],
};

function baseContext(overrides: Partial<PlanChangeContext> = {}): PlanChangeContext {
  return {
    todayDateKey: TODAY,
    scheduledDays: {
      [FUTURE_1]: { dayIndex: 1, kind: 'workout', workout: trackWorkout },
      [FUTURE_2]: { dayIndex: 2, kind: 'rest' },
      [FUTURE_HISTORY]: { dayIndex: 0, kind: 'workout', workout: trackWorkout },
      [YESTERDAY]: { dayIndex: 6, kind: 'workout', workout: trackWorkout },
    },
    historyDates: new Set([FUTURE_HISTORY]),
    approvedLibraryWorkoutIds: new Set(['LIB-APPROVED-01']),
    ...overrides,
  };
}

let passed = 0;
function check(name: string, proposal: PlanChangeProposal, context: PlanChangeContext, expectOk: boolean) {
  const result = validatePlanChangeProposal(proposal, context);
  assert(result.ok === expectOk, `${name} — expected ok=${expectOk}, got ${JSON.stringify(result)}`);
  passed += 1;
  console.log(`  ok  ${name}${result.ok ? '' : ` (${result.errors.join(' | ')})`}`);
}

console.log('SprintLab Intelligence I-2 — offline plan-change validator tests\n');

// 1. Valid move: future workout day -> a different future rest day.
check('valid move_workout', {
  type: 'move_workout', date: FUTURE_1, toDate: FUTURE_2, workoutId: trackWorkout.id, reason: 'Athlete can only train Tuesday this week.',
}, baseContext(), true);

// 2. Invalid: move targeting a date in the past.
check('reject move_workout with past date', {
  type: 'move_workout', date: YESTERDAY, toDate: FUTURE_1, workoutId: trackWorkout.id, reason: 'Cannot rewrite a day that already happened.',
}, baseContext(), false);

// 3. Missing/mismatched workout id (proposal went stale — plan changed since it was generated).
check('reject move_workout with mismatched workoutId (stale proposal)', {
  type: 'move_workout', date: FUTURE_1, toDate: FUTURE_2, workoutId: 'some-other-workout-id', reason: 'Stale reference.',
}, baseContext(), false);

// 4. replace_workout targeting a workout id that is not in the approved library set.
check('reject replace_workout with nonexistent/unapproved workout', {
  type: 'replace_workout', date: FUTURE_1, workoutId: trackWorkout.id, newWorkoutId: 'LIB-DOES-NOT-EXIST', reason: 'Swap for equipment reasons.',
}, baseContext(), false);

// 4b. replace_workout with a genuinely approved target succeeds.
check('accept replace_workout with approved workout', {
  type: 'replace_workout', date: FUTURE_1, workoutId: trackWorkout.id, newWorkoutId: 'LIB-APPROVED-01', reason: 'Better fit for today\'s equipment access.',
}, baseContext(), true);

// 5. Valid volume adjustment within the sane technical range.
check('accept adjust_volume within range', {
  type: 'adjust_volume', date: FUTURE_1, workoutId: trackWorkout.id, modifier: 0.8, reason: 'Reduce volume after two hard days.',
}, baseContext(), true);

// 6. Invalid volume adjustment outside the sane technical range.
check('reject adjust_volume outside range', {
  type: 'adjust_volume', date: FUTURE_1, workoutId: trackWorkout.id, modifier: 2.5, reason: 'Doubling volume is not a safe automatic suggestion.',
}, baseContext(), false);

// 7. Reject any mutation targeting a date SprintLab already has completed history for.
check('reject mutation of a date with completed history', {
  type: 'remove_future_workout', date: FUTURE_HISTORY, workoutId: trackWorkout.id, reason: 'Attempting to rewrite logged history.',
}, baseContext(), false);

// 8. add_recovery_day / remove_future_workout on a genuinely open future day.
check('accept add_recovery_day on a future workout day', {
  type: 'add_recovery_day', date: FUTURE_1, reason: 'Soreness trend suggests an extra recovery day.',
}, baseContext(), true);

// 9. Stale proposal rejection: workout still scheduled but its id changed after regeneration.
check('reject adjust_volume against a day that is now rest (plan changed)', {
  type: 'adjust_volume', date: FUTURE_2, workoutId: trackWorkout.id, modifier: 0.8, reason: 'Volume reduction.',
}, baseContext(), false);

// --- scaleWorkoutVolume pure transform -------------------------------------------------
const scaled = scaleWorkoutVolume(trackWorkout, 0.8);
assert(scaled.sections[0].exercises[0].tracking.kind === 'track', 'scaleWorkoutVolume preserves tracking kind');
if (scaled.sections[0].exercises[0].tracking.kind === 'track') {
  assert(scaled.sections[0].exercises[0].tracking.reps === 5, `scaleWorkoutVolume scales track reps (6 * 0.8 -> 5, got ${scaled.sections[0].exercises[0].tracking.reps})`);
}
if (scaled.sections[1].exercises[0].tracking.kind === 'strength') {
  assert(scaled.sections[1].exercises[0].tracking.sets === 3, `scaleWorkoutVolume scales strength sets (4 * 0.8 -> 3, got ${scaled.sections[1].exercises[0].tracking.sets})`);
}
assert(trackWorkout.sections[0].exercises[0].tracking.kind === 'track' && (trackWorkout.sections[0].exercises[0].tracking as { reps: number }).reps === 6, 'scaleWorkoutVolume does not mutate the original workout');
passed += 1;
console.log('  ok  scaleWorkoutVolume scales reps/sets and leaves the original workout untouched');

console.log(`\n${passed} assertions passed.`);
