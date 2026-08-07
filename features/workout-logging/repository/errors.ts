/**
 * Repository-layer errors for `SqliteWorkoutSessionRepository`. Kept local to
 * `features/workout-logging/repository`, mirroring
 * `features/plans/repository/errors.ts` and
 * `features/exercise-library/repository/errors.ts`.
 *
 * All of these guard invariants the repository itself cannot allow to be
 * violated - they are not business rules a caller could reasonably vary. The
 * service layer translates them into outcomes the UI can act on rather than
 * re-deriving them.
 */

/**
 * `ux_session_single_in_progress` (ADR-0005 mechanism 3) makes two active
 * workouts impossible at the database level. `startFromPlanDay`/`startEmpty`
 * catch that and raise this instead, carrying the existing session's id so the
 * service can offer "resume or discard" rather than surfacing a raw SQLite
 * constraint message.
 */
export class SessionAlreadyInProgressError extends Error {
  constructor(public readonly existingSessionId: string | null) {
    super(
      existingSessionId === null
        ? 'A workout is already in progress.'
        : `A workout is already in progress (session "${existingSessionId}").`,
    );
    this.name = 'SessionAlreadyInProgressError';
  }
}

/** Thrown by `finish`/`discard` when the target session is already `completed` or `discarded` - finishing a finished workout would silently rewrite its totals and `finished_at`. */
export class SessionNotInProgressError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly status: string,
  ) {
    super(`Session "${sessionId}" is "${status}", not "in_progress".`);
    this.name = 'SessionNotInProgressError';
  }
}

/** Thrown by `setSupersetGroup` when the given `session_exercise` ids do not all belong to one session - `superset_group` values are local to their session (ADR-0006), so grouping across sessions would silently corrupt both. */
export class SupersetSpansMultipleSessionsError extends Error {
  constructor(public readonly sessionExerciseIds: readonly string[]) {
    super(
      `Cannot group session_exercise ids [${sessionExerciseIds.join(', ')}] into one superset: they belong to more than one session.`,
    );
    this.name = 'SupersetSpansMultipleSessionsError';
  }
}

/**
 * Thrown by `addDropSet` when the parent is itself a drop segment. A drop chain
 * is flat by design: `100x8 -> 80x6 -> 60x5` is one parent with two segments,
 * all sharing the parent's `set_index`. Letting a segment parent another segment
 * would make "the parent set is the effort that counts" (ADR-0006) ambiguous.
 */
export class DropSetParentInvalidError extends Error {
  constructor(public readonly parentSetId: string) {
    super(
      `Set "${parentSetId}" is itself a drop segment; add further drops to its parent set instead.`,
    );
    this.name = 'DropSetParentInvalidError';
  }
}

/** Thrown by `updateSet` when a patch would move a drop segment off `set_type = 'drop'`, which the schema's `CHECK (parent_set_id IS NULL OR set_type = 'drop')` forbids anyway - caught here so the caller gets a named error rather than a constraint failure. */
export class DropSegmentSetTypeError extends Error {
  constructor(public readonly setId: string) {
    super(
      `Set "${setId}" is a drop segment; its set_type cannot be changed away from "drop". Delete it and add a normal set instead.`,
    );
    this.name = 'DropSegmentSetTypeError';
  }
}
