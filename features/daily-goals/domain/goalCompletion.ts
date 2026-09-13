/**
 * Derived completion state (ADR-0017 Decision 2 / ARCHITECTURE.md section
 * 7.12): `daily_goal_entry` stores only a raw `progress_value` - whether a
 * given day counts as "done" is always computed here, never read from a
 * stored flag, the same "pure calculator over persisted values" pattern this
 * codebase already uses for `SetVolume`/`Estimated1RM`/`StreakCalculator`.
 */

/** Mirrors `daily_goal.goal_type`'s own `CHECK (goal_type IN ('boolean','counter','numeric'))`. */
export type GoalType = 'boolean' | 'counter' | 'numeric';

/**
 * `boolean` goals complete at `progressValue >= 1` (a boolean goal's progress
 * is either 0 or 1 - never fractional - but this uses `>=` rather than `=== 1`
 * so a stray larger value, e.g. from a bulk import, still reads as complete
 * rather than incomplete).
 *
 * `counter`/`numeric` goals complete once `progressValue >= targetValue`.
 * `targetValue` is always non-null for these two goal types per
 * `daily_goal`'s own `CHECK (goal_type = 'boolean' OR target_value IS NOT
 * NULL)` constraint, but this function stays defensive rather than asserting
 * - a `null` target reads as "never complete" instead of throwing, since a
 * pure calculator should not fail loudly over a state the schema itself is
 * supposed to prevent from ever reaching it.
 */
export function isGoalComplete(
  goalType: GoalType,
  targetValue: number | null,
  progressValue: number,
): boolean {
  if (goalType === 'boolean') {
    return progressValue >= 1;
  }
  return targetValue !== null && progressValue >= targetValue;
}
