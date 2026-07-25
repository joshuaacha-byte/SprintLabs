import { ExerciseTracking, PlannedWorkout, ScheduledDay, WeekdayIndex } from '@/types';

const completion: ExerciseTracking = { kind: 'completion' };

export const todayWorkout: PlannedWorkout = {
  id: 'acceleration-lower-1',
  title: 'Acceleration + Lower Body',
  purpose: 'Build explosive first-step power and reinforce clean acceleration mechanics.',
  durationMinutes: 80,
  sections: [
    {
      title: 'Warm-up',
      exercises: [
        { id: 'easy', name: 'Easy movement', detail: '3 minutes', tracking: completion },
        { id: 'mobility', name: 'Dynamic mobility', detail: 'Hips, ankles, hamstrings', tracking: completion },
        { id: 'drills', name: 'Sprint drills', detail: 'A-march, A-skip, dribbles', tracking: completion },
        { id: 'builds', name: 'Progressive buildups', detail: '3 reps', tracking: completion },
      ],
    },
    {
      title: 'Track',
      exercises: [
        {
          id: 'starts20',
          name: '20m starts',
          detail: '4 reps at 95–100% · 2 min rest',
          tracking: { kind: 'track', reps: 4, distanceMeters: 20, targetIntensity: 98, restSeconds: 120 },
        },
        {
          id: 'accel30',
          name: '30m accelerations',
          detail: '3 reps at 95–100% · 3 min rest',
          tracking: { kind: 'track', reps: 3, distanceMeters: 30, targetIntensity: 98, restSeconds: 180 },
        },
        {
          id: 'speed60',
          name: '60m at 90%',
          detail: '2 reps · 5 min rest',
          tracking: { kind: 'track', reps: 2, distanceMeters: 60, targetIntensity: 90, restSeconds: 300 },
        },
      ],
    },
    { title: 'Plyometrics', exercises: [] },
    {
      title: 'Strength',
      exercises: [
        {
          id: 'split',
          name: 'Bulgarian split squat',
          detail: '3 × 6 each side',
          tracking: { kind: 'strength', sets: 3, targetReps: '6 each side' },
        },
        {
          id: 'rdl',
          name: 'Romanian deadlift',
          detail: '3 × 8',
          tracking: { kind: 'strength', sets: 3, targetReps: '8' },
        },
        {
          id: 'calf',
          name: 'Calf raises',
          detail: '3 × 12',
          tracking: { kind: 'strength', sets: 3, targetReps: '12' },
        },
      ],
    },
    { title: 'Conditioning', exercises: [] },
    {
      title: 'Cooldown',
      exercises: [
        { id: 'walk', name: 'Easy walk', detail: '3–5 minutes', tracking: completion },
        { id: 'coolmobility', name: 'Mobility reset', detail: 'Easy range only', tracking: completion },
      ],
    },
  ],
};

export type ExerciseSuggestion = {
  name: string;
  detail: string;
  tracking: ExerciseTracking;
};

export const exerciseSuggestions: Record<string, ExerciseSuggestion[]> = {
  'Warm-up': [
    { name: 'Dynamic mobility', detail: 'Hips, ankles, hamstrings', tracking: completion },
    { name: 'Sprint drills', detail: 'A-march, A-skip, dribbles', tracking: completion },
    { name: 'Progressive buildups', detail: '3–4 reps', tracking: completion },
  ],
  Track: [
    { name: '20m block starts', detail: '4 reps at 95–100% · full recovery', tracking: { kind: 'track', reps: 4, distanceMeters: 20, targetIntensity: 98 } },
    { name: 'Flying 20s', detail: '3 reps at 95–100% · 20m build + 20m fly', tracking: { kind: 'track', reps: 3, distanceMeters: 20, targetIntensity: 98 } },
    { name: '120m speed endurance', detail: '3 reps at 90–95% · 8 min rest', tracking: { kind: 'track', reps: 3, distanceMeters: 120, targetIntensity: 92, restSeconds: 480 } },
    { name: 'Extensive tempo', detail: '8 × 100m at 70%', tracking: { kind: 'track', reps: 8, distanceMeters: 100, targetIntensity: 70 } },
  ],
  Plyometrics: [
    { name: 'Pogo jumps', detail: '3 × 20 contacts', tracking: completion },
    { name: 'Standing broad jump', detail: '4 × 2 reps', tracking: completion },
    { name: 'Bounds', detail: '3 × 20m', tracking: completion },
  ],
  Strength: [
    { name: 'Back squat', detail: '3 × 5', tracking: { kind: 'strength', sets: 3, targetReps: '5' } },
    { name: 'Romanian deadlift', detail: '3 × 8', tracking: { kind: 'strength', sets: 3, targetReps: '8' } },
    { name: 'Bulgarian split squat', detail: '3 × 6 each side', tracking: { kind: 'strength', sets: 3, targetReps: '6 each side' } },
    { name: 'Hip thrust', detail: '3 × 8', tracking: { kind: 'strength', sets: 3, targetReps: '8' } },
  ],
  Conditioning: [
    { name: 'Bike tempo', detail: '10 × 30s easy/moderate', tracking: completion },
    { name: 'Pool recovery', detail: '15–20 minutes easy', tracking: completion },
    { name: 'General circuit', detail: '3 rounds', tracking: completion },
  ],
  Cooldown: [
    { name: 'Easy walk', detail: '3–5 minutes', tracking: completion },
    { name: 'Mobility reset', detail: 'Easy range only', tracking: completion },
    { name: 'Breathing reset', detail: '3 minutes', tracking: completion },
  ],
};

