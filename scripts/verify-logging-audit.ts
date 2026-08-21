// Regression checks for the training-logging audit pass: the new post-session "anything
// bothering you?" report (PostWorkoutReview.painArea/monitorPain) flows into TrainingLog's
// existing readiness.painAreas (no new parallel storage shape), into TrainingLogSummary for
// Progress's "Recurring discomfort" surface, and into Coach context — and Progress never reacts
// to a single unmonitored report.
//
// Run: node --experimental-strip-types --loader ./scripts/alias-loader.mjs ./scripts/verify-logging-audit.ts
import { buildManualTrainingLog } from '../utils/domain-adapters.ts';
import { buildRecurringPainAreas } from '../utils/progress.ts';
import { buildAthleteAIContext } from '../utils/ai-context.ts';
import { sampleAthleteProfile } from '../data/domain-samples.ts';
import type { AthleteProfile, PostWorkoutReview, TrainingLogSummary } from '../types/index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`REGRESSION: ${message}`);
}

const reviewWithPain = (overrides: Partial<PostWorkoutReview> = {}): PostWorkoutReview => ({
  completed: true,
  rpe: 6,
  energy: 4,
  sleep: 7,
  soreness: 3,
  notes: '',
  painArea: 'hamstring',
  monitorPain: true,
  ...overrides,
});

// 1. A post-session pain report reaches TrainingLog.readiness.painAreas — the same existing shape
// readiness already uses, not a second parallel field on the domain log.
{
  const log = buildManualTrainingLog(
    { date: '2026-08-01', name: 'Tempo run', category: 'tempo-recovery', description: 'Grass tempo.', activities: [] },
    reviewWithPain(),
    '2026-08-01T18:00:00.000Z',
  );
  assert(log.readiness.painAreas.length === 1, 'A reported painArea must produce exactly one PainReport entry.');
  assert(log.readiness.painAreas[0].area === 'hamstring', 'The PainReport area must match the reviewed painArea.');
  assert(log.readiness.painAreas[0].description.includes('monitor'), 'monitorPain=true must be reflected in the PainReport description.');

  const cleanLog = buildManualTrainingLog(
    { date: '2026-08-01', name: 'Tempo run', category: 'tempo-recovery', description: 'Grass tempo.', activities: [] },
    reviewWithPain({ painArea: undefined, monitorPain: undefined }),
    '2026-08-01T18:00:00.000Z',
  );
  assert(cleanLog.readiness.painAreas.length === 0, 'No painArea reported must produce an empty painAreas array, not a placeholder entry.');
}

// 2. Progress's "Recurring discomfort" never reacts to a single unmonitored report, but does
// surface a single monitored one, and does surface a second unmonitored occurrence.
{
  const base = (overrides: Partial<TrainingLogSummary>): TrainingLogSummary => ({
    id: `log-${Math.random()}`, date: '2026-08-15T12:00:00.000Z', completed: true, rpe: 6, energy: 4, sleep: 7, soreness: 2, notes: '', ...overrides,
  });

  const singleUnmonitored = buildRecurringPainAreas([base({ painArea: 'knee' })], new Date('2026-08-20'));
  assert(singleUnmonitored.length === 0, 'A single unmonitored pain report must not be surfaced as "recurring".');

  const singleMonitored = buildRecurringPainAreas([base({ painArea: 'knee', monitorPain: true })], new Date('2026-08-20'));
  assert(singleMonitored.length === 1 && singleMonitored[0].area === 'knee', 'A single explicitly-monitored report must still surface — the athlete asked for it to be watched.');

  const twoReports = buildRecurringPainAreas([
    base({ id: 'a', date: '2026-08-10T12:00:00.000Z', painArea: 'hamstring' }),
    base({ id: 'b', date: '2026-08-16T12:00:00.000Z', painArea: 'hamstring' }),
  ], new Date('2026-08-20'));
  assert(twoReports.length === 1 && twoReports[0].count === 2, 'Two reports of the same area within the window must surface with the correct count.');

  const outsideWindow = buildRecurringPainAreas([
    base({ id: 'a', date: '2026-06-01T12:00:00.000Z', painArea: 'hamstring' }),
    base({ id: 'b', date: '2026-06-02T12:00:00.000Z', painArea: 'hamstring' }),
  ], new Date('2026-08-20'));
  assert(outsideWindow.length === 0, 'Reports outside the recent window (default 30 days) must not be counted.');
}

// 3. A recent log's painArea reaches Coach context's recentTraining entries.
{
  const sessions: never[] = [];
  const logs: TrainingLogSummary[] = [{
    id: 'sess-1', sessionId: 'sess-1', date: '2026-08-20T12:00:00.000Z', completed: true, rpe: 7, energy: 4, sleep: 7, soreness: 3,
    notes: '', painArea: 'shin', workoutTitle: 'Acceleration day',
  }];
  const context = buildAthleteAIContext({
    profile: sampleAthleteProfile as AthleteProfile, schedule: [], scheduleHistory: [], sessions, logs, readiness: null, libraryWorkouts: [],
  });
  const withPain = context.recentTraining.find(item => item.painArea);
  assert(withPain?.painArea === 'shin', 'A log carrying painArea must reach Coach context recentTraining[].painArea.');
}

console.log('All training-logging audit regression checks passed.');
