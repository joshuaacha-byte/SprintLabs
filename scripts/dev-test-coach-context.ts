// ONE-SHOT developer test for SprintLab Intelligence I-1C: builds a realistic athlete context
// with buildAthleteAIContext() from a local fixture (never real device data), then POSTs it
// together with a question to the running /api/coach route exactly once.
//
// Requires `npx expo start` (or `npm run web`) running locally first.
// Usage: node --experimental-strip-types ./scripts/dev-test-coach-context.ts
import { sampleAthleteProfile } from '../data/domain-samples.ts';
import { buildAthleteAIContext } from '../utils/ai-context.ts';
import type { AthleteProfile, CompletedWorkoutSession, ReadinessDecision, ScheduledDay, TrainingLogSummary } from '../types/index.ts';

const url = process.env.SPRINTLAB_DEV_URL ?? 'http://localhost:8081/api/coach';
const now = new Date(2026, 7, 12, 12); // fixed Wednesday, so the fixture is deterministic

const profile = sampleAthleteProfile as unknown as AthleteProfile;

const schedule: ScheduledDay[] = [0, 1, 2, 3, 4, 5, 6].map(dayIndex => ({
  dayIndex: dayIndex as ScheduledDay['dayIndex'],
  shortLabel: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][dayIndex],
  fullLabel: 'Day',
  kind: dayIndex === 1 || dayIndex === 3 || dayIndex === 5 ? 'workout' : 'rest',
  workout: dayIndex === 1 || dayIndex === 3 || dayIndex === 5
    ? { id: `w${dayIndex}`, title: dayIndex === 1 ? 'Acceleration development' : dayIndex === 3 ? 'Max velocity + tempo' : 'Speed endurance', purpose: 'Speed development', durationMinutes: 65, sections: [] }
    : undefined,
  restTitle: dayIndex === 1 || dayIndex === 3 || dayIndex === 5 ? undefined : 'Rest day',
}));

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
    review: { completed: true, rpe, energy: 4, sleep: 7, hamstring: 2, soreness: 3, notes },
  };
}

const sessions: CompletedWorkoutSession[] = [
  session('s1', '2026-08-10', 8, 'Hamstring felt a little tight in the last two reps.'),
  session('s2', '2026-08-05', 6, 'Easy day, felt good.'),
];

const logs: TrainingLogSummary[] = sessions.map((s, index) => ({
  id: `log-${index}`,
  sessionId: s.id,
  date: s.finishedAt,
  completed: s.review.completed,
  rpe: s.review.rpe,
  energy: s.review.energy,
  sleep: s.review.sleep,
  hamstring: s.review.hamstring,
  soreness: s.review.soreness,
  notes: s.review.notes,
  workoutTitle: 'Acceleration development',
}));

const readiness: ReadinessDecision = {
  date: '2026-08-12',
  status: 'completed',
  readinessLevel: 'yellow',
  readinessReasons: ['Mild hamstring tightness reported'],
  painNotes: '',
};

const context = buildAthleteAIContext({ profile, schedule, scheduleHistory: [], sessions, logs, readiness, libraryWorkouts: [], now });
const message = 'Why is this athlete\'s current week structured this way, and is there anything in the recent training data that would make you reconsider it?';

async function main() {
  console.log('Context sent (compact, JSON-serialized):');
  console.log(JSON.stringify(context, null, 2));
  console.log(`\nContext size: ${JSON.stringify(context).length} characters\n`);
  console.log(`Question: ${message}\n`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context }),
  });
  const body = await response.json().catch(() => null);

  if (response.status === 429) {
    console.error('Gemini rate-limited this request (429). Stopping — not retrying automatically.');
    process.exitCode = 1;
    return;
  }

  console.log(`Status: ${response.status}`);
  console.log(JSON.stringify(body, null, 2));
  if (!response.ok) process.exitCode = 1;
}

main().catch(error => {
  console.error('dev-test-coach-context failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
