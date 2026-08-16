import { useMemo } from 'react';

export type Palette = {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentDark: string;
  /** Restrained success green for confirmations where lime would be ambiguous or overused. */
  success: string;
  orange: string;
  red: string;
};

/** Tokens per SprintLab-UX-Design-Doctrine.md: lime is a spotlight, not wallpaper — reserve `accent` for the single most important action/value per screen. */
export function createPalette(scheme: 'light' | 'dark' | null | undefined): Palette {
  const light = scheme === 'light';
  return {
    bg: light ? '#F4F7F1' : '#080D12',
    surface: light ? '#FFFFFF' : '#111922',
    surface2: light ? '#E8EEE5' : '#18232E',
    border: light ? '#CBD5C6' : '#243341',
    text: light ? '#101710' : '#F4F7F8',
    muted: light ? '#5F6D61' : '#8FA1B2',
    accent: '#C9FF18',
    accentDark: light ? '#E4F2B2' : '#1B2500',
    success: light ? '#1F8A4C' : '#4ADE80',
    orange: '#FF8A3D',
    red: '#FF6262',
  };
}

/**
 * Reactive palette: re-resolves whenever the OS/app color scheme changes, unlike a static import.
 *
 * Light mode is temporarily disabled (inconsistent contrast across several screens) — this
 * always resolves to dark regardless of OS/app scheme. `createPalette`'s light branch and the
 * Settings appearance picker are left in place, just not reachable, so this is easy to re-enable.
 */
export function useTheme(): Palette {
  return useMemo(() => createPalette('dark'), []);
}
