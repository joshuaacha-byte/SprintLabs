// Offline tests for SprintLab Coach UI Phase C-2's pure helpers (utils/coach.ts). No network,
// no AsyncStorage, no Gemini call — covers proposal-card display text and conversation-history
// bounding, which is exactly the logic a live/mocked Gemini response exercises downstream.
// Usage: node --experimental-strip-types --loader ./scripts/alias-loader.mjs ./scripts/verify-coach-proposal.ts
import { boundedHistory, describeProposal, MAX_HISTORY_MESSAGES } from '../utils/coach.ts';
import type { PlanChangeProposal } from '../types/index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAILED: ${message}`);
}

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log('SprintLab Coach C-2 — offline proposal/history tests\n');

check('describeProposal: move_workout resolves weekday labels', () => {
  const proposal: PlanChangeProposal = { type: 'move_workout', date: '2026-08-17', toDate: '2026-08-18', workoutId: 'w1', reason: 'Missed Friday.' };
  const display = describeProposal(proposal, { currentTitle: 'Speed Endurance' });
  assert(display.actionLabel === 'MOVE WORKOUT', `expected MOVE WORKOUT, got ${display.actionLabel}`);
  assert(display.subjectTitle === 'Speed Endurance', `expected resolved title, got ${display.subjectTitle}`);
  assert(display.fromLabel === 'Monday', `2026-08-17 is a Monday, got ${display.fromLabel}`);
  assert(display.toLabel === 'Tuesday', `2026-08-18 is a Tuesday, got ${display.toLabel}`);
});

check('describeProposal: replace_workout shows current -> new title', () => {
  const proposal: PlanChangeProposal = { type: 'replace_workout', date: '2026-08-17', workoutId: 'w1', newWorkoutId: 'LIB-02', reason: 'Better fit.' };
  const display = describeProposal(proposal, { currentTitle: 'Old Session', newTitle: 'New Session' });
  assert(display.fromLabel === 'Old Session', `expected Old Session, got ${display.fromLabel}`);
  assert(display.toLabel === 'New Session', `expected New Session, got ${display.toLabel}`);
});

check('describeProposal: adjust_volume shows percentage change', () => {
  const proposal: PlanChangeProposal = { type: 'adjust_volume', date: '2026-08-17', workoutId: 'w1', modifier: 0.75, reason: 'Reduce load.' };
  const display = describeProposal(proposal, { currentTitle: 'Max Velocity' });
  assert(display.fromLabel === '100% volume', `expected 100% volume baseline, got ${display.fromLabel}`);
  assert(display.toLabel === '75% volume', `expected 75% volume, got ${display.toLabel}`);
});

check('describeProposal: add_recovery_day falls back to a default title', () => {
  const proposal: PlanChangeProposal = { type: 'add_recovery_day', date: '2026-08-17', reason: 'Soreness trend.' };
  const display = describeProposal(proposal, { currentTitle: 'Tempo Session' });
  assert(display.toLabel === 'Recovery day', `expected default recovery title, got ${display.toLabel}`);
});

check('describeProposal: remove_future_workout targets rest day', () => {
  const proposal: PlanChangeProposal = { type: 'remove_future_workout', date: '2026-08-17', workoutId: 'w1', reason: 'Overreaching.' };
  const display = describeProposal(proposal, { currentTitle: 'Speed Endurance' });
  assert(display.toLabel === 'Rest day', `expected Rest day, got ${display.toLabel}`);
});

check('describeProposal: never crashes without resolved titles (falls back gracefully)', () => {
  const proposal: PlanChangeProposal = { type: 'move_workout', date: '2026-08-17', toDate: '2026-08-18', reason: 'x' };
  const display = describeProposal(proposal);
  assert(display.subjectTitle === 'This session', `expected fallback subject, got ${display.subjectTitle}`);
});

check('boundedHistory: caps to MAX_HISTORY_MESSAGES most recent text turns', () => {
  const messages = Array.from({ length: 20 }, (_, i) => ({ kind: i % 2 === 0 ? 'athlete' : 'split', text: `msg-${i}` }));
  const history = boundedHistory(messages);
  assert(history.length === MAX_HISTORY_MESSAGES, `expected ${MAX_HISTORY_MESSAGES} entries, got ${history.length}`);
  assert(history[history.length - 1].text === 'msg-19', `expected the most recent message last, got ${history[history.length - 1].text}`);
});

check('boundedHistory: excludes proposal and error kinds', () => {
  const messages = [
    { kind: 'athlete', text: 'a1' },
    { kind: 'proposal', text: 'should be excluded' },
    { kind: 'error', text: 'should be excluded too' },
    { kind: 'split', text: 's1' },
  ];
  const history = boundedHistory(messages);
  assert(history.length === 2, `expected only athlete/split turns, got ${history.length}`);
  assert(history.every(turn => turn.text === 'a1' || turn.text === 's1'), 'expected only a1/s1 in bounded history');
});

console.log(`\n${passed} assertions passed.`);
