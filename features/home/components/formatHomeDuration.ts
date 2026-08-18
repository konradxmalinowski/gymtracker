import { formatSessionDurationSeconds } from '@/features/workout-logging';

/**
 * Display-only duration formatting for `LastWorkoutCard`/`WeeklySummaryCard`.
 * Re-exported under a `home`-local name (rather than importing
 * `formatSessionDurationSeconds` directly at each call site) purely so both
 * cards keep one consistent import path within this feature - the
 * implementation itself now lives in `workout-logging`'s barrel, not
 * duplicated here (`home` already depends on `workout-logging` per
 * ARCHITECTURE.md section 9.1's dependency graph).
 */
export function formatHomeDurationSeconds(totalSeconds: number): string {
  return formatSessionDurationSeconds(totalSeconds);
}
