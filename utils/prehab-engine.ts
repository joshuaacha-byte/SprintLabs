import { prehabRecommendationLibrary } from '@/data/prehab-library';
import type {
  PainArea,
  PrehabArea,
  PrehabContext,
  PrehabEvaluation,
  PrehabRecommendationCard,
  ReadinessLocation,
} from '@/types';

const locationArea: Partial<Record<ReadinessLocation, PrehabArea>> = {
  hamstring: 'hamstring',
  'achilles-calf': 'calf-achilles-shin',
  shin: 'calf-achilles-shin',
  'groin-hip-flexor': 'adductor-groin',
  'foot-ankle': 'ankle-foot',
};

const cautionArea: Partial<Record<PainArea, PrehabArea>> = {
  hamstring: 'hamstring',
  achilles: 'calf-achilles-shin',
  calf: 'calf-achilles-shin',
  shin: 'calf-achilles-shin',
  groin: 'adductor-groin',
  'hip-flexor': 'hip-pelvis',
  hip: 'hip-pelvis',
  foot: 'ankle-foot',
  ankle: 'ankle-foot',
  'lower-back': 'trunk',
};

const safetyMessage =
  'Optional training support only. SprintLab does not diagnose injuries, clear return to sport, or replace qualified medical care.';

function deterministicRank(cards: PrehabRecommendationCard[], context: PrehabContext) {
  const highSpeed = ['acceleration', 'maximum-velocity', 'starts', 'testing'].includes(context.sessionCategory ?? '');
  const meetSoon = context.daysToPriorityMeet !== null
    && context.daysToPriorityMeet !== undefined
    && context.daysToPriorityMeet >= 0
    && context.daysToPriorityMeet <= 3;
  const preferred = highSpeed
    ? ['PRE-08', 'PRE-05', 'PRE-10', 'PRE-09']
    : ['PRE-09', 'PRE-10', 'PRE-06', 'PRE-07', 'PRE-05'];
  return [...cards]
    .sort((first, second) => {
      const firstIndex = preferred.indexOf(first.id);
      const secondIndex = preferred.indexOf(second.id);
      return (firstIndex < 0 ? 99 : firstIndex) - (secondIndex < 0 ? 99 : secondIndex)
        || first.id.localeCompare(second.id);
    })
    .filter(card => !meetSoon || !['PRE-02', 'PRE-04'].includes(card.id))
    .slice(0, 3);
}

export function evaluatePrehab(context: PrehabContext): PrehabEvaluation {
  const readiness = context.readiness;
  const restricted = Boolean(context.medicalRestrictions?.trim());
  const sharpOrSevere = readiness?.sensation === 'severe-acute'
    || readiness?.painSeverity !== undefined && readiness.painSeverity >= 7
    || readiness?.hesitatesAtMaxEffort === true
    || readiness?.readinessLevel === 'red';

  if (restricted || sharpOrSevere) {
    return {
      gate: 'stop-refer',
      title: 'No exercise recommendation',
      explanation: restricted
        ? 'A medical restriction is recorded. Follow that restriction and consult the appropriate qualified professional.'
        : 'Your check-in includes pain or movement hesitation that should not be treated as a prehab opportunity.',
      recommendations: [],
      safetyMessage,
    };
  }

  const issueArea = readiness?.location ? locationArea[readiness.location] : undefined;
  const cautionAreas = new Set((context.cautionAreas ?? []).map(area => cautionArea[area]).filter(Boolean));
  const issueReported = readiness?.hasLocalizedIssue === true
    || readiness?.sensation === 'minor-tightness'
    || readiness?.sensation === 'lingering-niggle'
    || readiness?.readinessLevel === 'yellow';
  if (issueReported) {
    const recoveryOnly = prehabRecommendationLibrary
      .filter(card => ['PRE-09', 'PRE-10'].includes(card.id))
      .filter(card => card.area !== issueArea && !cautionAreas.has(card.area));
    return {
      gate: 'modify-check',
      title: 'Modify and check first',
      explanation: 'A localized issue or reduced readiness is recorded. SprintLab will not load that area or use prehab to clear the planned session.',
      recommendations: recoveryOnly.slice(0, 2),
      safetyMessage,
    };
  }

  const normalSoreness = (readiness?.soreness ?? 0) > 0
    || (readiness?.neuralReadiness ?? 10) <= 5;
  const eligible = prehabRecommendationLibrary.filter(card => !cautionAreas.has(card.area));
  if (normalSoreness) {
    const lowCostIds = new Set(['PRE-06', 'PRE-07', 'PRE-09', 'PRE-10']);
    return {
      gate: 'normal-soreness',
      title: 'Keep it low cost',
      explanation: 'Your check-in suggests normal fatigue or soreness without a red-flag response. Only short, optional movement work is shown.',
      recommendations: deterministicRank(eligible.filter(card => lowCostIds.has(card.id)), context),
      safetyMessage,
    };
  }

  return {
    gate: 'clear',
    title: 'Optional support',
    explanation: 'No current symptom gate was triggered. These are eligible add-ons, not requirements or medical clearance.',
    recommendations: deterministicRank(eligible, context),
    safetyMessage,
  };
}

