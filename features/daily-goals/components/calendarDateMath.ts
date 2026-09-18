/**
 * Pure `YYYY-MM-DD` arithmetic for `DailyGoalsScreen`'s Day/Week/Month
 * calendar views (`CalendarDateHeader`/`WeekGoalGrid`/`MonthGoalCalendar`).
 * Built on `../domain/localDate.ts`'s own `parseLocalDate`/`formatLocalDate`/
 * `ONE_DAY_MS` and `../domain/weekdayBitmask.ts`'s `weekdayIndexOf` rather
 * than reinventing date parsing - this file only adds the small set of
 * calendar-navigation operations (week/month bounds, month-grid bounds,
 * month stepping) those two files don't already provide, none of which is a
 * domain calculator in its own right (no completion/streak logic lives
 * here), so it stays under `components/` rather than `domain/`.
 */

import { formatLocalDate, ONE_DAY_MS, parseLocalDate } from '../domain/localDate';
import { weekdayIndexOf } from '../domain/weekdayBitmask';

export type DailyGoalsViewMode = 'day' | 'week' | 'month';

export function addDays(localDate: string, days: number): string {
  return formatLocalDate(parseLocalDate(localDate) + days * ONE_DAY_MS);
}

/** The Monday on or before `localDate` - this feature's own Monday-based week convention (`weekdayBitmask.ts`'s own header comment). */
export function startOfWeek(localDate: string): string {
  return addDays(localDate, -weekdayIndexOf(localDate));
}

/** The Sunday on or after `localDate` - `startOfWeek(localDate)` plus 6 days. */
export function endOfWeek(localDate: string): string {
  return addDays(startOfWeek(localDate), 6);
}

function daysInMonth(year: number, month1Based: number): number {
  // Day 0 of the *next* month is the last day of `month1Based` - a
  // long-standing `Date` idiom, safe here since only `getUTCDate()` is read
  // off the result, never a full date string.
  return new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
}

export function startOfMonth(localDate: string): string {
  return `${localDate.slice(0, 7)}-01`;
}

/** Adds whole calendar months to `localDate`, clamping the day-of-month so e.g. Jan 31 + 1 month lands on Feb 28/29 rather than overflowing into March. */
export function addMonths(localDate: string, months: number): string {
  const year = Number(localDate.slice(0, 4));
  const month0Based = Number(localDate.slice(5, 7)) - 1 + months;
  const day = Number(localDate.slice(8, 10));

  const targetYear = year + Math.floor(month0Based / 12);
  const targetMonth1Based = (((month0Based % 12) + 12) % 12) + 1;
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth1Based));

  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth1Based).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

/** The Monday on/before the 1st of `localDate`'s month - a full 6-week (42-day) grid's start, so the month view's leading days borrowed from the previous month render too, matching `features/calendar`'s own month-grid convention. */
export function monthGridStart(localDate: string): string {
  return startOfWeek(startOfMonth(localDate));
}

/** `monthGridStart(localDate)` plus 41 days - a full 6-week (42-cell) grid. */
export function monthGridEnd(localDate: string): string {
  return addDays(monthGridStart(localDate), 41);
}
