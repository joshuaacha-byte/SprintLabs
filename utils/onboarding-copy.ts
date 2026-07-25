import type { AthleteProfile, AthleteSport, SpeedGoal } from '@/types';
import { sportPathway } from '@/utils/athlete-profile';

const sportNames: Record<AthleteSport, string> = {
  'track-and-field': 'track athlete', football: 'football athlete', soccer: 'soccer athlete', basketball: 'basketball athlete', baseball: 'baseball athlete', softball: 'softball athlete', lacrosse: 'lacrosse athlete', rugby: 'rugby athlete', volleyball: 'volleyball athlete', 'general-athletic-performance': 'speed athlete', other: 'athlete',
};

const goalNames: Record<SpeedGoal, string> = {
  'first-step-quickness': 'first-step quickness', acceleration: 'acceleration', 'maximum-velocity': 'maximum velocity', 'multidirectional-speed': 'change of direction', 'repeated-sprint-ability': 'repeated sprint ability', 'speed-endurance': 'speed endurance', 'explosive-power': 'explosive power', 'combine-testing': 'testing performance', 'track-race-performance': 'track race performance', 'general-speed-development': 'general speed',
};

export function sportReaction(sport: AthleteSport) {
  if (sport === 'track-and-field') return 'Perfect. Your events and training season will shape the setup.';
  if (sport === 'football') return 'Got it. We’ll keep acceleration, top speed, and testing goals in view.';
  if (sport === 'general-athletic-performance') return 'Works for me. We’ll build around the speed qualities you care about.';
  return 'Nice. We’ll keep the focus on speed that transfers to your sport.';
}

export function splitContextLine(profile: AthleteProfile) {
  if (profile.trackAccess === 'none') return 'No track? That’s fine. We’ll work with the space you have.';
  if ((profile.sportPracticeDays?.length ?? 0) >= 3) return 'Your sport schedule is already demanding. I’ll avoid stacking unnecessary work.';
  if (profile.trainingPlanMode === 'log-coach-plan' || profile.followsCoachCreatedPlan) return 'Perfect. I’ll help you execute and log training without replacing your coach.';
  if (profile.experienceLevel === 'beginner' || profile.experienceLevel === 'developing') return 'We’ll start simple and build quality before volume.';
  if (profile.experienceLevel === 'advanced' || profile.experienceLevel === 'elite') return 'Good. I’ll keep the setup detailed and performance-focused.';
  return 'The better the context, the cleaner your speed profile becomes.';
}

export function profileSummary(profile: AthleteProfile) {
  const name = profile.name.trim() || 'You';
  const sport = profile.primarySport ?? profile.sport ?? 'track-and-field';
  const role = sport === 'track-and-field' ? [profile.primaryEvent, ...profile.secondaryEvents].join('/') : profile.sportPosition || sportNames[sport];
  const goals = (profile.speedGoals ?? []).slice(0, 3).map(goal => goalNames[goal]).join(', ');
  const days = profile.availableTrainingDays.length || profile.trainingDaysPerWeek;
  return `${name === 'You' ? 'You’re' : `${name} is`} a ${role} ${sportNames[sport]} focused on ${goals || 'speed development'} with ${days} available training day${days === 1 ? '' : 's'} each week.`;
}

export function classificationExplanation(profile: AthleteProfile) {
  const pathway = sportPathway(profile).replaceAll('-', ' ');
  return `Your current speed pathway is ${pathway}. It reflects your sport, goals, and training context—not a generated plan.`;
}
