/**
 * Current consecutive-day training streak (P10, home dashboard).
 *
 * Pure calendar-date-string arithmetic only - never `Date.now()`/`new Date()`
 * with no arguments, and never a local-timezone-sensitive day step. Per
 * ADR-0002, `local_date` is an opaque `YYYY-MM-DD` string computed once at
 * write time and never recomputed from a `Date` in the user's current
 * timezone; this calculator honors that by parsing/formatting through
 * `Date.UTC` purely as a calendar-math scratch value, never comparing it
 * against wall-clock time. That also means DST transitions are a non-issue
 * here - there is no timezone conversion in this file at all.
 */

/**
 * `ONE_DAY_MS`/`parseLocalDate`/`formatLocalDate` are exported (not just
 * `previousLocalDate`-private) so `features/home/hooks/useHomeDashboard.ts`'s
 * own calendar math (`addDays`, week-start resolution for the weekly-summary
 * range) can build on this single implementation instead of duplicating it -
 * both live in the same feature, so this widens no cross-feature boundary,
 * and `calculateStreak`'s own behavior/tests are unchanged by this export.
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

function previousLocalDate(localDate: string): string {
  return formatLocalDate(parseLocalDate(localDate) - ONE_DAY_MS);
}

/**
 * `trainedLocalDates` are the `local_date`s of completed sessions - callers
 * are not required to dedupe or sort first (a `Set` lookup makes both free
 * here). `todayLocalDate` is the caller's injected `Clock`'s current
 * `local_date`, never computed inside this function.
 *
 * Grace rule: a day with no completed session yet does not, by itself, break
 * the streak - it only breaks once a full calendar day has passed with zero
 * completed sessions. So: if `todayLocalDate` has a completed session, count
 * it and walk backward; if not, skip today (not a break) and start the walk
 * from yesterday instead. Either way, the walk stops at the first day with no
 * completed session.
 */
export function calculateStreak(
  trainedLocalDates: readonly string[],
  todayLocalDate: string,
): number {
  const trainedDates = new Set(trainedLocalDates);

  let cursor = trainedDates.has(todayLocalDate)
    ? todayLocalDate
    : previousLocalDate(todayLocalDate);

  let streak = 0;
  while (trainedDates.has(cursor)) {
    streak += 1;
    cursor = previousLocalDate(cursor);
  }

  return streak;
}
