// Pure, offline verification of buildAthleteAIContext. No network/Gemini calls — safe to run
// as often as needed during implementation.
import { sampleAthleteProfile } from '../data/domain-samples.ts';
import { buildAthleteAIContext } from '../utils/ai-context.ts';
import type { AthleteProfile, CompletedWorkoutSession, ReadinessDecision, ScheduledDay, TrainingLogSummary } from '../types/index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const profile = sampleAthleteProfile as unknown as AthleteProfile;

const schedule: ScheduledDay[] = [0, 1, 2, 3, 4, 5, 6].map(dayIndex => ({
  dayIndex: dayIndex as ScheduledDay['dayIndex'],
  shortLabel: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][dayIndex],
  fullLabel: 'Day',
  kind: dayIndex === 1 || dayIndex === 3 || dayIndex === 5 ? 'workout' : 'rest',
  workout: dayIndex === 1 || dayIndex === 3 || dayIndex === 5 ? { id: `w${dayIndex}`, title: 'Acceleration development', purpose: 'Speed', durationMinutes: 60, sections: [] } : undefined,
  restTitle: dayIndex === 1 || dayIndex === 3 || dayIndex === 5 ? undefined : 'Rest day',
}));

const now = new Date(2026, 7, 12, 12); // Wednesday

function session(id: string, dateKey: string, rpe: number, notes: string): CompletedWorkoutSession {
  return {
    id,
    plannedWorkoutSnapshot: { id: 'w', title: 'Acceleration development', sections: [] } as never,
    scheduledDate: dateKey,
    readinessStatus: 'completed',
    startedAt: `${dateKey}T09:00:00.000Z`,
    elapsedSeconds: 1800,
    actualResults: [],
    finishedAt: `${dateKey}T10:00:00.000Z`,
    review: { completed: true, rpe, energy: 4, sleep: 7, soreness: 1, notes },
  };
}

const sessions: CompletedWorkoutSession[] = [
  session('s1', '2026-08-10', 7, 'Felt sharp, blocks were clean.'),
  session('s2', '2026-08-05', 8, 'x'.repeat(400)), // forces truncation
];

const logs: TrainingLogSummary[] = sessions.map((s, index) => ({
  id: `log-${index}`,
  sessionId: s.id,
  date: s.finishedAt,
  completed: s.review.completed,
  rpe: s.review.rpe,
  energy: s.review.energy,
  sleep: s.review.sleep,
  soreness: s.review.soreness,
  notes: s.review.notes,
  workoutTitle: 'Acceleration development',
}));

const readiness: ReadinessDecision = {
  date: '2026-08-12',
  status: 'completed',
  readinessLevel: 'green',
  readinessReasons: ['Slept well', 'No soreness flagged'],
  painNotes: '',
};

let checks = 0;
function check(label: string, fn: () => void) {
  fn();
  checks += 1;
}

check('builds without throwing on a realistic fixture', () => {
  const context = buildAthleteAIContext({ profile, schedule, scheduleHistory: [], sessions, logs, readiness, libraryWorkouts: [], now });
  assert(context.athlete.sport === 'track-and-field', 'expected sport to be carried through');
});

check('current week always has exactly 7 days', () => {
  const context = buildAthleteAIContext({ profile, schedule, scheduleHistory: [], sessions, logs, readiness, libraryWorkouts: [], now });
  assert(context.currentWeek.days.length === 7, `expected 7 days, got ${context.currentWeek.days.length}`);
});

check('PRs are carried through from the profile, event-tagged', () => {
  const context = buildAthleteAIContext({ profile, schedule, scheduleHistory: [], sessions, logs, readiness, libraryWorkouts: [], now });
  assert(context.athlete.prs.length === profile.personalBests.length, 'PR count mismatch');
  assert(context.athlete.prs.every(pr => Boolean(pr.event)), 'every PR must carry its event');
});

check('recentTraining is bounded even with more sessions than the limit', () => {
  const manySessions = Array.from({ length: 20 }, (_, i) => session(`s${i}`, `2026-08-${String(1 + (i % 12)).padStart(2, '0')}`, 6, 'note'));
  const manyLogs: TrainingLogSummary[] = manySessions.map((s, index) => ({
    id: `log-many-${index}`, sessionId: s.id, date: s.finishedAt, completed: true, rpe: 6, energy: 4, sleep: 7, soreness: 1, notes: 'note', workoutTitle: 'Session',
  }));
  const context = buildAthleteAIContext({ profile, schedule, scheduleHistory: [], sessions: manySessions, logs: manyLogs, readiness, libraryWorkouts: [], now });
  assert(context.recentTraining.length <= 8, `expected recentTraining bounded to 8, got ${context.recentTraining.length}`);
});

check('long notes are truncated, not sent in full', () => {
  const context = buildAthleteAIContext({ profile, schedule, scheduleHistory: [], sessions, logs, readiness, libraryWorkouts: [], now });
  const longNoteEntry = context.recentTraining.find(entry => entry.notes && entry.notes.length > 100);
  assert(Boolean(longNoteEntry), 'expected the 400-char note to survive as a truncated entry');
  assert((longNoteEntry?.notes?.length ?? 0) <= 221, `expected truncation to ~220 chars, got ${longNoteEntry?.notes?.length}`);
});

check('missing readiness does not crash and is omitted, not fabricated', () => {
  const context = buildAthleteAIContext({ profile, schedule, scheduleHistory: [], sessions, logs, readiness: null, libraryWorkouts: [], now });
  assert(context.recovery.latestReadiness === undefined, 'expected no latestReadiness when none was provided');
});

check('a profile with no restrictions produces no restrictions object', () => {
  const context = buildAthleteAIContext({ profile, schedule, scheduleHistory: [], sessions, logs, readiness, libraryWorkouts: [], now });
  assert(context.athlete.restrictions === undefined, 'expected undefined restrictions for a clean profile');
});

check('coach/medical restrictions are carried through verbatim when present', () => {
  const restrictedProfile: AthleteProfile = { ...profile, coachRestrictions: 'No overspeed work this week.', medicalRestrictions: 'Cleared for full training as of 8/1.' };
  const context = buildAthleteAIContext({ profile: restrictedProfile, schedule, scheduleHistory: [], sessions, logs, readiness, libraryWorkouts: [], now });
  assert(context.athlete.restrictions?.coach === 'No overspeed work this week.', 'coach restriction not carried through verbatim');
  assert(context.athlete.restrictions?.medical === 'Cleared for full training as of 8/1.', 'medical restriction not carried through verbatim');
});

check('the whole context stays compact for a normal fixture (token/cost discipline)', () => {
  const context = buildAthleteAIContext({ profile, schedule, scheduleHistory: [], sessions, logs, readiness, libraryWorkouts: [], now });
  const size = JSON.stringify(context).length;
  assert(size < 5_000, `expected a compact context under 5000 chars for this small fixture, got ${size}`);
});

console.log(`verify-ai-context: ${checks} checks passed.`);
