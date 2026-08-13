import type { SqlExecutor } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import type { ExerciseListItem } from '@/features/exercise-library';
import type { PersonalRecord } from '@/features/records';
import type { SetType } from '../domain/setSemantics';

/** `workout_session.status` CHECK constraint (`database/schema.sql` section 7.6). */
export type SessionStatus = 'in_progress' | 'completed' | 'discarded';

/**
 * One row of `workout_set`, including drop segments (a drop segment is a real
 * `workout_set` row with `parentSetId` set and `setType === 'drop'` - ADR-0006).
 */
export interface WorkoutSet {
  id: EntityId;
  sessionExerciseId: EntityId;
  sessionId: EntityId;
  exerciseId: EntityId;
  /** 1-based within its `session_exercise`. A drop segment shares its parent's value - it is not "position in the list"; use `assignSetDisplayNumbers` for that. */
  setIndex: number;
  setType: SetType;
  /** Non-null exactly for drop segments. */
  parentSetId: EntityId | null;
  /** For `assisted`, this is the assistance magnitude as a positive number, not an external load (ADR-0006). */
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceM: number | null;
  rpe: number | null;
  isCompleted: boolean;
  completedAt: number | null;
  performedAt: number;
  note: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SessionExercise {
  id: EntityId;
  sessionId: EntityId;
  exerciseId: EntityId;
  /** Frozen at add time so history survives a catalog change or a custom exercise rename. Produced by `formatExerciseName()`. */
  exerciseNameSnapshot: string;
  sortOrder: number;
  /** `NULL` = standalone; equal non-null values within one session = supersetted (ADR-0006). Written only via `setSupersetGroup`. */
  supersetGroup: number | null;
  restSecondsOverride: number | null;
  note: string | null;
  createdAt: number;
  updatedAt: number;
  /**
   * Live summary of the referenced exercise (image, favorite state, tracking
   * type), embedded the same way `PlanDayExercise.exercise` is so the workout
   * screen renders a card without a second round trip. `exerciseNameSnapshot`
   * remains the historical name; this is the current one.
   */
  exercise: ExerciseListItem;
  /** Non-deleted sets, ordered `set_index` then creation - each parent immediately followed by its own drop segments. */
  sets: WorkoutSet[];
}

/**
 * `active_session_state` - the volatile screen/timer state ADR-0005 mechanism 4
 * keeps off the domain rows. Exactly one row exists while a workout is in
 * progress; `finish()`/`discard()` delete it.
 *
 * Every timer field is `null` throughout P6: the rest timer is P7's scope, and
 * nothing in this phase writes a deadline or a notification id.
 */
export interface ActiveSessionState {
  sessionId: EntityId;
  focusedSessionExerciseId: EntityId | null;
  timerDeadlineAt: number | null;
  timerTotalSeconds: number | null;
  timerNotificationId: string | null;
  pausedAt: number | null;
  scrollOffset: number | null;
  updatedAt: number;
}

/** The whole in-progress workout: FR-19's recovery payload, and what `activeWorkoutStore` hydrates from on mount (ADR-0008). */
export interface ActiveSessionAggregate {
  id: EntityId;
  planId: EntityId | null;
  planDayId: EntityId | null;
  planNameSnapshot: string | null;
  planDayNameSnapshot: string | null;
  title: string;
  status: SessionStatus;
  startedAt: number;
  localDate: string;
  tzOffsetMinutes: number;
  pausedMs: number;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
  exercises: SessionExercise[];
  activeState: ActiveSessionState;
}

/**
 * What a new set should start out holding. Every field is optional: whatever is
 * omitted is filled by `appendSet`'s own pre-fill chain (FR-11), and whatever is
 * present overrides it.
 */
export interface SetSeed {
  setType?: SetType;
  weightKg?: number | null;
  reps?: number | null;
  durationSeconds?: number | null;
  distanceM?: number | null;
  rpe?: number | null;
  note?: string | null;
}

/**
 * Editable fields of an existing set. `setIndex`, `parentSetId`, `sessionId`
 * and `exerciseId` are deliberately absent - a set never moves between
 * exercises or in or out of a drop chain; that is a delete-and-re-add.
 * Completion is its own pair of methods (`completeSet`/`uncompleteSet`), not a
 * patchable field.
 */
export interface UpdateSetPatch {
  setType?: SetType;
  weightKg?: number | null;
  reps?: number | null;
  durationSeconds?: number | null;
  distanceM?: number | null;
  rpe?: number | null;
  note?: string | null;
}

/**
 * The values the user had on screen when they tapped the checkbox. Any field
 * omitted keeps whatever the row already held - completing a pre-filled row
 * without touching it is `completeSet(id, {})`, which is what "completable in
 * two taps with no keyboard" needs.
 */
export interface CompleteSetValues {
  weightKg?: number | null;
  reps?: number | null;
  durationSeconds?: number | null;
  distanceM?: number | null;
  rpe?: number | null;
  note?: string | null;
  /** Defaults to the injected `Clock`'s now. Also becomes the set's `performed_at`, the ordering key every history/previous-performance query uses. */
  completedAt?: number;
}

export interface CompletedSetResult {
  set: WorkoutSet;
  /**
   * Personal records this set just beat, evaluated inside the same
   * transaction as the completion itself (ARCHITECTURE.md section 5.1,
   * ADR-0015 Decision 3) - lands for real as of P8. Empty for a set type
   * `evaluateCandidateRecords` never evaluates (`warmup`/`drop`/`assisted`/
   * `partial`) and for any eligible set that simply didn't beat anything.
   * This is what a PR badge on the workout screen renders.
   */
  newPRs: readonly PersonalRecord[];
}

/**
 * What `saveActiveState` may write. `sessionId` identifies the row; every other
 * field is optional and only the ones present are written.
 *
 * The timer fields (`timerDeadlineAt`, `timerTotalSeconds`,
 * `timerNotificationId`) are P7's extension of this type, added by pass 3
 * (`plans/2026-08-08-p7-rest-timer.md`) rather than left for pass 2: the
 * rest-timer set-completion hook needs to persist a started/adjusted/cancelled
 * deadline through this exact patch shape, and the P6-era placeholder comment
 * that used to sit here ("P7 owns the rest timer and will extend it") is
 * what this replaces - the extension it predicted.
 */
export interface ActiveStatePatch {
  sessionId: EntityId;
  focusedSessionExerciseId?: EntityId | null;
  scrollOffset?: number | null;
  /** Absolute epoch ms the timer counts down to, or `null` to clear it. */
  timerDeadlineAt?: number | null;
  /** The full duration `timerDeadlineAt` was started/adjusted for, in seconds. */
  timerTotalSeconds?: number | null;
  /** The scheduled `expo-notifications` id backing `timerDeadlineAt`, or `null` when nothing is scheduled (denied permission, `timer.notification` off, or the native call failed). */
  timerNotificationId?: string | null;
}

/** What `finish()` returns: the denormalized totals it just wrote, so a caller need not re-read the row. The summary *screen*'s shape is P9's concern, not this. */
export interface SessionSummary {
  sessionId: EntityId;
  title: string;
  startedAt: number;
  finishedAt: number;
  localDate: string;
  durationSeconds: number;
  totalVolumeKg: number;
  totalSets: number;
  totalReps: number;
}

/**
 * `WorkoutSessionRepository` (feature: `workout-logging`) - aggregate root,
 * ARCHITECTURE.md section 8.3, "the most important surface in the app". A
 * session plus its `session_exercise` rows, its `workout_set` rows and its
 * `active_session_state` row is one aggregate, one repository (section 6.1).
 *
 * **Per-mutation commits (ADR-0005 mechanism 1).** Every mutating method below
 * is its own committed transaction. There is no save button, no batching window
 * and no draft: the in-progress workout is a normal `workout_session` row with
 * `status = 'in_progress'` from the moment it starts, and finishing it is an
 * `UPDATE`, not a migration between storage forms. Each method still takes an
 * optional trailing `tx` so a caller composing a larger transaction can join it,
 * the same composition pattern `PlanRepository` uses.
 *
 * **Scope note.** Section 8.3 lists three further methods on this interface -
 * `listHistory`, `getSession` and `updateHistoricalSession` - which are P9's
 * (workout summary and history) scope, not P6's, and are deliberately absent
 * rather than stubbed. `restoreExercise` is present beyond the literal list, as
 * the undo-toast counterpart to `removeExercise`, exactly as P5 added
 * `restoreDay`/`restoreDayExercise` to `PlanRepository`.
 */
export interface WorkoutSessionRepository {
  /**
   * FR-19 recovery entry point: the single `in_progress` session with its
   * exercises, sets and active state, or `null`. Called on cold start before
   * the workout screen renders (ADR-0008 rule 1: the Zustand store hydrates
   * from here, on mount, and only on mount).
   */
  findInProgress(tx?: SqlExecutor): Promise<ActiveSessionAggregate | null>;

