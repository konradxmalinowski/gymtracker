/**
 * `Clock` - ARCHITECTURE.md section 8.4 / 9. The single seam every "what time is
 * it" read in the app goes through, so streak/timer logic and repository
 * timestamp stamping are deterministic in tests (no direct `Date.now()` calls
 * outside this module and its implementations).
 *
 * `localDate`/`timezoneOffsetMinutes` exist here, not as free functions, because
 * ADR-0002 decision 2 requires `local_date` to be "computed in the user's
 * timezone at write time, never recomputed" - the repository base
 * (`repositories/base/BaseSqliteRepository.ts`) needs exactly this, and a real
 * device's timezone is itself a fact about "now" that a test must be able to
 * fake alongside the timestamp.
 */

export interface Clock {
  /** Epoch milliseconds, UTC. The only sanctioned replacement for `Date.now()`. */
  now(): number;

  /**
   * `YYYY-MM-DD` in the timezone the JS runtime is currently configured for, for
   * the given instant (defaults to `now()`). ADR-0002 decision 2: frozen at write
   * time, never recomputed from a UTC timestamp later.
   */
  localDate(at?: number): string;

  /**
   * Offset from UTC in minutes, positive east of UTC (UTC+2 -> 120), for the
   * given instant (defaults to `now()`). Companion to `local_date` on
   * `workout_session.tz_offset_minutes` (ARCHITECTURE.md section 7.6) so a future
   * feature can reconstruct absolute local time.
   */
  timezoneOffsetMinutes(at?: number): number;
}
