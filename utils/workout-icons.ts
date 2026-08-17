import type { ComponentProps } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

export type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

/**
 * The one deliberate "general training" icon used anywhere a more specific workout/category icon
 * isn't available. Communicates "general training category," never "we couldn't find the icon" —
 * reuse this constant instead of inventing another ad-hoc default or falling through to an
 * unvalidated string (see sectionIconName below for why that matters: an icon name that doesn't
 * exist in the MaterialIcons glyph set silently renders as a missing-glyph box on device, which
 * reads to an athlete exactly like a broken question-mark placeholder).
 */
export const WORKOUT_ICON_FALLBACK: MaterialIconName = 'sports';

/**
 * Workout-section icon by title — Warm-up/Track (Sprinting)/Plyometrics/Strength/
 * Conditioning (Core)/Cooldown and their common aliases. The single source app/workout.tsx and
 * app/workout-builder.tsx both read from, so a renamed, aliased, or unrecognized custom section
 * title can never fall through to a missing glyph — previously app/workout.tsx had its own
 * duplicate mapping that used different icon choices than workout-builder.tsx's for the same
 * sections, had no "conditioning/core" case at all, and defaulted unrecognized titles to the
 * string 'exercise' — not a real MaterialIcons glyph name, so it rendered broken on device.
 */
export function sectionIconName(title: string): MaterialIconName {
  const normalized = title.toLowerCase();
  if (normalized.includes('warm')) return 'directions-walk';
  if (normalized.includes('track') || normalized.includes('sprint')) return 'speed';
  if (normalized.includes('plyo')) return 'keyboard-double-arrow-up';
  if (normalized.includes('strength')) return 'fitness-center';
  if (normalized.includes('condition') || normalized.includes('core')) return 'monitor-heart';
  if (normalized.includes('cool')) return 'self-improvement';
  return WORKOUT_ICON_FALLBACK;
}
