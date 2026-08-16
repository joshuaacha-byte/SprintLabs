// SprintLab Intelligence I-2: ONE live Gemini verification. Builds a realistic athlete
// context, asks the missed-Friday/limited-days question, and locally validates whatever
// structured proposal comes back — it never calls applyAIPlanChange, so nothing is written
// to any plan even if the proposal is valid. If Gemini 429s, this stops and reports it;
// it does not retry.
//
// Requires `npx expo start` (or `npm run web`) running locally first.
// Usage: node --experimental-strip-types --loader ./scripts/alias-loader.mjs ./scripts/dev-test-coach-plan-change.ts
import { sampleAthleteProfile } from '../data/domain-samples.ts';
import { buildAthleteAIContext } from '../utils/ai-context.ts';
import { validatePlanChangeProposal, type PlanChangeContext } from '../utils/plan-change-validator.ts';
import type { AthleteProfile, CoachResponsePayload, ScheduledDay } from '../types/index.ts';

const url = process.env.SPRINTLAB_DEV_URL ?? 'http://localhost:8081/api/coach';

// A fixed "today" so the fixture is deterministic: Saturday 2026-08-15, matching a Mon/Wed/Fri
// recurring plan — Friday 2026-08-14 (yesterday) was the missed session.
const now = new Date(2026, 7, 15, 10);
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
const message = 'I missed Friday\'s workout and can only train Saturday or Sunday. What should I change?';

/** Resolves any ISO date the proposal references back to the fixture's Mon/Wed/Fri recurring pattern, so we can locally validate the proposal exactly as SprintLab would on-device. */
function resolveFixtureDay(date: string): PlanChangeContext['scheduledDays'][string] {
  const dayIndex = new Date(`${date}T00:00:00`).getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  if (!WORKOUT_DAYS.has(dayIndex)) return { dayIndex, kind: 'rest' };
  return {
    dayIndex,
    kind: 'workout',
    workout: { id: `w${dayIndex}`, title: 'Fixture workout', purpose: '', durationMinutes: 60, sections: [] },
  };
}

async function main() {
  console.log(`\nQuestion: ${message}\n`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context, today }),
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
      [payload.proposal.date]: resolveFixtureDay(payload.proposal.date),
      ...(payload.proposal.toDate ? { [payload.proposal.toDate]: resolveFixtureDay(payload.proposal.toDate) } : {}),
    },
    historyDates: new Set(), // nothing logged yet in this fixture — Friday was missed, not recorded
    approvedLibraryWorkoutIds: new Set(), // fixture has no real Library; replace/variant proposals are expected to fail approval here
  };
  const result = validatePlanChangeProposal(payload.proposal, planContext);
  console.log(`\nLocal validation: ${result.ok ? 'VALID' : 'REJECTED'}`);
  if (!result.ok) console.log(result.errors.join('\n'));
  console.log('\napplyAIPlanChange was NOT called — this script only validates, it never applies.');
}

main().catch(error => {
  console.error('dev-test-coach-plan-change failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