  /**
   * Creates the session, its `session_exercise` rows copied from the plan day
   * (order, superset groups and rest overrides included), and its
   * `active_session_state` row - one transaction.
   *
   * Each copied exercise's `rest_seconds_override` is resolved through
   * `resolveRestSeconds` (`features/rest-timer`) rather than taken verbatim
   * from `plan_day_exercise.rest_seconds`: the exercise's own
   * `exercise_user_data.default_rest_seconds` wins if set, the plan day's own
   * value is next, and `globalDefaultRestSeconds` is the final fallback so a
   * plan day that never set a rest target still seeds a real value instead of
   * `null`. The caller (`WorkoutSessionService`) reads
   * `timer.defaultRestSeconds` from settings and passes it in - this
   * repository stays free of settings-schema knowledge.
   *
   * @throws {SessionAlreadyInProgressError} when a session is already in progress.
   * @throws {RepositoryNotFoundError} when `planDayId` does not exist.
   */
  startFromPlanDay(
    planDayId: EntityId,
    startedAt: number,
    globalDefaultRestSeconds: number,
    tx?: SqlExecutor,
  ): Promise<ActiveSessionAggregate>;

  /**
   * "Quick Start": a session with no plan link and no exercises, plus its
   * `active_session_state` row - one transaction.
   *
   * @throws {SessionAlreadyInProgressError} when a session is already in progress.
   */
  startEmpty(startedAt: number, title?: string, tx?: SqlExecutor): Promise<ActiveSessionAggregate>;

