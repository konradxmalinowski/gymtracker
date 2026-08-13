/**
 * `EstimatedCalories` - P9's calorie estimate for the workout summary screen.
 * See `docs/adr/0018-estimated-calories-formula.md` for the full decision
 * record; the short version: a flat kcal-per-minute constant applied to
 * `durationSeconds` (the same `duration_seconds` `SessionTotals.ts` already
 * computes, which already excludes paused time by construction), with no
 * bodyweight or intensity input - this app has no bodyweight tracking until
 * P13, and adding one solely to unblock this estimate would be scope creep
 * for a value the summary screen labels "estimate" and ships off by default
 * (D-04, `workout.showEstimatedCalories`) regardless of the constant chosen.
 */

/**
 * Kcal burned per minute of logged training time, applied flat regardless of
 * exercise, load, or user bodyweight. This is a deliberately rough,
 * documented estimate, not a precision claim - resistance training generally
 * burns somewhere in the 3-7 kcal/minute range depending on bodyweight and
 * intensity; 5 sits in the middle of that range as a defensible single
 * number until a future phase (P13 body-metrics) can make this
 * bodyweight-aware. Named and exported, per this codebase's convention for
 * any calculator constant (compare `REST_SECONDS_MIN`/`REST_SECONDS_MAX` in
 * `repositories/settings/settingsSchema.ts`), so it is never re-typed as a
 * magic number at a call site.
 */
export const CALORIES_PER_MINUTE = 5;

/**
 * Estimated calories burned over `durationSeconds` of logged training time,
 * rounded to the nearest whole kcal - `workout_session.estimated_kcal` is an
 * `INTEGER` column. Never negative: a non-finite or non-positive duration
 * (a clock anomaly, or a session with `duration_seconds` clamped to 0 by
 * `sessionDurationSeconds`) returns 0 rather than a negative or NaN value.
 */
export function estimatedCalories(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 0;
  }
  return Math.round((durationSeconds / 60) * CALORIES_PER_MINUTE);
}
