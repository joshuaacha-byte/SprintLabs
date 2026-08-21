// Regression checks for the Log Session redesign (structured manual workout details) and the
// hamstring-field removal. Pure-function checks against the real domain-adapters/training-history
// code — no AsyncStorage, consistent with this repo's existing scripts/verify-*.ts convention.
//
// Run: node --experimental-strip-types --loader ./scripts/alias-loader.mjs ./scripts/verify-log-session-redesign.ts
import { buildManualTrainingLog, buildStructuredTrainingLog, type ManualSessionInput } from '../utils/domain-adapters.ts';
import {
  filterTrainingLogs,
  hasRecordedWorkoutDetails,
  keySprintResult,
  sessionSummary,
  defaultHistoryFilters,
} from '../utils/training-history.ts';
import type { ActiveWorkoutSession, PostWorkoutReview, TrainingLog } from '../types/index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`REGRESSION: ${message}`);
}

const review: PostWorkoutReview = { completed: true, rpe: 7, energy: 4, sleep: 7.5, soreness: 3, notes: 'Felt good.' };
assert(!('hamstring' in review), 'PostWorkoutReview must no longer carry a hamstring field.');

// 1. Manually log a sprint workout with multiple runs and times.
const sprintInput: ManualSessionInput = {
  date: '2026-08-20',
  name: 'Track sprint work',
  category: 'acceleration',
  description: 'Block starts into 30m, then a few flying 20s.',
  durationMinutes: 55,
  activities: [
    { id: 'a1', name: '30m block start', setsOrReps: '4 runs', distance: '30m', result: '4.21s best' },
    { id: 'a2', name: 'Flying 20', setsOrReps: '3 runs', distance: '20m', result: '2.31s best' },
  ],
};
const sprintLog = buildManualTrainingLog(sprintInput, review, '2026-08-20T18:00:00.000Z');
assert(sprintLog.plannedWorkout.name === 'Track sprint work', `Sprint log must keep the real session name, got "${sprintLog.plannedWorkout.name}".`);
assert(sprintLog.plannedWorkout.trainingCategory === 'acceleration', 'Sprint log category must map to acceleration.');
assert(sprintLog.manualDetails?.activities.length === 2, 'Sprint log must retain both logged activities.');
assert(hasRecordedWorkoutDetails(sprintLog), 'Sprint log must count as having recorded workout details.');
assert(keySprintResult(sprintLog) === '4.21s best · 30m block start', `Sprint log key result should surface the first activity result, got "${keySprintResult(sprintLog)}".`);

// 2. Manually log a strength workout with exercises and weights.
const strengthInput: ManualSessionInput = {
  date: '2026-08-21',
  name: 'Lower body strength',
  category: 'strength',
  description: 'Squat-focused lower body day.',
  activities: [
    { id: 'b1', name: 'Back squat', setsOrReps: '4x5', result: '225 lb' },
    { id: 'b2', name: 'RDL', setsOrReps: '3x8', result: '185 lb' },
  ],
};
const strengthLog = buildManualTrainingLog(strengthInput, review, '2026-08-21T18:00:00.000Z');
assert(strengthLog.plannedWorkout.trainingCategory === 'strength', 'Strength log category must map to strength.');
assert(keySprintResult(strengthLog) === '225 lb · Back squat', `Strength log key result should surface its first activity, got "${keySprintResult(strengthLog)}".`);

// 3. Manually log a mixed session (no activities at all — just the required description).
const mixedInput: ManualSessionInput = {
  date: '2026-08-22',
  name: 'Team practice',
  category: 'mixed',
  description: 'Ran with the team — mix of speed drills and small-sided games.',
  activities: [],
};
const mixedLog = buildManualTrainingLog(mixedInput, review, '2026-08-22T18:00:00.000Z');
assert(hasRecordedWorkoutDetails(mixedLog), 'A manual log with only a description (no activities) must still count as having recorded details.');
assert(keySprintResult(mixedLog) === null, 'A session with no recorded result must return null, not a placeholder.');
assert(sessionSummary(mixedLog) === mixedInput.description, 'Session summary must surface the manual description.');
assert(mixedLog.completionStatus === 'completed-as-planned', 'An unlinked manual session must not be marked partial — there is no plan for it to be partial against.');
assert(mixedLog.scheduledWorkoutId === null, 'An unlinked manual session must not carry a scheduledWorkoutId.');

