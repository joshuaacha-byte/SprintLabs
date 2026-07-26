import type { PainArea } from './domain';
import type { ReadinessDecision } from './index';

export type PrehabGate = 'stop-refer' | 'modify-check' | 'normal-soreness' | 'clear';

export type PrehabArea =
  | 'hamstring'
  | 'adductor-groin'
  | 'calf-achilles-shin'
  | 'ankle-foot'
  | 'hip-pelvis'
  | 'dynamic-warmup'
  | 'mobility'
  | 'trunk';

export type PrehabRecommendationCard = {
  id: string;
  name: string;
  area: PrehabArea;
  purpose: string;
  exercises: string[];
  dosage: string;
  placement: string;
  eligibility: string[];
  exclusions: string[];
  sourceIds: string[];
  estimatedMinutes: number;
};

export type PrehabEvaluation = {
  gate: PrehabGate;
  title: string;
  explanation: string;
  recommendations: PrehabRecommendationCard[];
  safetyMessage: string;
};

export type PrehabContext = {
  readiness?: ReadinessDecision | null;
  cautionAreas?: PainArea[];
  medicalRestrictions?: string;
  coachRestrictions?: string;
  sessionCategory?: string;
  daysToPriorityMeet?: number | null;
};

export type SavedPrehabChoice = {
  id: string;
  cardId: string;
  date: string;
  action: 'saved' | 'added' | 'dismissed';
  createdAt: string;
};
