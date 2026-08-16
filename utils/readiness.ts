import {
  PlannedWorkout,
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
  requiresWarmupReassessment: boolean;
  maximalSprintRestricted: boolean;
};

export type ReadinessBaseline = {
  sampleCount: number;
  averageSleep?: number;
  averageNeuralReadiness?: number;
  averageSoreness?: number;
};

export const readinessLevelMeta: Record<ReadinessLevel, { label: string; shortLabel: string }> = {
  green: { label: 'Green light', shortLabel: 'Full go' },
  yellow: { label: 'Yellow light', shortLabel: 'Modify & monitor' },
  red: { label: 'Red light', shortLabel: 'Stop & reassess' },
};

export const sensationLabels: Record<ReadinessSensation, string> = {
  'minor-tightness': 'Minor tightness',
  'lingering-niggle': 'Lingering discomfort',
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

export function evaluateReadiness(
  readiness: ReadinessDecision,
  baseline?: ReadinessBaseline,
): ReadinessEvaluation {
  const redReasons: string[] = [];
  const yellowReasons: string[] = [];

  if (readiness.sensation === 'severe-acute') {
    redReasons.push('Severe or acute pain was reported.');
  }
  if (readiness.hesitatesAtMaxEffort === true) {
    redReasons.push('You expect to hesitate or hold back at maximum speed.');
  }
  if (readiness.warmupReassessment === 'worse') {
    redReasons.push('The issue or readiness signal became worse during warm-up.');
  }

  if (typeof readiness.sleep === 'number') {
    const comparison = baseline?.sampleCount && baseline.averageSleep !== undefined
      ? baseline.averageSleep
      : 8;
    if (readiness.sleep < comparison - 1) {
      yellowReasons.push(
        baseline?.sampleCount
          ? `${readiness.sleep}h sleep is more than an hour below your recent ${comparison.toFixed(1)}h average.`
          : `${readiness.sleep}h sleep is below the initial recovery reference. Personal comparisons replace this after more logs.`,
      );
    }
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
  if (readiness.foodStatus === 'underfueled') {
    yellowReasons.push('You reported eating less than normal for this point in your day.');
  }
  if (readiness.hydrated === false) {
    yellowReasons.push('Hydration is below your normal preparation.');
  }
  if (!readiness.foodStatus && readiness.fuelHydrated === false) {
    yellowReasons.push('Fuel or hydration is below your normal preparation.');
  }
  if (typeof readiness.soreness === 'number' && readiness.soreness >= 3) {
    yellowReasons.push(`General soreness is ${readiness.soreness}/5.`);
  }
  const maximalSprintRestricted = (readiness.soreness ?? 0) >= 5
    || readiness.hesitatesAtMaxEffort === true
    || readiness.sensation === 'severe-acute'
    || readiness.warmupReassessment === 'worse';
  if ((readiness.soreness ?? 0) >= 5) {
    yellowReasons.push('Severe general soreness means maximal sprinting stays out today, even if warm-up feels better.');
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
      requiresWarmupReassessment: false,
      maximalSprintRestricted: true,
    };
  }

  if (yellowReasons.length > 0) {
    return {
      level: 'yellow',
      label: readinessLevelMeta.yellow.label,
      reasons: yellowReasons,
      guidance: readiness.warmupReassessment
        ? readiness.warmupReassessment === 'better'
          ? 'Warm-up improved the signal, but the recorded flags still matter. Use the listed restriction and keep monitoring.'
          : 'Warm-up did not improve the signal. Modify the session and do not treat this check as medical clearance.'
        : 'Complete your normal warm-up, then record whether the flagged issue feels better, the same, or worse before starting the planned session.',
      requiresWarmupReassessment: !readiness.warmupReassessment,
      maximalSprintRestricted,
    };
  }

  return {
    level: 'green',
    label: readinessLevelMeta.green.label,
    reasons: ['No readiness flags were reported.'],
    guidance: 'Proceed with the planned session while continuing to monitor how you feel during warm-up.',
    requiresWarmupReassessment: false,
    maximalSprintRestricted: false,
  };
}

export function workoutIncludesMaximalSprinting(workout?: PlannedWorkout | null) {
  if (!workout) return false;
  return workout.sections.some(section => section.exercises.some(exercise =>
    exercise.tracking.kind === 'track'
    && (exercise.tracking.targetIntensity ?? 0) >= 90
  ));
}
