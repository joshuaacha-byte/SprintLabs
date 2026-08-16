// Offline tests for SprintLab Coach UI Phase C-3's pure local trigger logic (utils/coach-
// triggers.ts). No network, no AsyncStorage, no Gemini call. Covers the 13 cases from the C-3
// spec's offline-verification section; #12 and #13 (opening Coach makes no API call, and the
// suggested-prompt chip reuses the exact C-2 send path) are architectural properties verified by
// source inspection in the final report rather than executable assertions here — this project
// has no React Native component-test harness, and adding one is out of scope for C-3.
// Usage: node --experimental-strip-types --loader ./scripts/alias-loader.mjs ./scripts/verify-coach-triggers.ts
import { detectCoachTriggers, selectActiveCoachTrigger, type CoachTrigger, type DetectCoachTriggersInput } from '../utils/coach-triggers.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAILED: ${message}`);
}

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log('SprintLab Coach C-3 — offline local trigger tests\n');

const baseInput: DetectCoachTriggersInput = {
  today: '2026-08-15',
  weekDays: [],
  recentSessions: [],
  readiness: null,
  priorityMeet: null,
};

function byType(triggers: CoachTrigger[], type: CoachTrigger['type']) {
  return triggers.find(trigger => trigger.type === type);
}

// 1. no relevant conditions -> no trigger
check('no signals -> no triggers', () => {
  const triggers = detectCoachTriggers(baseInput);
  assert(triggers.length === 0, `expected no triggers, got ${triggers.length}`);
});

// 2. one recent missed workout -> missed trigger
check('one missed workout yesterday -> missed_workout trigger', () => {
  const triggers = detectCoachTriggers({
    ...baseInput,
    weekDays: [
      { date: '2026-08-12', status: 'completed' },
      { date: '2026-08-14', status: 'missed' },
      { date: '2026-08-15', status: 'today' },
    ],
  });
  const trigger = byType(triggers, 'missed_workout');
  assert(!!trigger, 'expected a missed_workout trigger');
  assert(trigger!.id === 'missed_workout:2026-08-14', `unexpected id ${trigger!.id}`);
  assert(trigger!.priority === 'medium', `expected medium priority, got ${trigger!.priority}`);
  assert(trigger!.suggestedPrompt.length > 0, 'expected a non-empty suggestedPrompt');
});

// 3. old missed workout -> no stale trigger
check('a single missed workout from 5 days ago -> no trigger', () => {
  const triggers = detectCoachTriggers({
    ...baseInput,
    weekDays: [
      { date: '2026-08-10', status: 'missed' },
      { date: '2026-08-15', status: 'today' },
    ],
  });
  assert(!byType(triggers, 'missed_workout'), 'expected no missed_workout for a stale single miss');
});

// multiple recent misses -> multiple_missed_sessions instead of a single missed_workout
check('two missed days this week -> multiple_missed_sessions, not missed_workout', () => {
  const triggers = detectCoachTriggers({
    ...baseInput,
    weekDays: [
      { date: '2026-08-10', status: 'missed' },
      { date: '2026-08-12', status: 'missed' },
      { date: '2026-08-15', status: 'today' },
    ],
  });
  const trigger = byType(triggers, 'multiple_missed_sessions');
  assert(!!trigger, 'expected a multiple_missed_sessions trigger');
  assert(trigger!.priority === 'high', `expected high priority, got ${trigger!.priority}`);
  assert(!byType(triggers, 'missed_workout'), 'expected no separate missed_workout when multiple applies');
});

check('completed/upcoming/rest days never trigger missed_workout', () => {
  const triggers = detectCoachTriggers({
    ...baseInput,
    weekDays: [
      { date: '2026-08-14', status: 'completed' },
      { date: '2026-08-15', status: 'today' },
      { date: '2026-08-16', status: 'upcoming' },
      { date: '2026-08-17', status: 'rest' },
    ],
  });
  assert(!byType(triggers, 'missed_workout'), 'expected no missed_workout trigger');
});

// 4. high RPE -> high-RPE trigger
check('most recent session RPE 9/10 -> high_rpe trigger', () => {
  const triggers = detectCoachTriggers({
    ...baseInput,
    recentSessions: [{ id: 'log-1', date: '2026-08-14', rpe: 9 }],
  });
  const trigger = byType(triggers, 'high_rpe');
  assert(!!trigger, 'expected a high_rpe trigger');
  assert(trigger!.id === 'high_rpe:log-1', `unexpected id ${trigger!.id}`);
  assert(trigger!.entityId === 'log-1', `expected entityId to be the training log id, got ${trigger!.entityId}`);
});

