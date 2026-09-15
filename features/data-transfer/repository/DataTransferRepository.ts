import type { SqlExecutor } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import type { CsvSetRowInput } from '../domain/csvRowMapper';
import type {
  ExportBodyMetric,
  ExportCustomExercise,
  ExportDailyGoal,
  ExportDailyGoalEntry,
  ExportDailyReminder,
  ExportDailyReminderResponse,
  ExportExerciseUserData,
  ExportExerciseVideo,
  ExportPersonalRecord,
  ExportPlan,
  ExportProfile,
  ExportProgressPhoto,
  ExportSession,
  ExportSetting,
} from '../types/ExportEnvelope';

/** {@link DataTransferRepository.getExportCounts}'s return shape - the envelope's `counts` header, ADR-0013. */
export interface ExportCounts {
  sessions: number;
  sets: number;
  exercises: number;
}

/**
 * `DataTransferRepository` (feature: `data-transfer`) - ADR-0013's JSON
 * backup / CSV export-import contract, at the repository layer. Unlike every
 * other feature repository in this codebase, this one is not scoped to a
 * single aggregate root: it reads across virtually every table P2-P13 built
 * (the one feature ARCHITECTURE.md section 9.1 draws as depending on
 * everything, built last), and its writes are upserts keyed by an id the
 * *file* supplied, not ids this repository generates itself.
 *
 * **Streaming shape (ADR-0013 NFR, "the exporter streams entity batches ...
 * rather than building one string").** The two tables that can reach real
 * scale (`workout_session`/`session_exercise`/`workout_set` as a nested
 * aggregate, and the same data flattened one-row-per-set for CSV) are
 * exposed as `count*`/`export*Batch(offset, limit, tx?)` pairs so a caller
 * can page through them and append each batch to a file rather than holding
 * the whole export in memory. Every other table this app has is small enough
 * (ARCHITECTURE.md's own "smaller tables... can be single unbounded reads"
 * guidance) that its `export*()` method returns everything at once - no
 * `plan`, `exercise`, `body_metric_entry`, `progress_photo`, `personal_record`
 * or `app_setting` table in this app's data model ever approaches
 * `workout_set`'s 75,000-row worst case.
 *
 * **Merge semantics (ADR-0013 "Import modes" - Merge).** Every `upsert*`
 * method is idempotent-by-id with "newer `updated_at` wins" conflict
 * resolution: importing the same file twice is a true no-op the second time,
 * and a locally-newer row is never clobbered by an older file. A row whose
 * file-side `deletedAt` is non-null soft-deletes its local counterpart on
 * write (part of the same upsert, not a separate pass) - see each method's
 * own doc comment for the exact column set. `personal_record` deliberately
 * has no `upsert*` method at all - see {@link ExportPersonalRecord}'s own
 * doc comment for why the post-import rebuild sequence is the only correct
 * writer of that table.
 *
 * **Transaction shape.** Every mutating method takes the same optional
 * trailing `tx` every other repository in this codebase does
 * (`BaseSqliteRepository`'s `executor(tx)` pattern) - the aggregate ones
 * (`upsertPlan`, `upsertSession`) open their own transaction when called
 * without one, covering the whole aggregate (plan + its days + their
 * exercises; session + its exercises + their sets) in one commit, mirroring
 * `PlanRepository`/`WorkoutSessionRepository`'s own "one aggregate, one
 * transaction" rule. The service layer is expected to call each entity's
 * `upsert*` once per row in the file, in file order (see
 * `upsertSession`'s own doc comment for why set order specifically matters),
 * batching entity types into their own top-level transactions rather than
 * one transaction for the entire import - ADR-0013: "Both modes run inside
 * one transaction per entity batch, and any failure rolls the whole import
 * back," where "batch" here means one entity type's worth of rows, not one
 * autonomous unit smaller than that.
 */
export interface DataTransferRepository {
  // --- export: header counts -------------------------------------------

