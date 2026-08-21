import {
  PainArea,
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

/** The same broad areas app/profile.tsx's onboarding training-concern step already maps to
 * PainArea — reused here for the post-session "anything bothering you?" prompt so the app asks
 * about body areas the same way everywhere. "Shoulder" is deliberately not a separate tile: the
 * PainArea taxonomy has no distinct shoulder value (it's sprint-focused), and profile.tsx's own
 * "Shoulder" option already maps to the same 'other' value as its own "Other area" option — giving
 * both a tile here would let an athlete select two visually-different options that save identically. */
export const postSessionPainAreaOptions: { label: string; value: PainArea }[] = [
  { label: 'Hamstring', value: 'hamstring' },
  { label: 'Knee', value: 'knee' },
  { label: 'Achilles or ankle', value: 'achilles' },
  { label: 'Back', value: 'lower-back' },
  { label: 'Other area', value: 'other' },
];

export const painAreaLabels: Record<PainArea, string> = {
  hamstring: 'Hamstring',
  achilles: 'Achilles',
  calf: 'Calf',
  shin: 'Shin',
  groin: 'Groin',
  'hip-flexor': 'Hip flexor',
  hip: 'Hip',
  quadriceps: 'Quadriceps',
  knee: 'Knee',
  foot: 'Foot',
  ankle: 'Ankle',
  'lower-back': 'Lower back',
  other: 'Other area',
};

export function formatTrackConditions(conditions?: TrackConditions) {
  if (!conditions) return 'Not recorded';
  const label = trackConditionOptions.find(option => option.value === conditions.type)?.label ?? conditions.type;
  if (conditions.type === 'measured' && conditions.measuredWind !== undefined) {
    return `${label} · ${conditions.measuredWind > 0 ? '+' : ''}${conditions.measuredWind} m/s`;
  }
  return label;
}
