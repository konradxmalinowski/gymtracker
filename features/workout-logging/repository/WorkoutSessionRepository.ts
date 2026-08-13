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
  /** `null` unless `workout.showEstimatedCalories` was on when `finish()` ran - see that method's own doc comment for why the setting is a plain parameter rather than a repository-side settings read. */
  estimatedKcal: number | null;
  /**
   * Every current personal record whose `session_id` is this session -
   * i.e. every PR this workout earned that a later edit hasn't since
   * superseded. Derived by `finish()` directly from `personal_record`
   * (`WHERE session_id = ? AND is_current = 1`) rather than accumulated from
   * each `completeSet` call's own `CompletedSetResult.newPRs` during the
   * session: the incremental per-set result is exactly right for driving a
   * PR badge the instant a set completes, but re-deriving from the table
   * once at `finish()` time is simpler, needs no running collector threaded
   * through every set-completion call site, and can never drift from what
   * `personal_record` actually holds. Safe specifically because `finish()`
   * only ever runs against an `in_progress` session, so every record it sees
   * here was written by the ordinary real-time `evaluateAndUpsert` path in
   * chronological order - the same guarantee that does NOT hold for a
   * historical edit, which is why `completeSet`'s own P9 branch (see its
   * implementation) derives its `newPRs` differently.
   */
  newPRs: readonly PersonalRecord[];
}

/**
 * Query for {@link WorkoutSessionRepository.listHistory} - deliberately
 * minimal. This is a fixed-order (most recently started first),
 * offset-paginated read, not a filterable search - the P9 history screen has
 * no filter UI of its own, unlike `exercise-library`'s `ExerciseQuery`.
 * `limit`/`offset` are clamped by `buildLimitOffset`
 * (`repositories/query`), never trusted raw.
 */
export interface SessionHistoryQuery {
  limit?: number;
  offset?: number;
}

/**
 * One row of the P9 history list - a flat read model over `workout_session`
 * alone (no joins: every field here is already denormalized onto that one
 * row by `finish()`), returned only for `status = 'completed'` sessions.
 * Every numeric total is non-nullable: the schema's own
 * `CHECK (status <> 'completed' OR finished_at IS NOT NULL)` plus `finish()`
 * always writing all four totals atomically together guarantee a
 * `completed` row never has a partially-written total.
 */
export interface SessionListItem {
  id: EntityId;
  title: string;
  localDate: string;
  startedAt: number;
  finishedAt: number;
  durationSeconds: number;
  totalVolumeKg: number;
  totalSets: number;
  totalReps: number;
  estimatedKcal: number | null;
  planNameSnapshot: string | null;
  planDayNameSnapshot: string | null;
}

/**
 * A `completed` session plus its exercises and sets - the read model behind
 * the P9 history detail screen and its inline edit mode. Shaped like
 * `ActiveSessionAggregate` (the same `SessionExercise[]`, itself carrying
 * `WorkoutSet[]`) but carries the denormalized totals `finish()` writes
 * instead of `activeState`, which exists only while a workout is in
 * progress.
 */