const recoveryWorkout: PlannedWorkout = {
  id: 'recovery-tempo-1',
  title: 'Recovery + Mobility',
  purpose: 'Restore movement quality and build low-intensity work capacity.',
  durationMinutes: 45,
  sections: [
    { title: 'Warm-up', exercises: [
      { id: 'recovery-walk', name: 'Easy movement', detail: '5 minutes', tracking: completion },
      { id: 'recovery-mobility', name: 'Dynamic mobility', detail: 'Hips, ankles, trunk', tracking: completion },
    ] },
    { title: 'Track', exercises: [
      { id: 'recovery-tempo', name: 'Relaxed tempo', detail: '6 × 100m at 65–70% · walk recovery', tracking: { kind: 'track', reps: 6, distanceMeters: 100, targetIntensity: 70 } },
    ] },
    { title: 'Plyometrics', exercises: [] },
    { title: 'Strength', exercises: [] },
    { title: 'Conditioning', exercises: [
      { id: 'recovery-circuit', name: 'Mobility circuit', detail: '2 easy rounds', tracking: completion },
    ] },
    { title: 'Cooldown', exercises: [
      { id: 'recovery-breathe', name: 'Breathing reset', detail: '3 minutes', tracking: completion },
    ] },
  ],
};

const maxVelocityWorkout: PlannedWorkout = {
  id: 'max-velocity-1',
  title: 'Maximum Velocity + Power',
  purpose: 'Practice upright sprint mechanics with full recovery between fast efforts.',
  durationMinutes: 75,
  sections: [
    { title: 'Warm-up', exercises: [
      { id: 'max-easy', name: 'Easy movement', detail: '5 minutes', tracking: completion },
      { id: 'max-mobility', name: 'Dynamic mobility', detail: 'Hips, ankles, hamstrings', tracking: completion },
      { id: 'max-drills', name: 'Sprint drills', detail: 'A-skip, dribbles, buildups', tracking: completion },
    ] },
    { title: 'Track', exercises: [
      { id: 'max-fly20', name: 'Flying 20s', detail: '3 reps at 95–100% · 20m build + 20m fly · full recovery', tracking: { kind: 'track', reps: 3, distanceMeters: 20, targetIntensity: 98, restSeconds: 360 } },
      { id: 'max-60', name: '60m sprints', detail: '2 reps at 95–100% · relaxed fast mechanics', tracking: { kind: 'track', reps: 2, distanceMeters: 60, targetIntensity: 98, restSeconds: 420 } },
    ] },
    { title: 'Plyometrics', exercises: [
      { id: 'max-pogos', name: 'Pogo jumps', detail: '3 × 20 contacts', tracking: completion },
    ] },
    { title: 'Strength', exercises: [
      { id: 'max-clean', name: 'Power clean', detail: '4 × 3', tracking: { kind: 'strength', sets: 4, targetReps: '3' } },
    ] },
    { title: 'Conditioning', exercises: [] },
    { title: 'Cooldown', exercises: [
      { id: 'max-walk', name: 'Easy walk', detail: '5 minutes', tracking: completion },
    ] },
  ],
};

const tempoWorkout: PlannedWorkout = {
  id: 'tempo-general-1',
  title: 'Tempo + General Strength',
  purpose: 'Build rhythm and work capacity at controlled intensity.',
  durationMinutes: 60,
  sections: [
    { title: 'Warm-up', exercises: [
      { id: 'tempo-warm', name: 'Dynamic warm-up', detail: '8–10 minutes', tracking: completion },
    ] },
    { title: 'Track', exercises: [
      { id: 'tempo-100', name: '100m tempo runs', detail: '8 reps at 70% · 60s rest', tracking: { kind: 'track', reps: 8, distanceMeters: 100, targetIntensity: 70, restSeconds: 60 } },
    ] },
    { title: 'Plyometrics', exercises: [] },
    { title: 'Strength', exercises: [] },
    { title: 'Conditioning', exercises: [
      { id: 'tempo-circuit', name: 'General strength circuit', detail: '3 rounds', tracking: completion },
    ] },
    { title: 'Cooldown', exercises: [
      { id: 'tempo-cool', name: 'Mobility reset', detail: 'Easy range only', tracking: completion },
    ] },
  ],
};

