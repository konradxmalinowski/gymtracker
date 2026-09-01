import type { SqlExecutor } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import type { Pagination } from '@/repositories/query';
import type { PhotoPose, ProgressPhoto } from '../types/ProgressPhoto';

export interface CreateProgressPhotoInput {
  fileName: string;
  thumbName: string;
  pose: PhotoPose;
  /** Defaults to the injected `Clock`'s `now()` when omitted. */
  takenAt?: number;
  width: number;
  height: number;
  byteSize: number;
  note?: string | null;
}

export interface UpdateProgressPhotoPatch {
  pose?: PhotoPose;
  note?: string | null;
  takenAt?: number;
}

export interface ListProgressPhotosOptions extends Partial<Pagination> {
  pose?: PhotoPose;
}

/** `ProgressPhotoRepository.verifyIntegrity()`'s result - a dev-diagnostics scan, not a user-facing query. */
export interface ProgressPhotoIntegrityReport {
  /** File names present on disk under the photos directory that no row (live or soft-deleted) references. */
  orphanFiles: readonly string[];
  /** Live (`deleted_at IS NULL`) rows whose `file_name` or `thumb_name` is missing from disk - a real integrity problem. */
  danglingRows: readonly ProgressPhoto[];
}

/**
 * Progress-photo repository (`progress_photo`, ARCHITECTURE.md section 7.8,
 * schema already shipped in P2's `001_initial.ts`). This repository is pure
 * SQL - it never touches `FileStorage`/`ImageProcessor` itself (all file I/O
 * and image processing happens one layer up, in `ProgressPhotoService`,
 * mirroring `ProfileService.writeAvatar()`'s exact split), with the single
 * exception of `verifyIntegrity()`, which legitimately needs to cross-reference
 * disk state against row state and so takes `FileStorage` as a constructor
 * dependency (see `SqliteProgressPhotoRepository`'s own doc comment).
 *
 * `findById`/`softDelete`/`restore`/`purge` come from `BaseSqliteRepository` -
 * not re-declared here.
 */
export interface ProgressPhotoRepository {
  findById(id: EntityId, tx?: SqlExecutor): Promise<ProgressPhoto | null>;
  softDelete(id: EntityId, tx?: SqlExecutor): Promise<void>;
  restore(id: EntityId, tx?: SqlExecutor): Promise<void>;
  purge(id: EntityId, tx?: SqlExecutor): Promise<void>;

  create(input: CreateProgressPhotoInput, tx?: SqlExecutor): Promise<ProgressPhoto>;
  update(id: EntityId, patch: UpdateProgressPhotoPatch, tx?: SqlExecutor): Promise<ProgressPhoto>;

  /** `taken_at DESC`, `deleted_at IS NULL`, optionally filtered to one `pose`. */
  listAll(options?: ListProgressPhotosOptions, tx?: SqlExecutor): Promise<ProgressPhoto[]>;

  /** Same as `findById` but without the `deleted_at IS NULL` filter - needed so a soft-deleted photo can still be looked up on its way to a permanent (purge) delete. */
  findByIdIncludingDeleted(id: EntityId, tx?: SqlExecutor): Promise<ProgressPhoto | null>;

  /**
   * Cross-references every file under the photos directory (`files.list(...)`)
   * against every `file_name`/`thumb_name` referenced by any row, live or
   * soft-deleted. `orphanFiles` = disk files no row references at all.
   * `danglingRows` = only *live* rows whose file is missing from disk - a
   * soft-deleted row missing its file is expected (once its file is later
   * purged), not alarming.
   */
  verifyIntegrity(tx?: SqlExecutor): Promise<ProgressPhotoIntegrityReport>;
}
