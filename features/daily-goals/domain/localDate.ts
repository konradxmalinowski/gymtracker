/**
 * `local_date` (`YYYY-MM-DD`) arithmetic, duplicated from
 * `features/home/domain/StreakCalculator.ts` rather than imported from it -
 * `daily-goals` is a total leaf (ARCHITECTURE.md section 9.1: "depends on
 * nothing else"), so importing `home`'s exports would invert that edge. This
 * is the same deliberate, small duplication `features/statistics/domain/
 * localDate.ts` and `features/calendar/domain/localDate.ts` already make for
 * the identical dependency-graph reason - all four files are simply a
 * transcription of the same timezone-free `YYYY-MM-DD` calendar arithmetic,
 * which can only drift if that underlying convention itself changes (the same
 * reasoning `features/records/domain/Estimated1RM.ts`'s header comment gives
 * for its own deliberately duplicated `SET_TYPES` union).
 *
 * Only what this feature's own domain/service calculators need is duplicated
 * here - `parseLocalDate`/`formatLocalDate`/`ONE_DAY_MS`, matching
 * `StreakCalculator`'s own `Date.UTC`-based epoch-ms shape rather than
 * `statistics`'/`calendar`'s `Date`-object shape, since `weekdayBitmask.ts`
 * only ever needs `getUTCDay()` off the result and `DailyReminderService`'s
 * own "walk every day in a range" loop (`getReminderStats`) only ever needs
 * to step by whole days.
 */

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function parseLocalDate(localDate: string): number {
  const parts = localDate.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  return Date.UTC(year, month - 1, day);
}

export function formatLocalDate(epochMs: number): string {
  const date = new Date(epochMs);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Every `YYYY-MM-DD` from `from` to `to`, inclusive, ascending. Empty if `from` is after `to`. */
export function enumerateLocalDates(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = parseLocalDate(from);
  const end = parseLocalDate(to);
  while (cursor <= end) {
    dates.push(formatLocalDate(cursor));
    cursor += ONE_DAY_MS;
  }
  return dates;
}
