/**
 * `local_date` (`YYYY-MM-DD`) arithmetic, duplicated from
 * `features/home/domain/StreakCalculator.ts` rather than imported from it.
 *
 * ARCHITECTURE.md section 9.1's module dependency graph is explicit that
 * nothing depends back on `home` - `statistics` importing `home`'s exported
 * `parseLocalDate`/`formatLocalDate`/`ONE_DAY_MS` would invert that edge.
 * Both files are simply a transcription of the same `YYYY-MM-DD` calendar
 * arithmetic with no timezone component (the string itself is already
 * user-timezone-safe per the schema convention), so they can only drift if
 * that convention itself changes - the same reasoning
 * `features/records/domain/Estimated1RM.ts`'s header comment gives for its
 * own deliberately duplicated `SET_TYPES` union.
 */

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Parses a `YYYY-MM-DD` string as a UTC midnight `Date` - never the host's local timezone, so calendar-day arithmetic is stable regardless of where the app runs. */
export function parseLocalDate(localDate: string): Date {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

/** Formats a UTC-midnight `Date` (as produced by {@link parseLocalDate}/{@link addDays}) back to `YYYY-MM-DD`. */
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

/** The Monday-anchored ISO week start for a `YYYY-MM-DD` string. */
export function startOfIsoWeek(localDate: string): string {
  const date = parseLocalDate(localDate);
  const isoDayOfWeek = (date.getUTCDay() + 6) % 7; // 0 = Monday
  date.setUTCDate(date.getUTCDate() - isoDayOfWeek);
  return formatLocalDate(date);
}

/** The first day of the calendar month a `YYYY-MM-DD` string falls in. */
export function startOfMonth(localDate: string): string {
  return `${localDate.slice(0, 7)}-01`;
}

/** `true` when `localDate` (`YYYY-MM-DD`) falls within a leap year. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
