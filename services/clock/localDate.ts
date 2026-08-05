/**
 * Pure helpers shared by every `Clock` implementation, so `SystemClock` and
 * `FixedClock` cannot drift in how they compute the same thing.
 *
 * Deliberately uses `Date`'s *local* getters (`getFullYear`/`getMonth`/`getDate`),
 * which already reflect whatever timezone the JS runtime is configured for - on
 * device that is the phone's timezone, in Node/Jest it is `process.env.TZ`
 * (or the host's default). No `Intl` needed for this.
 */

export function computeLocalDate(epochMs: number): string {
  const date = new Date(epochMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * `Date.prototype.getTimezoneOffset()` returns minutes *behind* UTC (positive
 * west of UTC, e.g. UTC-5 -> +300). We negate it so the sign matches how offsets
 * are normally written (UTC+2 -> 120), matching `workout_session.tz_offset_minutes`.
 */
export function computeTimezoneOffsetMinutes(epochMs: number): number {
  return -new Date(epochMs).getTimezoneOffset();
}