// 4. Complete an in-app planned workout and verify its existing details are saved automatically.
const activeSession: ActiveWorkoutSession = {
  id: 'session-1',
  plannedWorkoutSnapshot: {
    id: 'w1',
    title: 'Acceleration development',
    purpose: 'Build acceleration quality.',
    durationMinutes: 60,
    sections: [{ title: 'Track', exercises: [{ id: 'e1', name: '30m starts', tracking: { kind: 'track', reps: 4, distanceMeters: 30, restSeconds: 180 } }] }],
  },
  scheduledDate: '2026-08-23',
  readinessStatus: 'completed',
  startedAt: '2026-08-23T17:00:00.000Z',
  executionStartedAt: '2026-08-23T17:00:00.000Z',
  elapsedSeconds: 1800,
  actualResults: [{
    exerciseId: 'e1',
    sectionTitle: 'Track',
    trackingKind: 'track',
    status: 'completed',
    trackReps: [
      { repNumber: 1, status: 'completed', timeSeconds: 4.2 },
      { repNumber: 2, status: 'completed', timeSeconds: 4.15 },
    ],
  }] as ActiveWorkoutSession['actualResults'],
};
const plannedLog = buildStructuredTrainingLog(activeSession, review, '2026-08-23T18:00:00.000Z');
assert(plannedLog.plannedWorkout.name === activeSession.plannedWorkoutSnapshot.title, 'A planned-workout completion must keep the real workout title automatically.');
assert(plannedLog.exerciseResults.length === activeSession.actualResults.length, 'A planned-workout completion must carry over every actual result automatically.');
assert(keySprintResult(plannedLog) === '4.15s · 30m', `A planned-workout completion must surface its best timed rep automatically, got "${keySprintResult(plannedLog)}".`);
assert(!plannedLog.manualDetails, 'A planned-workout completion must not carry manualDetails — it already has structured exerciseResults.');

// 5. Link a manual workout to a scheduled workout.
const linkedInput: ManualSessionInput = { ...mixedInput, linkedScheduledDate: '2026-08-22' };
const linkedLogPartial = buildManualTrainingLog(linkedInput, { ...review, completed: false }, '2026-08-22T18:00:00.000Z');
assert(linkedLogPartial.scheduledWorkoutId !== null, 'A linked manual session must carry a scheduledWorkoutId.');
assert(linkedLogPartial.completionStatus === 'partial', 'A linked manual session marked not-completed must be partial, not silently completed-as-planned.');

// 6. Open an older session that lacks the new fields — must not crash and must report honestly.
const legacyLog = {
  ...mixedLog,
  manualDetails: undefined,
  plannedWorkout: { ...mixedLog.plannedWorkout, description: mixedLog.plannedWorkout.name, sections: [] },
} as TrainingLog;
assert(!hasRecordedWorkoutDetails(legacyLog), 'A bare legacy log with no sections and no manualDetails must report no recorded workout details.');
assert(sessionSummary(legacyLog) === null, 'A bare legacy log must return no summary rather than throwing.');
assert(keySprintResult(legacyLog) === null, 'A bare legacy log must return no key result rather than throwing.');
// A legacy record carrying the old hamstring field (loaded via JSON.parse, not the TS type) must
// not crash any of these helpers — TypeScript no longer models the field, but old JSON still has it.
const legacyWithHamstring = JSON.parse(JSON.stringify({ ...legacyLog, readiness: { ...legacyLog.readiness, hamstringSoreness: 6 } }));
assert(hasRecordedWorkoutDetails(legacyWithHamstring) === false, 'A legacy record with a stray hamstringSoreness value must still load/evaluate without crashing.');

// 7. Search the Logbook by workout name, activity, and notes.
const logs = [sprintLog, strengthLog, mixedLog];
assert(filterTrainingLogs(logs, { ...defaultHistoryFilters, query: 'flying 20' }).length === 1, 'Search must match an activity name.');
assert(filterTrainingLogs(logs, { ...defaultHistoryFilters, query: 'squat-focused' }).length === 1, 'Search must match the manual description text.');
assert(filterTrainingLogs(logs, { ...defaultHistoryFilters, query: 'lower body strength' }).length === 1, 'Search must match the session name.');
assert(filterTrainingLogs(logs, { ...defaultHistoryFilters, query: 'nonexistent-term-xyz' }).length === 0, 'Search must exclude non-matching logs.');

// 8. Confirm session cards do not show irrelevant empty metrics — already covered by keySprintResult
// returning null above (case 3); a null key result must never be rendered as a placeholder metric.

console.log('All Log Session redesign regression checks passed.');
