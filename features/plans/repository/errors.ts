/**
 * Repository-layer error for `SqlitePlanRepository.setSupersetGroup()`'s
 * same-day guard (this phase's task brief: "you MUST at minimum reject if the
 * ids span more than one `plan_day_id`, since silently corrupting the
 * superset semantics at the SQL layer would be a real bug, not just a missing
 * validation nicety"). `PlanService` is expected to layer its own
 * "at least 2 exercises" rule on top of this - this error only guards the one
 * invariant the repository itself cannot allow to be violated.
 *
 * Kept local to `features/plans/repository` rather than the project-root
 * `errors/` directory, mirroring `features/exercise-library/repository/errors.ts`'s
 * `ExerciseNotEditableError` precedent - that directory is still an empty
 * skeleton and not part of this phase's owned files.
 */
export class SupersetSpansMultipleDaysError extends Error {
  constructor(public readonly dayExerciseIds: readonly string[]) {
    super(
      `Cannot group plan_day_exercise ids [${dayExerciseIds.join(', ')}] into one superset: they belong to more than one plan_day.`,
    );
    this.name = 'SupersetSpansMultipleDaysError';
  }
}
