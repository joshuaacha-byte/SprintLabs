// SprintLab Coach UI Phase C-2: ONE live Gemini verification, matching the exact request shape
// components/coach-context.tsx actually sends (message, context, today, surface, entityId,
// entityLabel, history). Locally validates whatever proposal comes back but never calls
// applyAIPlanChange — this only proves the real backend connection, it never mutates anything.
// If Gemini 429s, this stops and reports it; it does not retry.
//
// Requires `npx expo start` (or `npm run web`) running locally first.
// Usage: node --experimental-strip-types --loader ./scripts/alias-loader.mjs ./scripts/dev-test-coach-c2.ts
import { sampleAthleteProfile } from '../data/domain-samples.ts';
import { buildAthleteAIContext } from '../utils/ai-context.ts';
import { validatePlanChangeProposal, type PlanChangeContext } from '../utils/plan-change-validator.ts';
import { boundedHistory } from '../utils/coach.ts';
import type { AthleteProfile, CoachResponsePayload, ScheduledDay } from '../types/index.ts';

const url = process.env.SPRINTLAB_DEV_URL ?? 'http://localhost:8081/api/coach';

const now = new Date(2026, 7, 15, 10); // fixed Saturday 2026-08-15
const today = now.toLocaleDateString('en-CA');
console.log(`Fixture "today": ${today} (weekday ${now.getDay()} — 6 = Saturday)`);

const profile = sampleAthleteProfile as unknown as AthleteProfile;
const WORKOUT_DAYS = new Set([1, 3, 5]); // Mon/Wed/Fri
const schedule: ScheduledDay[] = [0, 1, 2, 3, 4, 5, 6].map(dayIndex => ({
  dayIndex: dayIndex as ScheduledDay['dayIndex'],
  shortLabel: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][dayIndex],
  fullLabel: 'Day',
  kind: WORKOUT_DAYS.has(dayIndex) ? 'workout' : 'rest',
  workout: WORKOUT_DAYS.has(dayIndex)
    ? { id: `w${dayIndex}`, title: dayIndex === 1 ? 'Acceleration development' : dayIndex === 3 ? 'Max velocity + tempo' : 'Speed endurance', purpose: 'Speed development', durationMinutes: 65, sections: [] }
    : undefined,
  restTitle: WORKOUT_DAYS.has(dayIndex) ? undefined : 'Rest day',
}));

const context = buildAthleteAIContext({ profile, schedule, scheduleHistory: [], sessions: [], logs: [], readiness: null, now });

// Mimics a short prior exchange so this also exercises bounded multi-turn history, exactly like
// a real reopened Coach conversation — matching components/coach-context.tsx's boundedHistory().
const priorMessages = [
  { kind: 'athlete', text: 'How is my week structured right now?' },
  { kind: 'split', text: 'You have Monday/Wednesday/Friday speed sessions with rest days between them.' },
];
const message = 'I missed Friday\'s workout and can only train Saturday. What should I do?';

async function main() {
  console.log(`\nSurface: today (simulating Coach opened from the Today screen)`);
  console.log(`Question: ${message}\n`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      context,
      today,
      surface: 'today',
      history: boundedHistory(priorMessages),
    }),
  });

  if (response.status === 429) {
    console.error('Gemini rate-limited this request (429). Stopping — not retrying automatically.');
    process.exitCode = 1;
    return;
  }

  const body = await response.json().catch(() => null);
  console.log(`Status: ${response.status}`);
  console.log(JSON.stringify(body, null, 2));

  if (!response.ok || !body) {
    process.exitCode = 1;
    return;
  }

  const payload = body as CoachResponsePayload;
  if (!payload.proposal) {
    console.log('\nNo plan-change proposal was returned (a plain answer is a valid outcome).');
    return;
  }

  const planContext: PlanChangeContext = {
    todayDateKey: today,
    scheduledDays: {
      [payload.proposal.date]: { dayIndex: new Date(`${payload.proposal.date}T00:00:00`).getDay() as never, kind: 'workout', workout: { id: `w${new Date(`${payload.proposal.date}T00:00:00`).getDay()}`, title: 'Fixture workout', purpose: '', durationMinutes: 60, sections: [] } },
      ...(payload.proposal.toDate ? { [payload.proposal.toDate]: { dayIndex: new Date(`${payload.proposal.toDate}T00:00:00`).getDay() as never, kind: 'rest' } } : {}),
    },
    historyDates: new Set(),
    approvedLibraryWorkoutIds: new Set(),
  };
  const result = validatePlanChangeProposal(payload.proposal, planContext);
  console.log(`\nLocal validation: ${result.ok ? 'VALID' : 'REJECTED'}`);
  if (!result.ok) console.log(result.errors.join('\n'));
  console.log('\napplyAIPlanChange was NOT called — this script only validates, it never applies.');
}

main().catch(error => {
  console.error('dev-test-coach-c2 failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