// 5. normal RPE -> no trigger
check('most recent session RPE 6/10 -> no high_rpe trigger', () => {
  const triggers = detectCoachTriggers({
    ...baseInput,
    recentSessions: [{ id: 'log-1', date: '2026-08-14', rpe: 6 }],
  });
  assert(!byType(triggers, 'high_rpe'), 'expected no high_rpe trigger for a normal session');
});

// 6. low readiness -> readiness trigger
check('red readiness -> high-priority low_readiness trigger', () => {
  const triggers = detectCoachTriggers({ ...baseInput, readiness: { level: 'red' } });
  const trigger = byType(triggers, 'low_readiness');
  assert(!!trigger, 'expected a low_readiness trigger');
  assert(trigger!.priority === 'high', `expected high priority for red, got ${trigger!.priority}`);
});

check('yellow readiness -> medium-priority low_readiness trigger', () => {
  const triggers = detectCoachTriggers({ ...baseInput, readiness: { level: 'yellow' } });
  const trigger = byType(triggers, 'low_readiness');
  assert(!!trigger, 'expected a low_readiness trigger');
  assert(trigger!.priority === 'medium', `expected medium priority for yellow, got ${trigger!.priority}`);
});

// 7. normal readiness -> no trigger
check('green readiness -> no low_readiness trigger', () => {
  const triggers = detectCoachTriggers({ ...baseInput, readiness: { level: 'green' } });
  assert(!byType(triggers, 'low_readiness'), 'expected no low_readiness trigger for green');
});

// 8. repeated demanding sessions -> appropriate trigger
check('2 of the last 3 sessions at RPE >= 8 -> repeated_high_effort trigger', () => {
  const triggers = detectCoachTriggers({
    ...baseInput,
    recentSessions: [
      { id: 'log-3', date: '2026-08-14', rpe: 8 },
      { id: 'log-2', date: '2026-08-12', rpe: 5 },
      { id: 'log-1', date: '2026-08-10', rpe: 9 },
    ],
  });
  const trigger = byType(triggers, 'repeated_high_effort');
  assert(!!trigger, 'expected a repeated_high_effort trigger');
  assert(trigger!.id === 'repeated_high_effort:log-3', `expected the most recent qualifying session, got ${trigger!.id}`);
});

check('only 1 of the last 3 sessions at RPE >= 8 -> no repeated_high_effort trigger', () => {
  const triggers = detectCoachTriggers({
    ...baseInput,
    recentSessions: [
      { id: 'log-3', date: '2026-08-14', rpe: 8 },
      { id: 'log-2', date: '2026-08-12', rpe: 5 },
      { id: 'log-1', date: '2026-08-10', rpe: 4 },
    ],
  });
  assert(!byType(triggers, 'repeated_high_effort'), 'expected no repeated_high_effort trigger');
});

check('a 4th-oldest demanding session outside the lookback window does not count', () => {
  const triggers = detectCoachTriggers({
    ...baseInput,
    recentSessions: [
      { id: 'log-4', date: '2026-08-15', rpe: 3 },
      { id: 'log-3', date: '2026-08-13', rpe: 3 },
      { id: 'log-2', date: '2026-08-11', rpe: 3 },
      { id: 'log-1', date: '2026-08-09', rpe: 9 },
    ],
  });
  assert(!byType(triggers, 'repeated_high_effort'), 'expected the 4th session to fall outside the 3-session lookback');
});

// meet_approaching
check('an A-priority meet within a week -> meet_approaching, low priority', () => {
  const triggers = detectCoachTriggers({
    ...baseInput,
    priorityMeet: { id: 'meet-1', name: 'State Qualifier', date: '2026-08-20', priority: 'A', daysAway: 5 },
  });
  const trigger = byType(triggers, 'meet_approaching');
  assert(!!trigger, 'expected a meet_approaching trigger');
  assert(trigger!.priority === 'low', `expected low priority, got ${trigger!.priority}`);
  assert(trigger!.id === 'meet_approaching:meet-1', `unexpected id ${trigger!.id}`);
});

check('a C-priority meet never triggers meet_approaching', () => {
  const triggers = detectCoachTriggers({
    ...baseInput,
    priorityMeet: { id: 'meet-2', name: 'Dual Meet', date: '2026-08-20', priority: 'C', daysAway: 5 },
  });
  assert(!byType(triggers, 'meet_approaching'), 'expected no meet_approaching for a C meet');
});

