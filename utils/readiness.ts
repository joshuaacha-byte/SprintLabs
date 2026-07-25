import {
  ReadinessDecision,
  ReadinessLevel,
  ReadinessLocation,
  ReadinessSensation,
} from '@/types';

export type ReadinessEvaluation = {
  level: ReadinessLevel;
  label: string;
  reasons: string[];
  guidance: string;
};

export const readinessLevelMeta: Record<ReadinessLevel, { label: string; shortLabel: string }> = {
  green: { label: 'Green light', shortLabel: 'Full go' },
  yellow: { label: 'Yellow light', shortLabel: 'Modify & monitor' },
  red: { label: 'Red light', shortLabel: 'Stop & reassess' },
};

export const sensationLabels: Record<ReadinessSensation, string> = {
  'minor-tightness': 'Minor tightness',
  'lingering-niggle': 'Lingering grab or niggle',
  'severe-acute': 'Severe or acute pain',
};

export const locationLabels: Record<ReadinessLocation, string> = {
  hamstring: 'Hamstring',
  'achilles-calf': 'Achilles / calf',
  shin: 'Shin',
  'groin-hip-flexor': 'Groin / hip flexor',
  'foot-ankle': 'Foot / ankle',
  other: 'Other',
};

export function evaluateReadiness(readiness: ReadinessDecision): ReadinessEvaluation {
  const redReasons: string[] = [];
  const yellowReasons: string[] = [];

  if (readiness.sensation === 'severe-acute') {
    redReasons.push('Severe or acute pain was reported.');
  }
  if (readiness.hesitatesAtMaxEffort === true) {
    redReasons.push('You expect to hesitate or hold back at maximum speed.');
  }

  if (typeof readiness.sleep === 'number' && readiness.sleep < 8) {
    yellowReasons.push(`${readiness.sleep}h sleep is below the 8h recovery target.`);
  }
  if (typeof readiness.sleepQuality === 'number' && readiness.sleepQuality <= 2) {
    yellowReasons.push('Sleep quality was low.');
  }
  if (typeof readiness.neuralReadiness === 'number' && readiness.neuralReadiness <= 5) {
    yellowReasons.push(`Explosive readiness is ${readiness.neuralReadiness}/10.`);
  }
  if (typeof readiness.focus === 'number' && readiness.focus <= 2) {
    yellowReasons.push('Mental focus is reduced today.');
  }
  if (readiness.fuelHydrated === false) {
    yellowReasons.push('Fuel or hydration is not where you want it.');
  }
  if (typeof readiness.soreness === 'number' && readiness.soreness >= 3) {
    yellowReasons.push(`General soreness is ${readiness.soreness}/5.`);
  }
  if (readiness.hasLocalizedIssue && readiness.sensation !== 'severe-acute') {
    const sensation = readiness.sensation ? sensationLabels[readiness.sensation] : 'Localized discomfort';
    const location = readiness.location === 'other' && readiness.otherLocationDetail
      ? readiness.otherLocationDetail
      : readiness.location
        ? locationLabels[readiness.location]
        : 'reported area';
    yellowReasons.push(`${sensation} reported at the ${location.toLowerCase()}.`);
  }

  if (redReasons.length > 0) {
    return {
      level: 'red',
      label: readinessLevelMeta.red.label,
      reasons: [...redReasons, ...yellowReasons],
      guidance: 'Do not begin maximal sprinting. Stop and speak with a coach, athletic trainer, or medical professional before deciding what to do next.',
    };
  }

  if (yellowReasons.length > 0) {
    return {
      level: 'yellow',
      label: readinessLevelMeta.yellow.label,
      reasons: yellowReasons,
      guidance: 'Review these flags before training. Consider reducing volume or choosing a lower-risk alternative with your coach, and reassess during warm-up.',
    };
  }

  return {
    level: 'green',
    label: readinessLevelMeta.green.label,
    reasons: ['No readiness flags were reported.'],
    guidance: 'Proceed with the planned session while continuing to monitor how you feel during warm-up.',
  };
}
