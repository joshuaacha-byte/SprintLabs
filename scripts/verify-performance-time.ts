import {
  getTrackPerformanceInputRange,
  isTrackPerformanceWithinInputRange,
  TRACK_PERFORMANCE_INPUT_RANGES,
  type SupportedTrackPerformanceEvent,
} from '../utils/performance-time.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function roundTrip(event: SupportedTrackPerformanceEvent, timeSeconds: number) {
  const saved = JSON.stringify({ personalBests: [{ event, timeSeconds }] });
  return JSON.parse(saved) as { personalBests: { event: SupportedTrackPerformanceEvent; timeSeconds: number }[] };
}

assert(isTrackPerformanceWithinInputRange('60m', 6.85), '60m 6.85 must be accepted.');
assert(isTrackPerformanceWithinInputRange('60m', 7.99), '60m 7.99 must be accepted.');
assert(isTrackPerformanceWithinInputRange('60m', 8), '60m 8.00 must be accepted.');
assert(!isTrackPerformanceWithinInputRange('60m', 4.99), '60m below 5.00 must be blocked.');
assert(!isTrackPerformanceWithinInputRange('60m', 30.01), '60m above 30.00 must be blocked.');

const reopenedSixty = roundTrip('60m', 6.85);
assert(reopenedSixty.personalBests[0].timeSeconds === 6.85, 'A saved sub-8 60m time must reopen unchanged.');

assert(isTrackPerformanceWithinInputRange('100m', 8), 'A within-limit 100m time must not be blocked by warning thresholds.');
assert(!isTrackPerformanceWithinInputRange('100m', 7.99), '100m below the broad 8.00 input limit must be blocked.');

assert(isTrackPerformanceWithinInputRange('400m', 65.2), '400m 65.20 must be accepted.');
const reopenedFourHundred = roundTrip('400m', 65.2);
assert(
  reopenedFourHundred.personalBests[0].timeSeconds.toFixed(2) === '65.20',
  'A saved 400m 65.20 must display as 65.20.',
);

(['60m', '100m', '200m', '400m'] as const).forEach(event => {
  const range = getTrackPerformanceInputRange(event);
  assert(isTrackPerformanceWithinInputRange(event, range.minimum), `${event} minimum must be inclusive.`);
  assert(isTrackPerformanceWithinInputRange(event, range.maximum), `${event} maximum must be inclusive.`);
  assert(!isTrackPerformanceWithinInputRange(event, 0), `${event} zero must be blocked.`);
  assert(!isTrackPerformanceWithinInputRange(event, Number.NaN), `${event} nonnumeric values must be blocked.`);
});

assert(
  TRACK_PERFORMANCE_INPUT_RANGES['200m'].maximum > 59.99
    && TRACK_PERFORMANCE_INPUT_RANGES['400m'].maximum > 59.99,
  '200m and 400m ranges must support times above 59.99 seconds.',
);

// Primary and secondary PB entry both consume this same range table and shared wheel.
const primaryRange = getTrackPerformanceInputRange('60m');
const secondaryRange = getTrackPerformanceInputRange('60m');
assert(primaryRange === secondaryRange, 'Primary and secondary event entries must share one range configuration.');

console.log('Performance-time input range verification passed.');
