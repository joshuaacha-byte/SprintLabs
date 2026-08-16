import type { SprintEvent } from '@/types';

export type TrackPerformanceInputRange = {
  minimum: number;
  maximum: number;
  suggested: number;
};

export const TRACK_PERFORMANCE_INPUT_RANGES = {
  '60m': { minimum: 5, maximum: 30, suggested: 8 },
  '100m': { minimum: 8, maximum: 60, suggested: 12 },
  '200m': { minimum: 15, maximum: 120, suggested: 24 },
  '400m': { minimum: 30, maximum: 300, suggested: 60 },
} as const satisfies Partial<Record<SprintEvent, TrackPerformanceInputRange>>;

export type SupportedTrackPerformanceEvent = keyof typeof TRACK_PERFORMANCE_INPUT_RANGES;

function isSupportedTrackPerformanceEvent(event: SprintEvent): event is SupportedTrackPerformanceEvent {
  return event in TRACK_PERFORMANCE_INPUT_RANGES;
}

/** Falls back to the widest known range for events outside the primary onboarding set (e.g. hurdles, 300m) so callers never crash on an out-of-range lookup. */
export function getTrackPerformanceInputRange(
  event: SprintEvent,
): TrackPerformanceInputRange {
  return isSupportedTrackPerformanceEvent(event) ? TRACK_PERFORMANCE_INPUT_RANGES[event] : TRACK_PERFORMANCE_INPUT_RANGES['400m'];
}

export function isTrackPerformanceWithinInputRange(
  event: SprintEvent,
  timeSeconds: number,
): boolean {
  const { minimum, maximum } = getTrackPerformanceInputRange(event);
  return Number.isFinite(timeSeconds)
    && timeSeconds > 0
    && timeSeconds >= minimum
    && timeSeconds <= maximum;
}
