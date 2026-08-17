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

/** Shared geometry for the floating bottom tab bar (app/(tabs)/_layout.tsx) so anything else
 * anchored to the bottom of a tab screen — currently just components/coach-launcher.tsx — can
 * compute the same clearance above it instead of duplicating/drifting magic numbers. */
export const FLOATING_TAB_BAR = {
  /** The bar's own height, excluding the safe-area gap beneath it. Tall enough for an icon plus
   * a full label with symmetric top/bottom breathing room — see app/(tabs)/_layout.tsx's
   * tabBarStyle padding and tabBarLabelStyle's explicit lineHeight, which is what actually keeps
   * the label from clipping against this box (a bare fontSize with no lineHeight can render
   * taller than expected on some platforms/accessibility text-size settings). */
  height: 76,
  /** Visible gap between the safe-area bottom and the bar, so it reads as detached/floating. */
  bottomGap: 14,
  horizontalInset: 16,
  borderRadius: 24,
};