  /**
   * Writes `session_exercise.note` (FR-16). `null` clears it - an empty note and
   * no note are the same state, and the column is nullable rather than
   * `NOT NULL DEFAULT ''`.
   *
   * @throws {RepositoryNotFoundError} when the `session_exercise` does not exist or is soft-deleted.
   */
  setExerciseNote(
    sessionExerciseId: EntityId,
    note: string | null,
    tx?: SqlExecutor,
  ): Promise<void>;

  /**
   * P7 (`plans/2026-08-08-p7-rest-timer.md`, Step 0 decision 2): writes
   * `session_exercise.rest_seconds_override` directly, mirroring
   * {@link setExerciseNote}'s shape exactly. This is the tap-to-adjust write
   * path - every remaining set of this exercise this session inherits the
   * adjusted duration, since `startFromPlanDay`/`addExercise` only resolve
   * this column once, at add/start time.
   *
   * @throws {RepositoryNotFoundError} when the `session_exercise` does not exist or is soft-deleted.
   */
  setExerciseRestOverride(
    sessionExerciseId: EntityId,
    restSeconds: number,
    tx?: SqlExecutor,
  ): Promise<void>;

  /**
   * Appends at the end, or inserts at `atIndex` and shifts everything at or
   * after it down. There is no plan day to seed `rest_seconds_override` from
   * here (a manually added exercise has no plan day), so it is resolved
   * through `resolveRestSeconds` with `planDaySeconds: null` - the exercise's
   * own `exercise_user_data.default_rest_seconds` if set, else
   * `globalDefaultRestSeconds`. See {@link startFromPlanDay}'s doc comment for
   * why the global default is a plain parameter rather than a settings read
   * inside this repository.
   */
  addExercise(
    sessionId: EntityId,
    exerciseId: EntityId,
    globalDefaultRestSeconds: number,
    atIndex?: number,
    tx?: SqlExecutor,
  ): Promise<SessionExercise>;

  /** Soft delete - feeds the undo toast. Leaves its sets' own `deleted_at` untouched, so restoring brings back exactly the sets that were there. */
  removeExercise(sessionExerciseId: EntityId, tx?: SqlExecutor): Promise<void>;

  /** Undoes `removeExercise`. Does not resurrect sets deleted individually before or after. */
  restoreExercise(sessionExerciseId: EntityId, tx?: SqlExecutor): Promise<void>;

  reorderExercises(
    sessionId: EntityId,
    orderedIds: readonly EntityId[],
    tx?: SqlExecutor,
  ): Promise<void>;