  /**
   * Cheap `COUNT(*)` reads for the envelope's `counts` header - never
   * derived by loading every row. `exercises` counts every non-deleted
   * `exercise` row (catalog and custom together) - the exercise catalog this
   * backup's history references, not merely `customExercises.length`
   * (ADR-0013's own worked example, `"exercises": 903`, is far larger than
   * any real custom-exercise count would be, and matches roughly a full
   * catalog's size instead - a deliberate reading of an otherwise-ambiguous
   * field, recorded here since the ADR does not spell it out).
   */
  getExportCounts(tx?: SqlExecutor): Promise<ExportCounts>;

  // --- export: small/unbounded tables -----------------------------------

  /** `null` only when onboarding has never run - not a real export-time case in practice, but handled rather than assumed impossible. */
  exportProfile(tx?: SqlExecutor): Promise<ExportProfile | null>;
  /** Every `app_setting` row, unfiltered. */
  exportSettings(tx?: SqlExecutor): Promise<ExportSetting[]>;
  /** `exercise` rows with `source = 'custom'` only, each with its `exercise_muscle` rows embedded as `muscles`. Not filtered by `deleted_at` - see this interface's own "fidelity" note in `types/ExportEnvelope.ts`. */
  exportCustomExercises(tx?: SqlExecutor): Promise<ExportCustomExercise[]>;
  /** Every `exercise_user_data` row, regardless of which exercise (catalog or custom) it belongs to. */
  exportExerciseUserData(tx?: SqlExecutor): Promise<ExportExerciseUserData[]>;
  /** `exercise_video` rows with `source = 'user'` only - curated catalog videos are never exported. */
  exportExerciseVideos(tx?: SqlExecutor): Promise<ExportExerciseVideo[]>;
  /** Every `plan` row with its `plan_day`/`plan_day_exercise` rows nested in, unfiltered by `deleted_at` at any level. */
  exportPlans(tx?: SqlExecutor): Promise<ExportPlan[]>;
  /** Every `personal_record` row (current and superseded) - read-only fidelity, see {@link ExportPersonalRecord}. */
  exportPersonalRecords(tx?: SqlExecutor): Promise<ExportPersonalRecord[]>;
  /** Every `body_metric_entry` row. */
  exportBodyMetrics(tx?: SqlExecutor): Promise<ExportBodyMetric[]>;
  /** Every `progress_photo` row - metadata only, no binary (ADR-0012). */
  exportProgressPhotos(tx?: SqlExecutor): Promise<ExportProgressPhoto[]>;
  /** Every `daily_goal` row, unfiltered by `deleted_at` (same fidelity rule as every other table in this interface - see `types/ExportEnvelope.ts`'s own header comment). Envelope v2. */
  exportDailyGoals(tx?: SqlExecutor): Promise<ExportDailyGoal[]>;
  /** Every `daily_goal_entry` row. Envelope v2. */
  exportDailyGoalEntries(tx?: SqlExecutor): Promise<ExportDailyGoalEntry[]>;
  /** Every `daily_reminder` row, unfiltered by `deleted_at`. Envelope v2. */
  exportDailyReminders(tx?: SqlExecutor): Promise<ExportDailyReminder[]>;
  /** Every `daily_reminder_response` row. Envelope v2. */
  exportDailyReminderResponses(tx?: SqlExecutor): Promise<ExportDailyReminderResponse[]>;

  // --- export: large tables, batched/streamed ---------------------------

  /** Total `workout_session` row count (unfiltered) - the streaming loop's upper bound. */
  countExportSessions(tx?: SqlExecutor): Promise<number>;
  /**
   * One page of full session aggregates (`workout_session` + its
   * `session_exercise` rows + their `workout_set` rows, nested), ordered by
   * `id ASC` (UUIDv7's own creation order - ADR-0002 decision 1) for a
   * stable, index-backed page boundary across repeated calls. Each
   * session's `sets` array is ordered `created_at ASC, id ASC` within its
   * `session_exercise` - a drop segment is always created after the parent
   * it references, so this ordering already satisfies
   * `upsertSession`'s own "parent before child" FK requirement with no
   * extra sort needed on the way back in.
   */
  exportSessionsBatch(offset: number, limit: number, tx?: SqlExecutor): Promise<ExportSession[]>;

