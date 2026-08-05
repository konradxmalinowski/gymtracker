/**
 * theme/tokens.ts - the single source of truth for design tokens
 * (ARCHITECTURE.md section 11.1).
 *
 * Two runtimes read this file: `tailwind.config.js` (via jiti, so NativeWind
 * class names resolve to these values) and any imperative code that cannot
 * resolve Tailwind classes (Reanimated worklets, Skia paints, chart
 * components) via a direct `import { color } from '@/theme/tokens'`.
 * Duplicating a value in either consumer instead of reading it from here is
 * the mistake this file exists to prevent.
 *
 * The app is dark-only (product brief), so tokens are flat - no light/dark
 * map. This is deliberately a minimal, honest subset for P0 (just enough to
 * paint a real dark background with real text on the bootstrap Home screen).
 * The full palette (borders, surfaces ladder, semantic success/warning/danger,
 * set-type badges, chart hues - ARCHITECTURE.md section 11.2) is P1's job to
 * add to this same file, not to recreate elsewhere.
 */

export const color = {
  background: '#09090B',
  textPrimary: '#F4F4F5',
  textSecondary: '#A1A1AA',
  accent: '#4C8DFF',
} as const;
