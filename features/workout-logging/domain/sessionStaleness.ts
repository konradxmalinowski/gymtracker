/**
 * ADR-0005 supporting mechanism 7 (stale session policy):
 *
 * > If an `in_progress` session's `started_at` is older than
 * > `workout.staleAfterHours` (default 12), the resume prompt becomes
 * > finish-or-discard rather than a silent resume, so a workout forgotten
 * > overnight does not report a 14-hour duration.
 *
 * (The ADR says "default 12"; `repositories/settings/settingsSchema.ts` ships
 * the key with a default of 6. The setting is authoritative - this function
 * never assumes a default, it is always told the threshold.)
 *
 * Pure so the boundary condition is testable without a database or a clock;
 * `WorkoutSessionService` calls it with the value it read from
 * `SettingsRepository`.
 */
export interface SessionStalenessInput {
  startedAt: number;
  now: number;
  staleAfterHours: number;
}

const MS_PER_HOUR = 60 * 60 * 1000;

/** `true` once at least `staleAfterHours` have elapsed since `startedAt`. Exactly-at-the-threshold counts as stale. */
export function isSessionStale(input: SessionStalenessInput): boolean {
  const thresholdMs = input.staleAfterHours * MS_PER_HOUR;
  return input.now - input.startedAt >= thresholdMs;
}
