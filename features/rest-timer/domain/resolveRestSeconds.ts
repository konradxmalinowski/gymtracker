/**
 * Rest-duration resolution order (`docs/ROADMAP.md` P7 acceptance criteria,
 * `plans/2026-08-08-p7-rest-timer.md` Step 0 decision log): an exercise-level
 * override wins, then the plan day's own rest target, then the app-wide
 * default. This is the ONLY place the three-tier precedence is implemented -
 * `features/workout-logging`'s repository/service layer calls this rather
 * than reimplementing the precedence inline (see the plan's "Module
 * dependency graph constraint" section for the two known call sites this is
 * meant to close: `startFromPlanDay` and `addExercise` in
 * `SqliteWorkoutSessionRepository`).
 */
export interface RestSecondsResolutionInput {
  /** `exercise_user_data.default_rest_seconds` for the exercise being logged - `null` if the user never set a per-exercise override. */
  exerciseDefaultSeconds: number | null;
  /** `plan_day_exercise.rest_seconds` for the plan day this set came from - `null` for a manually added exercise (no plan day at all) or a plan day that left it unset. */
  planDaySeconds: number | null;
  /** `timer.defaultRestSeconds` read from settings - always a concrete number (the settings schema default-fallbacks a missing/corrupt stored value), so this function always resolves to a real value. */
  globalDefaultSeconds: number;
}

/** Resolves which rest duration, in seconds, a set completion should start counting down from. */
export function resolveRestSeconds(input: RestSecondsResolutionInput): number {
  if (input.exerciseDefaultSeconds !== null) {
    return input.exerciseDefaultSeconds;
  }
  if (input.planDaySeconds !== null) {
    return input.planDaySeconds;
  }
  return input.globalDefaultSeconds;
}
