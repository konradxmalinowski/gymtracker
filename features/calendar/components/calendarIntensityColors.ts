import { color } from '@/theme/tokens';

import type { HeatmapLevel } from '../domain/intensityBinning';

/**
 * The quartile intensity ramp shared by `CalendarDayCell` (month view) and
 * `CalendarLegend` - levels 1-3 as `rgba` alpha steps of `color.success`,
 * level 4 the solid token, level 0 transparent. This project's flat,
 * dark-only token set has no pre-built 4-step intensity scale to reference
 * instead of deriving one from `color.success`; `components/charts/
 * HeatmapView.tsx`'s own `LEVEL_COLOR` map uses the exact same ramp for the
 * same reason, but exports no per-level color of its own (only the
 * whole-canvas `HeatmapView` component), so this feature keeps its own copy
 * rather than importing one that doesn't exist - kept in sync with that
 * file by eye.
 *
 * Extracted to this single shared location (rather than each of
 * `CalendarDayCell.tsx`/`CalendarLegend.tsx` defining its own copy) so the
 * two in-feature call sites can't drift from each other, even if they can
 * still drift from `HeatmapView.tsx`'s independent copy.
 */
export const CALENDAR_LEVEL_BACKGROUND: Record<HeatmapLevel, string> = {
  0: 'transparent',
  1: 'rgba(61,220,132,0.28)',
  2: 'rgba(61,220,132,0.52)',
  3: 'rgba(61,220,132,0.76)',
  4: color.success,
};
