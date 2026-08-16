// Single source of truth for where the persistent Coach launcher appears. Deliberately an
// allowlist (default-hidden) rather than a denylist: a route nobody has reviewed for Coach
// suitability yet — a new modal flow, a future full-screen experience — stays hidden until
// someone deliberately adds it here, instead of silently gaining a floating button.
//
// Add a route by adding one line here. Never branch per-screen launcher/overlay logic elsewhere.

const VISIBLE_SURFACES: Record<string, string> = {
  '/': 'today',
  '/plan': 'plan',
  '/history': 'history',
  '/progress': 'progress',
  '/library': 'library',
  '/library-detail': 'library-detail',
  '/history-detail': 'history-detail',
};

/** Returns the Coach "surface" name for a pathname (from expo-router's usePathname()), or null if the launcher should be hidden on this route. */
export function getCoachSurface(pathname: string): string | null {
  return VISIBLE_SURFACES[pathname] ?? null;
}
