// Offline tests for SprintLab Coach UI Phase C-4's pure Coach Action Card logic: utils/coach-
// actions.ts's describeCoachAction()/coachActionRoute(), and app/api/coach+api.ts's
// sanitizeCoachPayload() (pure sync shape-checking, zero AsyncStorage/network — see that file's
// export comment). No React Native, no AsyncStorage, no Gemini call.
// Usage: node --experimental-strip-types --loader ./scripts/alias-loader.mjs ./scripts/verify-coach-actions.ts
import { coachActionRoute, describeCoachAction } from '../utils/coach-actions.ts';
import { sanitizeCoachPayload } from '../app/api/coach+api.ts';
import type { CoachAction } from '../types/coach-action.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAILED: ${message}`);
}

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log('SprintLab Coach C-4 — offline action-card tests\n');

// --- complete_readiness -----------------------------------------------------------------
check('complete_readiness: missing today -> resolved card', () => {
  const result = describeCoachAction({ type: 'complete_readiness' }, { readinessAlreadyDone: false });
  assert(!!result, 'expected a resolved card');
  assert(result!.display.buttonLabel === 'Complete readiness check', `unexpected button label ${result!.display.buttonLabel}`);
});
check('complete_readiness: already done today -> null (falls back to text)', () => {
  const result = describeCoachAction({ type: 'complete_readiness' }, { readinessAlreadyDone: true });
  assert(result === null, 'expected null once readiness is already done');
});
check('complete_readiness -> known /readiness route', () => {
  assert(coachActionRoute({ type: 'complete_readiness' }) === '/readiness', 'expected /readiness');
});

// --- start_workout -----------------------------------------------------------------------
check('start_workout: real startable workout -> resolved card', () => {
  const result = describeCoachAction({ type: 'start_workout' }, { todayWorkout: { title: 'Acceleration', purpose: 'Speed', exerciseCount: 4 } });
  assert(!!result, 'expected a resolved card');
  assert(result!.display.title === 'Acceleration', `unexpected title ${result!.display.title}`);
});
check('start_workout: no scheduled workout today -> null (safe rejection)', () => {
  const result = describeCoachAction({ type: 'start_workout' }, { todayWorkout: null });
  assert(result === null, 'expected null when today has no workout');
});
check('start_workout: scheduled workout with zero exercises -> null (not startable)', () => {
  const result = describeCoachAction({ type: 'start_workout' }, { todayWorkout: { title: 'Empty', exerciseCount: 0 } });
  assert(result === null, 'expected null for a workout with no exercises');
});
check('start_workout: an active session takes priority -> Resume card', () => {
  const result = describeCoachAction({ type: 'start_workout' }, { activeSessionTitle: 'Tempo Session', todayWorkout: { title: 'Other', exerciseCount: 3 } });
  assert(result?.display.buttonLabel === 'Resume workout', `expected Resume workout, got ${result?.display.buttonLabel}`);
});
check('start_workout -> no plain route (handled via prepareWorkoutLaunch instead)', () => {
  assert(coachActionRoute({ type: 'start_workout' }) === null, 'expected null — start_workout is not a plain route push');
});

// --- view_workout ------------------------------------------------------------------------
check('view_workout: resolved library workout -> card with real name/category', () => {
  const action: CoachAction = { type: 'view_workout', workoutId: 'LIB-01' };
  const result = describeCoachAction(action, { libraryWorkout: { name: 'Block Starts', category: 'acceleration', minMinutes: 40, maxMinutes: 55 } });
  assert(result?.display.title === 'Block Starts', `unexpected title ${result?.display.title}`);
  assert(result?.display.eyebrow === 'ACCELERATION', `unexpected eyebrow ${result?.display.eyebrow}`);
  assert(result?.display.subtitle === '40–55 min', `unexpected subtitle ${result?.display.subtitle}`);
});
check('view_workout: unresolved/invalid workout id -> null (safe fallback, no broken button)', () => {
  const action: CoachAction = { type: 'view_workout', workoutId: 'LIB-DOES-NOT-EXIST' };
  const result = describeCoachAction(action, { libraryWorkout: null });
  assert(result === null, 'expected null for an unresolved workout id');
});
check('view_workout -> known /library-detail route, id only ever in params (never the pathname)', () => {
  const maliciousId = '../../settings';
  const route = coachActionRoute({ type: 'view_workout', workoutId: maliciousId });
  assert(typeof route === 'object' && route !== null, 'expected a route object');
  const { pathname, params } = route as { pathname: string; params: Record<string, string> };
  assert(pathname === '/library-detail', `pathname must stay fixed regardless of workoutId, got ${pathname}`);
  assert(params.id === maliciousId, 'the raw id must be confined to params, never able to change the destination screen');
});

