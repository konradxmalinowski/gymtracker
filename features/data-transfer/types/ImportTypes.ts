/**
 * Shared contract types between the (not-yet-built) service layer and its
 * presentation consumers - kept here rather than under `services/` because
 * they describe *shapes*, not behavior, the same reasoning `PersonalRecord`/
 * `PersonalRecordSnapshot` live under `records/types/` instead of
 * `records/repository/`. Both are produced by a future
 * `DataTransferService`, not by anything in this slice
 * (`types/`/`domain/`/`repository/` only) - defined now so that service's
 * signature is fixed by the same pass that fixes `DataTransferRepository`'s.
 */

/** One entity type's contribution to an {@link ImportPreview} - "what would happen if this import proceeded". */
export interface ImportEntityCounts {
  toCreate: number;
  toUpdate: number;
  unchanged: number;
}

/**
 * One row the importer could not fully resolve or apply - never a reason to
 * abort the whole import (ADR-0013's CSV section: "unresolved names become
 * custom exercises", not a dropped row and not a failed import). Surfaced by
 * the import preview screen so the user sees exactly what will happen before
 * anything writes.
 */
export interface ImportWarning {
  /** Which entity/table this warning is about, e.g. `'session'`, `'exercise'`, `'plan'`. */
  entity: string;
  /** The id (JSON import) or a row-identifying description (CSV import, which has no id to point at until a row is grouped) this warning concerns, when there is one to name. */
  subject?: string;
  message: string;
}

/**
 * What the import preview screen renders before a merge or replace import is
 * confirmed - ADR-0013: "shows exactly what will be created and which rows
 * could not be resolved, before anything is written." Every count is derived
 * by comparing the parsed file against the current database (a merge-mode
 * dry run), regardless of whether the import that follows actually runs in
 * `merge` or `replace` mode - replace mode's counts are simpler in practice
 * (everything in the file becomes a create, since replace purges first) but
 * share this same shape so one preview screen renders either.
 */
export interface ImportPreview {
  profile: ImportEntityCounts;
  settings: ImportEntityCounts;
  customExercises: ImportEntityCounts;
  exerciseUserData: ImportEntityCounts;
  exerciseVideos: ImportEntityCounts;
  plans: ImportEntityCounts;
  sessions: ImportEntityCounts;
  bodyMetrics: ImportEntityCounts;
  progressPhotos: ImportEntityCounts;
  warnings: ImportWarning[];
}

/** What actually got written once an import (merge or replace) completed. */
export interface ImportResult {
  mode: 'merge' | 'replace';
  written: {
    profile: boolean;
    settings: number;
    customExercises: number;
    exerciseUserData: number;
    exerciseVideos: number;
    plans: number;
    sessions: number;
    sets: number;
    bodyMetrics: number;
    progressPhotos: number;
  };
  /**
   * Path to the automatic pre-replace backup JSON file written to the cache
   * directory (ADR-0013: "the app automatically writes a JSON backup of the
   * current state to the cache directory first, surfacing its path in the
   * result screen") - always `null` for a `merge` import, since nothing
   * destructive happened for a backup to protect against.
   */
  backupFilePath: string | null;
  warnings: ImportWarning[];
}
