import {
  RepFeeling,
  ResultChangeReason,
  TrackConditions,
  TrackConditionType,
} from '@/types';

export const trackConditionOptions: { value: TrackConditionType; label: string }[] = [
  { value: 'indoor', label: 'Indoor' },
  { value: 'no-gauge', label: 'No wind gauge' },
  { value: 'still', label: 'Still' },
  { value: 'headwind', label: 'Headwind' },
  { value: 'tailwind', label: 'Tailwind' },
  { value: 'measured', label: 'Measured' },
];

export const repFeelingOptions: { value: RepFeeling; label: string }[] = [
  { value: 'smooth', label: 'Smooth' },
  { value: 'flat', label: 'Flat' },
  { value: 'tight', label: 'Tight' },
  { value: 'stopped', label: 'Stopped' },
];

export const resultChangeReasonOptions: { value: ResultChangeReason; label: string }[] = [
  { value: 'tightness-or-pain', label: 'Tightness / pain' },
  { value: 'fatigue', label: 'Fatigue' },
  { value: 'coach-adjustment', label: 'Coach adjustment' },
  { value: 'weather', label: 'Weather' },
  { value: 'equipment-or-space', label: 'Equipment / space' },
  { value: 'time-or-schedule', label: 'Time / schedule' },
  { value: 'other', label: 'Other' },
];

export const changeReasonLabels = Object.fromEntries(
  resultChangeReasonOptions.map(option => [option.value, option.label]),
) as Record<ResultChangeReason, string>;

export function formatTrackConditions(conditions?: TrackConditions) {
  if (!conditions) return 'Not recorded';
  const label = trackConditionOptions.find(option => option.value === conditions.type)?.label ?? conditions.type;
  if (conditions.type === 'measured' && conditions.measuredWind !== undefined) {
    return `${label} · ${conditions.measuredWind > 0 ? '+' : ''}${conditions.measuredWind} m/s`;
  }
  return label;
}
