/**
 * Repository-layer error for the "only `source = 'custom'` rows are editable/
 * deletable" invariant (ARCHITECTURE.md section 7.4's `exercise.source` column,
 * this phase's task brief). Enforced in `SqliteExerciseRepository` itself, not
 * deferred to `ExerciseService`: it is a hard, schema-level invariant ("catalog
 * rows only ever get their `exercise_user_data` side written, never their catalog
 * fields mutated"), not a business rule that could legitimately vary by caller -
 * the same reasoning `features/profile/repository/errors.ts` documents for keeping
 * `ProfileAlreadyExistsError`/`ProfileNotFoundError` as dedicated classes callers
 * can `instanceof`-check rather than string-match a message.
 */
export class ExerciseNotEditableError extends Error {
  constructor(public readonly exerciseId: string) {
    super(
      `Exercise "${exerciseId}" is a catalog exercise and cannot be edited or deleted. Only custom exercises are editable.`,
    );
    this.name = 'ExerciseNotEditableError';
  }
}
