import { addDaysToLocalDate, endOfMonth, startOfIsoWeek } from './localDate';

export interface CalendarDayCell {
  /** `YYYY-MM-DD`. */
  localDate: string;
  /** `false` for a leading/trailing day borrowed from the previous or next month to fill a full week. */
  isCurrentMonth: boolean;
}

/**
 * Generates a gap-free, full-week calendar grid for `year`/`month` (`month`
 * is 1-12) - the standard "leading days from the previous month, every day
 * of this month, trailing days from the next month" shape, always a whole
 * number of Monday-anchored weeks (4 to 6, i.e. 28 to 42 cells - a
 * non-leap February whose 1st falls on a Monday, e.g. 1993-02, needs zero
 * leading and zero trailing filler days and produces the 28-cell minimum)
 * so the UI layer never has to special-case a ragged first or last row.
 *
 * Follows `features/statistics/domain/dateRangeBuckets.ts`'s own precedent
 * (see that file's header comment): every date-range decision happens here,
 * in JS, over cheap `YYYY-MM-DD` string arithmetic - never a second,
 * independently hand-written SQL date-bucket expression.
 * `CalendarRepository.monthOverview` only ever returns days that actually
 * have a completed session; this function is what gap-fills the empty days
 * into a real, contiguous grid for rendering (the plan's "a month with no
 * workouts renders cleanly" acceptance line depends on this returning a full
 * grid even when the repository call returns an empty array).
 */
export function generateMonthGrid(year: number, month: number): CalendarDayCell[] {
  const monthStart = formatMonthStart(year, month);
  const monthEnd = endOfMonth(monthStart);
  const gridStart = startOfIsoWeek(monthStart);
  const gridEnd = addDaysToLocalDate(startOfIsoWeek(monthEnd), 6);

  const cells: CalendarDayCell[] = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    cells.push({
      localDate: cursor,
      isCurrentMonth: cursor >= monthStart && cursor <= monthEnd,
    });
    cursor = addDaysToLocalDate(cursor, 1);
  }
  return cells;
}

function formatMonthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}
