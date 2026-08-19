/**
 * Public barrel for the "calendar" feature.
 *
 * This is the ONLY surface other features may import from (ARCHITECTURE.md
 * section 3.1, rule 4 - enforced by the import/no-restricted-paths zones in
 * eslint.config.js). Reaching into "features/calendar/<subfolder>/..." from any
 * other feature is a lint error; import from "@/features/calendar" instead.
 *
 * P12 step 1 (`plans/2026-08-19-p12-calendar.md`): only the pure domain
 * calculators and the read-model repository's interface/DTOs are exported
 * here - never `SqliteCalendarRepository` (not built yet; a later step's
 * job), the same "never the Sqlite implementation class" rule every other
 * feature barrel in this codebase follows. There is no accompanying service
 * (nothing to Zod-validate on a read-only path), mirroring
 * `HomeDashboardRepository`/`StatisticsRepository`'s own precedent.
 *
 * This feature's low-level `domain/localDate.ts` calendar-math primitives
 * (`parseLocalDate`, `addDaysToLocalDate`, etc.) are deliberately NOT
 * re-exported here, matching `home`'s and `statistics`' own barrels: they
 * are internal building blocks for `generateMonthGrid`/`computeDayIntensities`
 * and this feature's own future hooks, not part of the cross-feature surface.
 *
 * Step 3 (`plans/2026-08-19-p12-calendar.md`) adds the hooks
 * (`useCalendarMonth`/`useCalendarYear`) to this barrel - components/screens
 * still aren't barrel-exported. Screens are never barrel-exported in this
 * codebase at all (confirmed against every existing feature's own barrel
 * before writing this one) - `app/profile/calendar.tsx` imports
 * `CalendarScreen` by direct file path instead, the same precedent
 * `ProfileScreen`/`PersonalRecordsScreen`/`StatisticsScreen` already
 * established. `features/calendar/components/*` are likewise not
 * barrel-exported - nothing outside this feature renders them directly,
 * mirroring `statistics`'s own component barrel omission.
 */

export type { CalendarDayCell } from './domain/monthGrid';
export { generateMonthGrid } from './domain/monthGrid';

export type { HeatmapLevel, DailyVolumePoint, DayIntensity } from './domain/intensityBinning';
export { computeDayIntensities } from './domain/intensityBinning';

export type {
  CalendarRepository,
  CalendarDayDto,
  CalendarYearDayDto,
} from './repository/CalendarRepository';

export { calendarKeys } from './hooks/calendarKeys';
export { useCalendarMonth } from './hooks/useCalendarMonth';
export type { CalendarMonthDayCell } from './hooks/useCalendarMonth';
export { useCalendarYear } from './hooks/useCalendarYear';