  /** Total working-set row count (`v_working_set`, i.e. completed sets from completed sessions) - the CSV streaming loop's upper bound, and also `getExportCounts().sets`. */
  countCsvSetRows(tx?: SqlExecutor): Promise<number>;
  /**
   * One page of flat, denormalized per-set rows, already joined with their
   * session/plan-day/exercise context and current-PR status - exactly the
   * shape `csvRowMapper#mapSetToCsvRow` consumes. Reads `v_working_set`
   * (ARCHITECTURE.md section 7.10), so - unlike every other export method in
   * this interface - this one IS filtered (to completed sets on completed
   * sessions): the CSV format is ADR-0013's deliberately lossy log, not the
   * lossless JSON backup, so it only ever shows sets that actually happened.
   */
  exportCsvSetRowsBatch(offset: number, limit: number, tx?: SqlExecutor): Promise<CsvSetRowInput[]>;

  // --- import: merge (upsert-by-id, newer `updated_at` wins) -------------

  /** Updates the singleton `user_profile` row (or inserts it, for the rare case an import runs before onboarding ever created one) when `profile.updatedAt` is newer than the stored row's. Never deletes it - see `purgeAllUserData`'s own doc comment. */
  upsertProfile(profile: ExportProfile, tx?: SqlExecutor): Promise<void>;
  /** Upserts one `app_setting` row by `key`, newer `updatedAt` wins. */
  upsertSetting(setting: ExportSetting, tx?: SqlExecutor): Promise<void>;
  /** Upserts one custom `exercise` row by `id` (newer `updatedAt` wins) and, when the upsert actually applies, fully replaces its `exercise_muscle` rows to match `muscles` - never a no-op partial merge of the muscle list. Always writes `source = 'custom'`; refuses nothing extra beyond what the Zod-validated envelope already guarantees is a `custom`-shaped row. */
  upsertCustomExercise(exercise: ExportCustomExercise, tx?: SqlExecutor): Promise<void>;
  /** Upserts one `exercise_user_data` row by `exerciseId` (its primary key), newer `updatedAt` wins. Silently applies to a catalog exercise's row too - see this interface's own header comment on why `exercise_user_data` purge/merge is never scoped to custom exercises. */
  upsertExerciseUserData(row: ExportExerciseUserData, tx?: SqlExecutor): Promise<void>;
  /** Upserts one `exercise_video` row by `id`, newer `updatedAt` wins. Always writes `source = 'user'`. */
  upsertExerciseVideo(video: ExportExerciseVideo, tx?: SqlExecutor): Promise<void>;
  /**
   * Upserts one plan aggregate: the `plan` row, then every `plan_day` row in
   * `plan.days`, then every `plan_day_exercise` row in each day's
   * `exercises` - each row upserted independently by its own id/`updatedAt`
   * (not a delete-and-replace of the whole aggregate), so a file that only
   * changed one day's name doesn't touch any of that plan's other rows'
   * `updatedAt`. Runs as one transaction per plan when called without a
   * `tx` (this interface's own "transaction shape" note).
   */
  upsertPlan(plan: ExportPlan, tx?: SqlExecutor): Promise<void>;
  /**
   * Upserts one session aggregate the same row-by-row way `upsertPlan`
   * does: the `workout_session` row, then every `session_exercise` row,
   * then every `workout_set` row - each independently upserted by id.
   *
   * **Set order matters.** `workout_set.parent_set_id` self-references
   * another `workout_set.id` (drop-set chains) and this database always
   * runs with `foreign_keys = ON` (`database/client.ts`), so a drop
   * segment's `INSERT` fails if its parent row does not exist yet within
   * this same transaction. Sets are upserted in exactly the order they
   * appear in `session.exercises[].sets` - the caller (a JSON file produced
   * by `exportSessionsBatch`, or a hand-edited one) is trusted to have
   * emitted each parent before its own drop segments, which
   * `exportSessionsBatch`'s own `created_at ASC, id ASC` ordering already
   * guarantees for anything this app itself exported.
   *
   * Runs as one transaction per session when called without a `tx`.
   */
  upsertSession(session: ExportSession, tx?: SqlExecutor): Promise<void>;
  /** Upserts one `body_metric_entry` row by `id`, newer `updatedAt` wins. */
  upsertBodyMetric(entry: ExportBodyMetric, tx?: SqlExecutor): Promise<void>;
  /** Upserts one `progress_photo` **metadata** row by `id`, newer `updatedAt` wins - never writes a file, the binary stays absent (ADR-0012/ADR-0013). A later `ProgressPhotoRepository.verifyIntegrity()` pass (part of the post-import rebuild sequence, outside this repository) is what surfaces the missing file to the user. */
  upsertProgressPhoto(photo: ExportProgressPhoto, tx?: SqlExecutor): Promise<void>;
  /** Upserts one `daily_goal` row by `id`, newer `updatedAt` wins. Envelope v2. */
  upsertDailyGoal(goal: ExportDailyGoal, tx?: SqlExecutor): Promise<void>;
  /**
   * Upserts one `daily_goal_entry` row by its `(goalId, localDate)`
   * composite key (`ux_daily_goal_entry_goal_date`), newer `updatedAt` wins -
   * **not** by `id`, since this table's own real writer
   * (`SqliteDailyGoalRepository.upsertEntryForToday`) already treats that
   * composite key as the row's true identity: two devices independently
   * logging progress for the same goal on the same day generate different
   * `id`s for what is semantically one row, and upserting by `id` would
   * create a duplicate that then violates the composite unique index instead
   * of merging. Envelope v2.
   */
  upsertDailyGoalEntry(entry: ExportDailyGoalEntry, tx?: SqlExecutor): Promise<void>;
  /** Upserts one `daily_reminder` row by `id`, newer `updatedAt` wins. Envelope v2. */
  upsertDailyReminder(reminder: ExportDailyReminder, tx?: SqlExecutor): Promise<void>;
  /**
   * Upserts one `daily_reminder_response` row by its `(reminderId,
   * localDate)` composite key (`ux_daily_reminder_response_reminder_date`),
   * using `respondedAt` as the "newer wins" comparator - this table has no
   * `updatedAt` column at all, and `respondedAt` is what
   * `SqliteDailyReminderRepository.recordResponse`'s own "last tap wins"
   * semantics already treat as the row's freshness signal. Same identity
   * reasoning as {@link upsertDailyGoalEntry}. Envelope v2.
   */
  upsertDailyReminderResponse(
    response: ExportDailyReminderResponse,
    tx?: SqlExecutor,
  ): Promise<void>;

