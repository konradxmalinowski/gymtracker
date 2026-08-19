/**
 * `local_date` (`YYYY-MM-DD`) arithmetic, duplicated from
 * `features/statistics/domain/localDate.ts` rather than imported from it -
 * which itself deliberately duplicates `features/home/domain/
 * StreakCalculator.ts`'s primitives rather than importing them, for the same
 * reason: ARCHITECTURE.md section 9.1's module dependency graph forbids
 * `calendar` depending on `statistics` or `home` (`plans/
 * 2026-08-19-p12-calendar.md`'s Step 0 decision 3). All three files are
 * simply a transcription of the same timezone-free `YYYY-MM-DD` calendar
 * arithmetic (the string itself is already user-timezone-safe per the schema
 * convention), so they can only drift if that convention itself changes -
 * the same reasoning `features/records/domain/Estimated1RM.ts`'s header
 * comment gives for its own deliberately duplicated `SET_TYPES` union.
 *
 * Adds three primitives beyond `statistics/domain/localDate.ts`'s own set -
 * `endOfMonth`, `addMonthsToLocalDate`, `isSameYearMonth`,
 * `generateDateRange` - this feature's own month-navigation and year-view
 * gap-filling need them where `statistics` never did.
 */

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Parses a `YYYY-MM-DD` string as a UTC midnight `Date` - never the host's local timezone, so calendar-day arithmetic is stable regardless of where the app runs. */
export function parseLocalDate(localDate: string): Date {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

/** Formats a UTC-midnight `Date` (as produced by {@link parseLocalDate}/{@link addDaysToLocalDate}) back to `YYYY-MM-DD`. */
export function formatLocalDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Adds (or, with a negative count, subtracts) whole calendar days to a `YYYY-MM-DD` string. */
export function addDaysToLocalDate(localDate: string, days: number): string {
  const date = parseLocalDate(localDate);
  date.setUTCDate(date.getUTCDate() + days);
  return formatLocalDate(date);
}

/** The Monday-anchored ISO week start for a `YYYY-MM-DD` string - matches `statistics/domain/localDate.ts`'s week convention, so the two features' calendar grids never disagree about which day a week starts on. */
export function startOfIsoWeek(localDate: string): string {
  const date = parseLocalDate(localDate);
  const isoDayOfWeek = (date.getUTCDay() + 6) % 7; // 0 = Monday
  date.setUTCDate(date.getUTCDate() - isoDayOfWeek);
  return formatLocalDate(date);
}

/** The first day (`YYYY-MM-01`) of the calendar month a `YYYY-MM-DD` string falls in. */
export function startOfMonth(localDate: string): string {
  return `${localDate.slice(0, 7)}-01`;
}

/** The last day of the calendar month a `YYYY-MM-DD` string falls in - one day before the following month's 1st, computed via {@link addDaysToLocalDate} rather than a hardcoded days-per-month table so leap Februaries are handled for free. */
export function endOfMonth(localDate: string): string {
  const [year, month] = localDate.split('-').map(Number);
  const nextMonth = month! === 12 ? 1 : month! + 1;
  const nextYear = month! === 12 ? year! + 1 : year!;
  const firstOfNextMonth = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return addDaysToLocalDate(firstOfNextMonth, -1);
}

/**
 * Adds (or, with a negative count, subtracts) whole calendar months to a
 * `YYYY-MM-DD` string, preserving the day-of-month where the target month is
 * long enough and clamping to that month's last day otherwise (e.g. 31
 * January + 1 month -> 28/29 February, never a rollover into March) - the
 * standard calendar-navigation semantics, not a raw 30-day addition. Powers
 * `CalendarScreen`'s month-navigation controls (plan's "twelve months of
 * navigation" acceptance line).
 */
export function addMonthsToLocalDate(localDate: string, months: number): string {
  const [year, month, day] = localDate.split('-').map(Number);
  const totalMonthsFromEpoch = year! * 12 + (month! - 1) + months;
  const targetYear = Math.floor(totalMonthsFromEpoch / 12);
  const targetMonth = (totalMonthsFromEpoch % 12) + 1;
  const clampedDay = Math.min(day!, daysInMonth(targetYear, targetMonth));
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

/** Number of days in `month` (1-12) of `year`, leap-year-aware. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `true` when both `YYYY-MM-DD` strings fall in the same calendar year and month - used to mark a month grid's leading/trailing cells (from an adjacent month) as `isCurrentMonth: false`. */
export function isSameYearMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** Every `YYYY-MM-DD` date from `localDateFrom` to `localDateTo`, inclusive, ascending, gap-free - the shared primitive `generateMonthGrid`'s current-month span and the year view's 365/366-day span both build on, so there is exactly one "walk a date range" loop in this feature rather than one per caller. */
export function generateDateRange(localDateFrom: string, localDateTo: string): string[] {
  const dates: string[] = [];
  let cursor = localDateFrom;
  while (cursor <= localDateTo) {
    dates.push(cursor);
    cursor = addDaysToLocalDate(cursor, 1);
  }
  return dates;
}