export interface SessionAggregate {
  id: EntityId;
  planId: EntityId | null;
  planDayId: EntityId | null;
  planNameSnapshot: string | null;
  planDayNameSnapshot: string | null;
  title: string;
  startedAt: number;
  finishedAt: number;
  localDate: string;
  tzOffsetMinutes: number;
  durationSeconds: number;
  totalVolumeKg: number;
  totalSets: number;
  totalReps: number;
  estimatedKcal: number | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
  exercises: SessionExercise[];
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
 * **Scope note.** Section 8.3 names three further methods on this interface -
 * `listHistory`, `getSession` and `updateHistoricalSession` - which were P9's
 * (workout summary and history) scope, deliberately absent through P6-P8
 * rather than stubbed; they land for real in this pass, alongside a new
 * `deleteSession` beyond the literal list (the same kind of addition
 * `restoreExercise` already was, as the undo-toast counterpart to
 * `removeExercise` - see `PlanRepository`'s `restoreDay`/`restoreDayExercise`
 * for the P5 precedent).
 *
 * **P9's historical-edit mechanism** (`plans/2026-08-13-p9-workout-summary-history.md`'s
 * "Historical edit mechanism"): rather than a large `updateHistoricalSession`
 * patch type duplicating every granular mutation method below,
 * `updateHistoricalSession` stays scoped to session-level `notes` only (the
 * one field none of the granular methods cover), and the granular methods
 * themselves are reused directly against a `completed` session. Their guard
 * changed shape for this: `addExercise` and `setExerciseNote` previously used
 * (or, for `setExerciseNote`, had no status guard at all) `in_progress`-only
 * checking; both, plus `removeExercise`/`restoreExercise`/`appendSet`/
 * `updateSet`/`completeSet`/`uncompleteSet`/`deleteSet`/`restoreSet`, now go
 * through a shared `requireInProgressOrCompletedSession` private helper
 * (`in_progress` or `completed`, `discarded`/nonexistent/soft-deleted still
 * rejected) - see each method's own doc comment for specifics. Every one of
 * those except `setExerciseNote` (a pure-text write with no set data to go
 * stale) also re-derives the session's denormalized totals and rebuilds
 * personal records for the exercise(s) it touched when - and only when - the
 * session is `completed`; see the implementation's `syncCompletedSessionAfterEdit`
 * for why this must be a full `rebuild()` rather than `completeSet`'s own
 * live-workout `evaluateAndUpsert` path. `setExerciseRestOverride` is
 * deliberately NOT extended this way: a completed session has no active rest
 * timer for an override to affect, and nothing in this phase's UI plan edits
 * one. `setSessionNotes` already needed no change - it was already
 * unrestricted by session status (see its own implementation comment, which
 * anticipated this exact phase).
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
   * P9: now guarded by `requireInProgressOrCompletedSession` (previously no
   * session-status guard at all) so it also works against a `completed`
   * session but still rejects a `discarded` one. No totals/PR resync - a note
   * has no bearing on either.
   *
   * @throws {RepositoryNotFoundError} when the `session_exercise` does not exist or is soft-deleted.
   * @throws {SessionNotInProgressError} when the owning session is `discarded`.
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
   *
   * P9: now guarded by `requireInProgressOrCompletedSession` (previously
   * `in_progress`-only) so it also works against a `completed` session - a
   * historical "I forgot to log this exercise" edit. A freshly added
   * `session_exercise` has no sets yet, so this never triggers a totals/PR
   * resync itself.
   *
   * @throws {RepositoryNotFoundError} when `exerciseId` does not exist.
   * @throws {SessionNotInProgressError} when the session is `discarded` or does not exist.
   */
  addExercise(
    sessionId: EntityId,
    exerciseId: EntityId,
    globalDefaultRestSeconds: number,
    atIndex?: number,
    tx?: SqlExecutor,
  ): Promise<SessionExercise>;

  /**
   * Soft delete - feeds the undo toast. Leaves its sets' own `deleted_at`
   * untouched, so restoring brings back exactly the sets that were there.
   *
   * P9: also works against a `completed` session - removing a whole exercise
   * from history correctly re-derives totals and rebuilds (or clears) that
   * exercise's personal records.
   */
  removeExercise(sessionExerciseId: EntityId, tx?: SqlExecutor): Promise<void>;

  /**
   * Undoes `removeExercise`. Does not resurrect sets deleted individually
   * before or after.
   *
   * P9: also works against a `completed` session, symmetrically with
   * `removeExercise`.
   */
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
   *
   * P9: also works against a `completed` session (a historical "I forgot to
   * log a set" edit) - see the interface doc comment's "P9's historical-edit
   * mechanism".
   */
  appendSet(sessionExerciseId: EntityId, seed: SetSeed, tx?: SqlExecutor): Promise<WorkoutSet>;

  /**
   * P9: also works against a `completed` session.
   *
   * @throws {DropSegmentSetTypeError} when the patch would change a drop segment's `setType` away from `'drop'`.
   */
  updateSet(setId: EntityId, patch: UpdateSetPatch, tx?: SqlExecutor): Promise<WorkoutSet>;

  /**
   * Applies `values`, marks the set completed and re-anchors `performed_at`,
   * evaluates it against the exercise's current personal records, and
   * touches `active_session_state` - one transaction (ARCHITECTURE.md section
   * 5.1, ADR-0015 Decision 3). See {@link CompletedSetResult.newPRs}.
   *
   * P9: also works against a `completed` session (retroactively finishing a
   * set that was left incomplete, or correcting one that already was). The
   * live-workout `evaluateAndUpsert` comparison ("beats whatever is
   * currently current") is not chronologically aware, so completing a set
   * inside a *past* session takes a different path internally - a full
   * `personalRecordRepository.rebuild()` for the exercise, then a fresh read
   * of what that replay actually attributed to this exact set - rather than
   * `evaluateAndUpsert`. See the implementation's own comment on this branch.
   */
  completeSet(
    setId: EntityId,
    values: CompleteSetValues,
    tx?: SqlExecutor,
  ): Promise<CompletedSetResult>;

  /**
   * Clears `is_completed`/`completed_at`. Values entered are kept -
   * un-completing is not a reset.
   *
   * P9: also works against a `completed` session - un-completing a set that
   * held a personal record correctly demotes or clears it via the same
   * rebuild-on-edit path {@link completeSet} uses.
   */
  uncompleteSet(setId: EntityId, tx?: SqlExecutor): Promise<WorkoutSet>;

  /**
   * Adds a drop segment to a working set: a `workout_set` row with
   * `parent_set_id` set, `set_type = 'drop'` and the parent's `set_index`
   * (never incremented, per ADR-0006). Pre-filled from the last existing
   * segment of the chain, else from the parent.
   *
   * P9: also works against a `completed` session, same as its sibling
   * granular mutation methods.
   *
   * @throws {DropSetParentInvalidError} when the parent is itself a drop segment.
   */
  addDropSet(parentSetId: EntityId, seed: SetSeed, tx?: SqlExecutor): Promise<WorkoutSet>;

  /**
   * Soft delete - feeds the swipe-to-delete undo toast, which restores the set
   * with its original id (a P6 acceptance criterion). Deleting a parent set
   * also soft-deletes its drop segments in the same transaction; `restoreSet`
   * brings back exactly the ones that went with it.
   *
   * P9: also works against a `completed` session - deleting a set that held
   * the only record for an exercise correctly promotes the next-best one (or
   * clears it) via the same rebuild-on-edit path {@link completeSet} uses.
   */
  deleteSet(setId: EntityId, tx?: SqlExecutor): Promise<void>;

  /**
   * Undoes `deleteSet`, id and all.
   *
   * P9: also works against a `completed` session.
   */
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
   * drops the `active_session_state` row - one transaction. Does not itself
   * evaluate personal records (each `completeSet` call already did that in
   * real time, per ADR-0015 Decision 3, P8) - it only reads back whichever of
   * those are still current for this session for {@link SessionSummary.newPRs}.
   *
   * `showEstimatedCalories` is a plain parameter rather than a settings read
   * inside this repository, mirroring `startFromPlanDay`'s
   * `globalDefaultRestSeconds`: the caller (`WorkoutSessionService`) reads
   * `workout.showEstimatedCalories` and passes it down. When `true`,
   * `estimated_kcal` is written via `estimatedCalories(totalDurationSeconds)`
   * (`features/workout-logging/domain/EstimatedCalories.ts`); when `false`, it
   * is written `null` - P9's plan explicitly rules out a retroactive backfill
   * for a session finished with the setting off.
   *
   * @throws {SessionNotInProgressError} when the session is already completed or discarded.
   */
  finish(
    sessionId: EntityId,
    finishedAt: number,
    showEstimatedCalories: boolean,
    tx?: SqlExecutor,
  ): Promise<SessionSummary>;

  /**
   * Sets `status = 'discarded'` and drops the `active_session_state` row. The
   * session row and every set survive - ADR-0005: "a discarded workout leaves a
   * row ... intentional, it makes 'I discarded that by accident' recoverable".
   *
   * @throws {SessionNotInProgressError} when the session is not in progress.
   */
  discard(sessionId: EntityId, tx?: SqlExecutor): Promise<void>;

  // --- history (P9) ---------------------------------------------------------

  /**
   * P9's paginated history read model - ARCHITECTURE.md section 8.3,
   * deliberately absent through P6-P8 (see this interface's own top doc
   * comment). Only `status = 'completed'` sessions, most recently started
   * first, bounded by `query.limit`/`query.offset`
   * (`repositories/query/buildLimitOffset`'s own clamp) - never an unbounded
   * `SELECT *`, so a 2,500-session history stays a cheap indexed range scan
   * regardless of scroll depth.
   */
  listHistory(query: SessionHistoryQuery, tx?: SqlExecutor): Promise<SessionListItem[]>;

  /**
   * Full detail for one `completed` session - exercises, sets, denormalized
   * totals - or `null` for anything else (missing, soft-deleted, still
   * `in_progress`, or `discarded`). Restricted to `completed` deliberately: an
   * `in_progress` session is read through {@link findInProgress} instead (it
   * has no totals yet to show), and nothing in this phase's scope needs to
   * review a `discarded` one.
   */
  getSession(id: EntityId, tx?: SqlExecutor): Promise<SessionAggregate | null>;

  /**
   * The literal ARCHITECTURE.md section 8.3 signature, deliberately narrow:
   * session-level `notes` only - `null` clears it, `undefined` (an empty
   * `patch`) leaves it untouched. Every other historical edit (adding or
   * removing an exercise, editing or deleting a set, an exercise note) reuses
   * the granular mutation methods above directly, now able to accept a
   * `completed` session too - see this interface's top doc comment. This
   * method exists only for the one field none of them cover, and delegates to
   * {@link setSessionNotes} internally, which already had no stricter guard
   * than this one needs.
   *
   * @throws {RepositoryNotFoundError} when the session does not exist or is soft-deleted.
   */
  updateHistoricalSession(
    id: EntityId,
    patch: { notes?: string | null },
    tx?: SqlExecutor,
  ): Promise<void>;

  /**
   * Hard delete - the aggregate-root precedent `PlanRepository.purgePlan`
   * already set (confirm dialog, no undo, a real `DELETE` that fans out
   * through the schema's own `ON DELETE CASCADE` to `session_exercise`/
   * `workout_set`), not the soft-delete-plus-undo-toast pair every child-row
   * delete in this codebase otherwise gets - see
   * `plans/2026-08-13-p9-workout-summary-history.md`'s "Delete semantics" for
   * the full reasoning. Not restricted to any particular `status`: whatever
   * session the caller names is gone. Every exercise the session ever held
   * (including one later removed from it - see the implementation) has its
   * personal records rebuilt afterward in the same transaction, so a deleted
   * session's PR contribution never lingers.
   *
   * @throws {RepositoryNotFoundError} when the session does not exist.
   */
  deleteSession(id: EntityId, tx?: SqlExecutor): Promise<void>;
}