  // --- import: replace mode ----------------------------------------------

  /**
   * Deletes every *user* row in FK-safe (children-before-parents) order, in
   * one transaction when called without a `tx`: `workout_set` ->
   * `session_exercise` -> `workout_session` -> `active_session_state` ->
   * `personal_record` -> `plan_day_exercise` -> `plan_day` -> `plan` ->
   * (`exercise_muscle` for custom exercises only) -> `exercise_user_data`
   * (wholesale, not scoped to custom exercises) -> `exercise WHERE source =
   * 'custom'` -> `exercise_video WHERE source = 'user'` ->
   * `body_metric_entry` -> `progress_photo` -> `daily_reminder_response` ->
   * `daily_goal_entry` -> `daily_reminder` -> `daily_goal` -> `app_setting`
   * (all rows).
   *
   * Deliberately explicit rather than relying solely on this schema's own
   * `ON DELETE CASCADE`/`ON DELETE SET NULL` to do the fan-out - matches
   * the FK-safe order the task brief specifies so the intent reads directly
   * off this method rather than off the schema's constraint graph.
   *
   * Never touches `user_profile` (a fixed singleton row - deleting it would
   * orphan the avatar file reference and break the app's own boot-gate
   * assumption that a profile row always exists once onboarding completed;
   * `upsertProfile` is what replace mode uses to overwrite its columns
   * afterward) and never touches a catalog `exercise`/`exercise_video` row
   * (`source = 'catalog'` is excluded from both deletes, matching every
   * other "catalog is never exported/purged" rule in this feature).
   */
  purgeAllUserData(tx?: SqlExecutor): Promise<void>;

