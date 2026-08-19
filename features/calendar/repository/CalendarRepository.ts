import type { SqlExecutor } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';

/**
 * One calendar day with at least one completed, non-deleted session -
 * `monthOverview`'s per-day row. Plural fields (`sessionIds`/`planDayNames`)
 * because Step 0 decision 5 of `plans/2026-08-19-p12-calendar.md` allows
 * more than one completed session on the same `local_date` (rare same-day
 * AM/PM training) - `planDayNames` is index-aligned with `sessionIds`
 * (`planDayNames[i]` is `sessionIds[i]`'s `plan_day_name_snapshot`, `null`
 * for an empty/quick-start workout with no plan day attached, per this
 * feature's own edge-case list). `totalVolumeKg` is summed across every
 * session on that day.
 */
export interface CalendarDayDto {
  localDate: string;
  sessionIds: EntityId[];
  planDayNames: (string | null)[];
  totalVolumeKg: number;
}

/**
 * One trained day's total volume for the year view's compact heatmap -
 * deliberately the same two-field shape as `features/calendar/domain/
 * intensityBinning.ts`'s `DailyVolumePoint`, so `yearOverview`'s result
 * passes straight into `computeDayIntensities` with no per-field mapping in
 * the hooks layer.
 */
export interface CalendarYearDayDto {
  localDate: string;
  totalVolumeKg: number;
}

/**
 * `CalendarRepository` (read model, feature: `calendar`) - queries
 * `v_session_summary`/`v_working_set` directly, the same "flat DTOs, no
 * service, read the shared view" shape P10's `HomeDashboardRepository` and
 * P11's `StatisticsRepository` already established (`plans/
 * 2026-08-19-p12-calendar.md`'s Step 0 decision 2). This resolves the
 * `calendar --> workout-logging` edge ARCHITECTURE.md section 9.1 currently
 * draws as real to "never built" the same way `docs/adr/
 * 0019-home-dashboard-read-model.md` resolved the equivalent
 * `statistics --> workout-logging` edge - `calendar` depends on this
 * repository's own read of the shared views, never on `workout-logging`'s
 * services or repository directly, and never on `statistics` (see this
 * feature's own `domain/localDate.ts`/`domain/intensityBinning.ts` header
 * comments for why their math is duplicated rather than imported).
 *
 * Read-only, so - like `ExerciseHistoryRepository`/`HomeDashboardRepository`/
 * `StatisticsRepository` before it - this does not extend
 * `BaseSqliteRepository` (nothing here writes, so there is no id
 * generation/audit-stamping/soft-delete lifecycle to inherit) and has no
 * accompanying service: every method returns a flat, SQL-aggregated DTO with
 * nothing to Zod-validate on a read path. Days with no completed session are
 * simply absent from either method's result - the UI layer gap-fills the
 * full grid via this feature's own `generateMonthGrid`/`generateDateRange`
 * domain calculators, per this project's CQRS-lite rule ("never
 * load-all-then-sum-in-JS").
 */
export interface CalendarRepository {
  /**
   * One `CalendarDayDto` per day in `year`/`month` (`month` is 1-12, not
   * 0-indexed - matches this feature's own `domain/localDate.ts`/
   * `domain/monthGrid.ts` convention) with at least one completed,
   * non-deleted session, ordered by `localDate` ascending. Feeds the month
   * view's day cells (intensity, plan-day label, tap target).
   */
  monthOverview(year: number, month: number, tx?: SqlExecutor): Promise<CalendarDayDto[]>;

  /**
   * One `CalendarYearDayDto` per trained day in `year`, ordered by
   * `localDate` ascending. Feeds the compact year view's
   * `computeDayIntensities` binning and the shared `HeatmapView` renderer.
   */
  yearOverview(year: number, tx?: SqlExecutor): Promise<CalendarYearDayDto[]>;
}