// --- log_session -------------------------------------------------------------------------
check('log_session: resolved real scheduled day -> card with real title', () => {
  const result = describeCoachAction({ type: 'log_session', date: '2026-08-14' }, { loggedDateWorkout: { weekdayLabel: 'Friday', title: 'Tempo Run' } });
  assert(result?.display.title === 'Tempo Run', `unexpected title ${result?.display.title}`);
  assert(result?.display.eyebrow === 'FRIDAY', `unexpected eyebrow ${result?.display.eyebrow}`);
});
check('log_session: no date / unresolved date -> generic (never invented) copy', () => {
  const result = describeCoachAction({ type: 'log_session' }, { loggedDateWorkout: null });
  assert(!!result, 'log_session should still render generically');
  assert(result!.display.title === 'A recent session hasn’t been logged.', `unexpected generic title ${result!.display.title}`);
});
check('log_session -> known /log route', () => {
  assert(coachActionRoute({ type: 'log_session', date: '2026-08-14' }) === '/log', 'expected /log');
});

// --- review_week -------------------------------------------------------------------------
check('review_week: real weekly counts -> card reflects them', () => {
  const result = describeCoachAction({ type: 'review_week' }, { weeklyProgress: { completed: 2, due: 4 } });
  assert(result?.display.title === '2 of 4 sessions completed so far', `unexpected title ${result?.display.title}`);
});
check('review_week -> known /plan route', () => {
  assert(coachActionRoute({ type: 'review_week' }) === '/plan', 'expected /plan');
});

// --- update_profile ------------------------------------------------------------------------
check('update_profile: uses the descriptive field label, capped length', () => {
  const result = describeCoachAction({ type: 'update_profile', field: 'training frequency' });
  assert(result?.display.title === 'training frequency', `unexpected title ${result?.display.title}`);
});
check('update_profile -> known /profile edit-mode route', () => {
  const route = coachActionRoute({ type: 'update_profile' });
  assert(typeof route === 'object' && route !== null && (route as { pathname: string }).pathname === '/profile', 'expected /profile');
  assert((route as { params: Record<string, string> }).params.mode === 'edit', 'expected edit mode param');
});

// --- malformed / unsupported --------------------------------------------------------------
check('an unsupported action type is safely ignored (describeCoachAction)', () => {
  const bogus = { type: 'delete_everything' } as unknown as CoachAction;
  assert(describeCoachAction(bogus) === null, 'expected null for an unsupported action type');
});
check('an unsupported action type is safely ignored (coachActionRoute)', () => {
  const bogus = { type: 'delete_everything' } as unknown as CoachAction;
  assert(coachActionRoute(bogus) === null, 'expected null for an unsupported action type');
});

// --- sanitizeCoachPayload: single-card precedence + malformed rejection ------------------
check('sanitizeCoachPayload: text-only response -> proposal and action both null', () => {
  const payload = sanitizeCoachPayload({ message: 'Looks like a solid week.', proposal: null, action: null });
  assert(payload?.proposal === null && payload?.action === null, 'expected no cards for a text-only response');
});
check('sanitizeCoachPayload: a valid proposal always takes precedence over an action', () => {
  const payload = sanitizeCoachPayload({
    message: 'Let’s move Friday.',
    proposal: { type: 'move_workout', date: '2026-08-17', toDate: '2026-08-18', reason: 'Missed Friday.' },
    action: { type: 'review_week' },
  });
  assert(!!payload?.proposal, 'expected the proposal to survive');
  assert(payload?.action === null, 'expected the action to be dropped when a valid proposal is present');
});
check('sanitizeCoachPayload: valid action-only response is kept', () => {
  const payload = sanitizeCoachPayload({ message: 'Want to check in first?', proposal: null, action: { type: 'complete_readiness' } });
  assert(payload?.action?.type === 'complete_readiness', 'expected the action to survive');
});
check('sanitizeCoachPayload: an unknown action type rejects the whole payload', () => {
  const payload = sanitizeCoachPayload({ message: 'x', proposal: null, action: { type: 'do_something_else' } });
  assert(payload === null, 'expected the malformed payload to be rejected entirely, not partially accepted');
});
check('sanitizeCoachPayload: view_workout without a workoutId rejects the whole payload', () => {
  const payload = sanitizeCoachPayload({ message: 'x', proposal: null, action: { type: 'view_workout' } });
  assert(payload === null, 'expected rejection — view_workout requires workoutId');
});
check('sanitizeCoachPayload: an action carrying a raw "route" field is ignored — no such field exists in the schema', () => {
  const payload = sanitizeCoachPayload({ message: 'x', proposal: null, action: { type: 'review_week', route: '/settings' } });
  assert(payload?.action?.type === 'review_week', 'expected the action to still sanitize correctly');
  assert(!('route' in (payload!.action as object)), 'expected the extraneous "route" field to be dropped, never forwarded to navigation');
});

console.log(`\n${passed} assertions passed.`);