  // --- import: exercise resolution (backs csvImportGrouping.ts's chain) --

  /** `exercise.catalog_slug = ?`, non-deleted only (a soft-deleted catalog row should not silently resurrect via CSV import). */
  findExerciseIdBySlug(catalogSlug: string, tx?: SqlExecutor): Promise<EntityId | null>;
  /** `exercise.id = ?`, non-deleted only - confirms the id from the file still names a real, live local row rather than trusting it blindly. */
  findExerciseIdById(exerciseId: EntityId, tx?: SqlExecutor): Promise<EntityId | null>;
  /** Case-sensitive `name_en = ? OR name_pl = ?`, non-deleted, catalog rows preferred over custom on a tie (`ORDER BY source = 'catalog' DESC`), first match wins. */
  findExerciseIdByExactName(name: string, tx?: SqlExecutor): Promise<EntityId | null>;
  /**
   * Substring match against `exercise.name_search` (`name_search LIKE '%' ||
   * ? || '%'`) using an already-folded/lowercased query (see
   * `csvImportGrouping.ts#foldNameForMatch`) - `name_search` itself already
   * concatenates a row's `name_en`/`name_pl`/`aliases`, folded the same way
   * at write time, so this reuses the exact index-backed column
   * (`ix_exercise_name`) the library's own search screen already relies on
   * rather than folding every candidate row's name in JS. A substring match
   * can in principle match more than one exercise; this returns the first
   * (catalog-preferred, same tie-break as `findExerciseIdByExactName`)
   * rather than every candidate - a deliberate v1 simplification consistent
   * with ADR-0013's own CSV import scope (best-effort reconstruction, not a
   * disambiguation UI), noted here since the ADR does not spell this
   * specific case out.
   */
  findExerciseIdByFoldedName(foldedName: string, tx?: SqlExecutor): Promise<EntityId | null>;
  /** Creates a new `source = 'custom'` exercise row from a bare display name (ADR-0013: "falling back to creating a custom exercise from the embedded name" / "unresolved names become custom exercises") - no muscles, no equipment, nothing beyond the name itself; the user can fill in the rest later the same way any other custom exercise is edited. */
  createExerciseFromName(name: string, tx?: SqlExecutor): Promise<EntityId>;

  // --- import: post-import rebuild support --------------------------------

  /**
   * Recomputes and rewrites one session's `total_volume_kg`/`total_sets`/
   * `total_reps` from its own currently-persisted `workout_set` rows, using
   * the same `computeSessionTotals` formula (`@/features/workout-logging`)
   * `SqliteWorkoutSessionRepository.finish()`/`syncCompletedSessionAfterEdit`
   * already use. Added for `DataTransferService`'s own post-import rebuild
   * sequence (ADR-0013: "session totals are recomputed") - merging or
   * replacing a different set of `workout_set` rows for a session can desync
   * those three denormalized columns from what actually got written, and
   * `WorkoutSessionRepository`'s own equivalent (`computeTotalsForSession`/
   * `syncCompletedSessionAfterEdit`) is `private` and gated to a `completed`
   * session only - unreachable from here without either widening that
   * repository's stable public contract for an import-only concern or
   * reaching into its private internals, both worse than this repository
   * reusing the same pure, already-barrel-exported formula directly.
   *
   * Deliberately does NOT touch `duration_seconds`, `estimated_kcal`, or
   * `updated_at`: `duration_seconds` either comes from the imported file
   * directly (JSON import, which carries its own authoritative value) or is
   * computed once at construction time from reconstructed start/finish
   * instants (CSV import, `DataTransferService`'s own session-building step)
   * - re-deriving volume/sets/reps from the sets that landed should not also
   * silently move a value sourced independently, or move the row's own audit
   * timestamp (nothing about *this* recompute is a semantic edit a user made).
   */
  recomputeSessionTotals(sessionId: EntityId, tx?: SqlExecutor): Promise<void>;
}