check('a meet more than a week away never triggers meet_approaching', () => {
  const triggers = detectCoachTriggers({
    ...baseInput,
    priorityMeet: { id: 'meet-3', name: 'State Qualifier', date: '2026-09-05', priority: 'A', daysAway: 21 },
  });
  assert(!byType(triggers, 'meet_approaching'), 'expected no meet_approaching more than a week out');
});

check('a meet that already passed never triggers meet_approaching', () => {
  const triggers = detectCoachTriggers({
    ...baseInput,
    priorityMeet: { id: 'meet-4', name: 'Last Week Meet', date: '2026-08-08', priority: 'A', daysAway: -7 },
  });
  assert(!byType(triggers, 'meet_approaching'), 'expected no meet_approaching for a past meet');
});

// 9. multiple triggers -> deterministic highest-priority selection
check('multiple active signals: high priority wins, then recency', () => {
  const triggers = detectCoachTriggers({
    today: '2026-08-15',
    weekDays: [{ date: '2026-08-14', status: 'missed' }], // medium (missed_workout)
    recentSessions: [{ id: 'log-1', date: '2026-08-14', rpe: 9 }], // medium (high_rpe)
    readiness: { level: 'red' }, // high (low_readiness)
    priorityMeet: { id: 'meet-1', name: 'State Qualifier', date: '2026-08-19', priority: 'B', daysAway: 4 }, // low
  });
  assert(triggers.length === 4, `expected all four signals active, got ${triggers.length}`);
  assert(triggers[0].type === 'low_readiness', `expected low_readiness (high priority) first, got ${triggers[0].type}`);
  assert(triggers[triggers.length - 1].type === 'meet_approaching', `expected meet_approaching (low priority) last, got ${triggers[triggers.length - 1].type}`);
});

check('two high-priority triggers: most recent date wins the tiebreak', () => {
  const triggers = detectCoachTriggers({
    today: '2026-08-15',
    weekDays: [
      { date: '2026-08-11', status: 'missed' },
      { date: '2026-08-13', status: 'missed' },
    ], // multiple_missed_sessions, high, date 2026-08-13
    recentSessions: [],
    readiness: { level: 'red' }, // low_readiness, high, date 2026-08-15
    priorityMeet: null,
  });
  assert(triggers[0].type === 'low_readiness', `expected the more recent high-priority trigger first, got ${triggers[0].type}`);
});

check('selectActiveCoachTrigger picks the highest-priority trigger from the sorted list', () => {
  const triggers = detectCoachTriggers({
    ...baseInput,
    readiness: { level: 'red' },
    priorityMeet: { id: 'meet-1', name: 'State Qualifier', date: '2026-08-19', priority: 'A', daysAway: 4 },
  });
  const active = selectActiveCoachTrigger(triggers, []);
  assert(active?.type === 'low_readiness', `expected low_readiness selected, got ${active?.type}`);
});

// 10. dismissed trigger -> does not immediately return
check('a dismissed trigger id is skipped by selectActiveCoachTrigger', () => {
  const triggers = detectCoachTriggers({ ...baseInput, readiness: { level: 'red' } });
  const trigger = triggers[0];
  const active = selectActiveCoachTrigger(triggers, [trigger.id]);
  assert(active === null, `expected no active trigger once dismissed, got ${active?.id}`);
});

// 11. new instance of same trigger type -> can appear
check('dismissing one occurrence does not suppress a later, different occurrence of the same type', () => {
  const yesterdayTriggers = detectCoachTriggers({ ...baseInput, readiness: { level: 'red' } });
  const yesterdayId = yesterdayTriggers[0].id;

  const todayTriggers = detectCoachTriggers({ ...baseInput, today: '2026-08-16', readiness: { level: 'red' } });
  const active = selectActiveCoachTrigger(todayTriggers, [yesterdayId]);
  assert(active !== null, 'expected a new-day low_readiness occurrence to still be eligible');
  assert(active!.id !== yesterdayId, 'expected a distinct id for the new occurrence');
});

check('dismissing one missed-workout date does not suppress a later missed-workout date', () => {
  const first = detectCoachTriggers({
    ...baseInput,
    today: '2026-08-15',
    weekDays: [{ date: '2026-08-14', status: 'missed' }],
  });
  const firstId = first[0].id;

  const second = detectCoachTriggers({
    ...baseInput,
    today: '2026-08-20',
    weekDays: [{ date: '2026-08-19', status: 'missed' }],
  });
  const active = selectActiveCoachTrigger(second, [firstId]);
  assert(active !== null, 'expected the later missed-workout occurrence to still be eligible');
});

console.log(`\n${passed} assertions passed.`);
