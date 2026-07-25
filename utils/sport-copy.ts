import type { AthleteProfile, AthleteSport, DistanceUnit, SpeedPathway } from '@/types';

export const productDescription = 'SprintLab is a speed-development platform for athletes. It combines personalized workout planning, workout execution, training logs, progress tracking, and eventually adaptive coaching to help athletes accelerate faster, reach higher speeds, and transfer speed to their sport.';
export const compactProductDescription = 'Speed training built for athletes.';

const sportNames: Record<AthleteSport, string> = {
  'track-and-field': 'Track and field', football: 'Football', soccer: 'Soccer', basketball: 'Basketball', baseball: 'Baseball', softball: 'Softball', lacrosse: 'Lacrosse', rugby: 'Rugby', volleyball: 'Volleyball', 'general-athletic-performance': 'General athletic performance', other: 'Other sport',
};

export const sportLabel = (sport?: AthleteSport) => sportNames[sport ?? 'track-and-field'];
export const isTrackAthlete = (profile?: Pick<AthleteProfile, 'sport'> | null) => (profile?.sport ?? 'track-and-field') === 'track-and-field';
export const distanceLabel = (value: number, unit: DistanceUnit) => `${value}${unit === 'yards' ? ' yd' : ' m'}`;

export function performanceLabel(profile?: Pick<AthleteProfile, 'sport' | 'primaryPerformanceTest' | 'trackProfile'> | null) {
  if (!profile?.sport || profile.sport === 'track-and-field') return profile?.trackProfile?.primaryEvent ? `Best ${profile.trackProfile.primaryEvent}` : 'Best performance';
  if (profile.primaryPerformanceTest?.name) return `Best ${profile.primaryPerformanceTest.name}`;
  if (profile.sport === 'football') return 'Best 40-yard dash';
  if (profile.sport === 'basketball') return 'Best court sprint';
  return 'Best performance';
}

export function competitionModeLabel(profile?: Pick<AthleteProfile, 'sport'> | null) {
  if (isTrackAthlete(profile)) return 'Meet Mode';
  if (profile?.sport === 'football') return 'Combine Mode';
  if (profile?.sport && profile.sport !== 'general-athletic-performance' && profile.sport !== 'other') return 'Competition Week';
  return 'Performance Test Mode';
}

export function pathwayLabel(pathway: SpeedPathway) {
  return ({ 'track-short-sprint': 'Track short sprint', 'track-long-sprint': 'Track long sprint', 'linear-acceleration': 'Linear acceleration', 'maximum-velocity': 'Maximum velocity', 'multidirectional-field-sport': 'Multidirectional field sport', 'repeated-sprint-field-sport': 'Repeated sprint field sport', 'court-speed': 'Court speed', 'combine-preparation': 'Combine preparation', 'general-speed-development': 'General speed development', 'logging-only': 'Logging only' } as Record<SpeedPathway, string>)[pathway];
}