  /**
   * Writes `superset_group` on every listed `session_exercise` id in one
   * transaction. Does not enforce "at least 2 exercises" (that is
   * `WorkoutSessionService`'s rule, mirroring how `PlanRepository` splits the
   * same concern); does enforce, and throw
   * {@link SupersetSpansMultipleSessionsError} on, every id belonging to the
   * same session.
   */
  setSupersetGroup(
    sessionExerciseIds: readonly EntityId[],
    group: number | null,
    tx?: SqlExecutor,
  ): Promise<void>;

  /**
   * Appends a new (incomplete) set, pre-filled per FR-11: from this exercise's
   * previous set in this session if there is one, otherwise from its last
   * completed working set in a previous completed session, otherwise empty.
   * Anything set on `seed` overrides the pre-fill.
   */
  appendSet(sessionExerciseId: EntityId, seed: SetSeed, tx?: SqlExecutor): Promise<WorkoutSet>;

  /** @throws {DropSegmentSetTypeError} when the patch would change a drop segment's `setType` away from `'drop'`. */
  updateSet(setId: EntityId, patch: UpdateSetPatch, tx?: SqlExecutor): Promise<WorkoutSet>;

  /**
   * Applies `values`, marks the set completed and re-anchors `performed_at`,
   * evaluates it against the exercise's current personal records, and
   * touches `active_session_state` - one transaction (ARCHITECTURE.md section
   * 5.1, ADR-0015 Decision 3). See {@link CompletedSetResult.newPRs}.
   */
  completeSet(
    setId: EntityId,
    values: CompleteSetValues,
    tx?: SqlExecutor,
  ): Promise<CompletedSetResult>;

  /** Clears `is_completed`/`completed_at`. Values entered are kept - un-completing is not a reset. */
  uncompleteSet(setId: EntityId, tx?: SqlExecutor): Promise<WorkoutSet>;

  /**
   * Adds a drop segment to a working set: a `workout_set` row with
   * `parent_set_id` set, `set_type = 'drop'` and the parent's `set_index`
   * (never incremented, per ADR-0006). Pre-filled from the last existing
   * segment of the chain, else from the parent.
   *
   * @throws {DropSetParentInvalidError} when the parent is itself a drop segment.
   */
  addDropSet(parentSetId: EntityId, seed: SetSeed, tx?: SqlExecutor): Promise<WorkoutSet>;

  /**
   * Soft delete - feeds the swipe-to-delete undo toast, which restores the set
   * with its original id (a P6 acceptance criterion). Deleting a parent set
   * also soft-deletes its drop segments in the same transaction; `restoreSet`
   * brings back exactly the ones that went with it.
   */
  deleteSet(setId: EntityId, tx?: SqlExecutor): Promise<void>;

  /** Undoes `deleteSet`, id and all. */
  restoreSet(setId: EntityId, tx?: SqlExecutor): Promise<void>;

  /**
   * Writes `workout_session.notes` (FR-16). `null` clears it.
   *
   * Deliberately not restricted to an `in_progress` session, unlike
   * `addExercise`/`finish`/`discard`: see the implementation's comment for the
   * reasoning.
   *
   * @throws {RepositoryNotFoundError} when the session does not exist or is soft-deleted.
   */
  setSessionNotes(sessionId: EntityId, notes: string | null, tx?: SqlExecutor): Promise<void>;

  /** Upserts the session's `active_session_state` row. Only the fields present on the patch are written. */
  saveActiveState(patch: ActiveStatePatch, tx?: SqlExecutor): Promise<void>;

  /**
   * Computes `SessionTotals` over the session's sets and writes
   * `status = 'completed'`, `finished_at` and the four denormalized totals, then
   * drops the `active_session_state` row - one transaction. Does not evaluate
   * personal records (P8).
   *
   * @throws {SessionNotInProgressError} when the session is already completed or discarded.
   */
  finish(sessionId: EntityId, finishedAt: number, tx?: SqlExecutor): Promise<SessionSummary>;

  /**
   * Sets `status = 'discarded'` and drops the `active_session_state` row. The
   * session row and every set survive - ADR-0005: "a discarded workout leaves a
   * row ... intentional, it makes 'I discarded that by accident' recoverable".
   *
   * @throws {SessionNotInProgressError} when the session is not in progress.
   */
  discard(sessionId: EntityId, tx?: SqlExecutor): Promise<void>;
}