const speedEnduranceWorkout: PlannedWorkout = {
  id: 'speed-endurance-1',
  title: 'Speed Endurance',
  purpose: 'Maintain sprint mechanics through longer high-quality efforts.',
  durationMinutes: 85,
  sections: [
    { title: 'Warm-up', exercises: [
      { id: 'se-warm', name: 'Full sprint warm-up', detail: '15–20 minutes', tracking: completion },
      { id: 'se-build', name: 'Progressive buildups', detail: '3 reps', tracking: completion },
    ] },
    { title: 'Track', exercises: [
      { id: 'se-120', name: '120m speed endurance', detail: '3 reps at 90–95% · 8 min rest', tracking: { kind: 'track', reps: 3, distanceMeters: 120, targetIntensity: 92, restSeconds: 480 } },
      { id: 'se-80', name: '80m relaxed fast', detail: '2 reps at 85–90% · full recovery', tracking: { kind: 'track', reps: 2, distanceMeters: 80, targetIntensity: 87, restSeconds: 360 } },
    ] },
    { title: 'Plyometrics', exercises: [] },
    { title: 'Strength', exercises: [
      { id: 'se-row', name: 'Row variation', detail: '3 × 8', tracking: { kind: 'strength', sets: 3, targetReps: '8' } },
      { id: 'se-press', name: 'Press variation', detail: '3 × 8', tracking: { kind: 'strength', sets: 3, targetReps: '8' } },
    ] },
    { title: 'Conditioning', exercises: [] },
    { title: 'Cooldown', exercises: [
      { id: 'se-cool', name: 'Easy walk', detail: '5 minutes', tracking: completion },
    ] },
  ],
};

const strengthWorkout: PlannedWorkout = {
  id: 'strength-mobility-1',
  title: 'Strength + Mobility',
  purpose: 'Develop sprint-specific strength while keeping the track load low.',
  durationMinutes: 65,
  sections: [
    { title: 'Warm-up', exercises: [
      { id: 'strength-warm', name: 'Movement preparation', detail: '8 minutes', tracking: completion },
    ] },
    { title: 'Track', exercises: [] },
    { title: 'Plyometrics', exercises: [
      { id: 'strength-jump', name: 'Standing broad jump', detail: '4 × 2 reps', tracking: completion },
    ] },
    { title: 'Strength', exercises: [
      { id: 'strength-squat', name: 'Back squat', detail: '3 × 5', tracking: { kind: 'strength', sets: 3, targetReps: '5' } },
      { id: 'strength-rdl', name: 'Romanian deadlift', detail: '3 × 8', tracking: { kind: 'strength', sets: 3, targetReps: '8' } },
      { id: 'strength-split', name: 'Bulgarian split squat', detail: '3 × 6 each side', tracking: { kind: 'strength', sets: 3, targetReps: '6 each side' } },
    ] },
    { title: 'Conditioning', exercises: [] },
    { title: 'Cooldown', exercises: [
      { id: 'strength-mobility', name: 'Mobility reset', detail: '8 minutes', tracking: completion },
    ] },
  ],
};

export const weekdayLabels: Record<WeekdayIndex, { short: string; full: string }> = {
  0: { short: 'SUN', full: 'Sunday' },
  1: { short: 'MON', full: 'Monday' },
  2: { short: 'TUE', full: 'Tuesday' },
  3: { short: 'WED', full: 'Wednesday' },
  4: { short: 'THU', full: 'Thursday' },
  5: { short: 'FRI', full: 'Friday' },
  6: { short: 'SAT', full: 'Saturday' },
};

export const defaultWeekSchedule: ScheduledDay[] = [
  { dayIndex: 1, shortLabel: 'MON', fullLabel: 'Monday', kind: 'workout', workout: todayWorkout },
  { dayIndex: 2, shortLabel: 'TUE', fullLabel: 'Tuesday', kind: 'workout', workout: recoveryWorkout },
  { dayIndex: 3, shortLabel: 'WED', fullLabel: 'Wednesday', kind: 'workout', workout: maxVelocityWorkout },
  { dayIndex: 4, shortLabel: 'THU', fullLabel: 'Thursday', kind: 'workout', workout: tempoWorkout },
  { dayIndex: 5, shortLabel: 'FRI', fullLabel: 'Friday', kind: 'workout', workout: speedEnduranceWorkout },
  { dayIndex: 6, shortLabel: 'SAT', fullLabel: 'Saturday', kind: 'workout', workout: strengthWorkout },
  { dayIndex: 0, shortLabel: 'SUN', fullLabel: 'Sunday', kind: 'rest', restTitle: 'Rest day', restNote: 'No training is scheduled. Focus on recovery and prepare for the next week.' },
];

export function createBlankWorkout(dayIndex: WeekdayIndex): PlannedWorkout {
  return {
    id: `workout-${dayIndex}-${Date.now()}`,
    title: `${weekdayLabels[dayIndex].full} workout`,
    purpose: '',
    durationMinutes: 60,
    sections: ['Warm-up', 'Track', 'Plyometrics', 'Strength', 'Conditioning', 'Cooldown'].map(title => ({ title, exercises: [] })),
  };
}
