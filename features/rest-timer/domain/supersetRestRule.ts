/**
 * D-03 / ADR-0006 "Rest-timer behavior for a group": completing a set of a
 * non-terminal member of a superset group does not start the rest timer;
 * completing a set of the last member (by `sortOrder`) does. A standalone
 * exercise (`supersetGroup === null`) always starts one.
 *
 * "Last member" is evaluated over non-deleted session exercises only - a
 * member removed mid-workout (`ADR-0006`'s grouping survives per-session, not
 * per-plan) no longer counts as part of the group, which is what makes the
 * "single member left in a group" edge case (the other member was removed)
 * resolve to "always starts a timer" rather than never starting one.
 */
export interface SupersetSessionExercise {
  sessionExerciseId: string;
  /** `session_exercise.superset_group` - `null` means standalone. */
  supersetGroup: number | null;
  /** `session_exercise.sort_order` - "last member" means the greatest `sortOrder` among the group's non-deleted members. */
  sortOrder: number;
  isDeleted: boolean;
}

export interface ShouldStartRestTimerInput {
  /** The `session_exercise.id` whose set was just completed. */
  completedSessionExerciseId: string;
  /** Every session exercise in the workout, so the group's other members and their order are visible. */
  sessionExercises: readonly SupersetSessionExercise[];
}

/**
 * `true` if completing this set should start the rest timer. Fails open
 * (returns `true`) if `completedSessionExerciseId` cannot be found in
 * `sessionExercises` - that should never happen for a real set completion,
 * and silently swallowing a timer the user expects is the worse failure mode
 * of the two.
 */
export function shouldStartRestTimer(input: ShouldStartRestTimerInput): boolean {
  const completed = input.sessionExercises.find(
    (exercise) => exercise.sessionExerciseId === input.completedSessionExerciseId,
  );
  if (!completed || completed.supersetGroup === null) {
    return true;
  }

  const groupMembers = input.sessionExercises.filter(
    (exercise) => !exercise.isDeleted && exercise.supersetGroup === completed.supersetGroup,
  );
  if (groupMembers.length === 0) {
    return true;
  }

  const lastMember = groupMembers.reduce((latest, exercise) =>
    exercise.sortOrder > latest.sortOrder ? exercise : latest,
  );
  return lastMember.sessionExerciseId === completed.sessionExerciseId;
}
