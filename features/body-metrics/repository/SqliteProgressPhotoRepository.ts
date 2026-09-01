import type { SqlExecutor, SqlParam } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import {
  BaseSqliteRepository,
  type AuditedRow,
  type RepositoryDependencies,
} from '@/repositories/base';
import { buildLimitOffset } from '@/repositories/query';
import type { FileStorage } from '@/services/files';
import type { PhotoPose, ProgressPhoto } from '../types/ProgressPhoto';
import type {
  CreateProgressPhotoInput,
  ListProgressPhotosOptions,
  ProgressPhotoIntegrityReport,
  ProgressPhotoRepository,
  UpdateProgressPhotoPatch,
} from './ProgressPhotoRepository';

/**
 * Relative directory `progress_photo.file_name`/`.thumb_name` live inside,
 * under `FileStorage`'s `'document'` root (ADR-0012). Kept as this
 * repository's own literal, not imported from `ProgressPhotoService` (which
 * exports the same value as `PROGRESS_PHOTO_DIRECTORY`) - a repository never
 * depends on its own feature's service layer, only the reverse. Must stay in
 * sync with that export; both ultimately encode the same ADR-0012 decision.
 */
const PHOTOS_DIRECTORY = 'progress-photos';

interface ProgressPhotoRow extends AuditedRow {
  file_name: string;
  thumb_name: string;
  pose: PhotoPose;
  taken_at: number;
  local_date: string;
  width: number;
  height: number;
  byte_size: number;
  note: string | null;
}

function mapRow(row: ProgressPhotoRow): ProgressPhoto {
  return {
    id: row.id,
    fileName: row.file_name,
    thumbName: row.thumb_name,
    pose: row.pose,
    takenAt: row.taken_at,
    localDate: row.local_date,
    width: row.width,
    height: row.height,
    byteSize: row.byte_size,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export interface ProgressPhotoRepositoryDependencies extends RepositoryDependencies {
  /** Needed only by `verifyIntegrity()` - every other method is pure SQL. See this class's own doc comment. */
  files: FileStorage;
}

/**
 * SQLite implementation of `ProgressPhotoRepository` (ARCHITECTURE.md section
 * 7.8/8.3, P13). Extends `BaseSqliteRepository<ProgressPhoto, ProgressPhotoRow>`
 * scoped to `progress_photo` - `findById`/`softDelete`/`restore`/`purge` come
 * from the base class for free.
 *
 * This repository never touches `FileStorage` for any *write* - `create`/
 * `update`/`listAll` are pure SQL, and all file I/O and image processing
 * happens one layer up in `ProgressPhotoService`, mirroring
 * `ProfileService.writeAvatar()`'s exact repository/service split. The one
 * exception is `verifyIntegrity()`, a dev-diagnostics cross-reference between
 * disk state and row state that legitimately needs both - `files` is
 * injected via the constructor for that single method alone.
 */
export class SqliteProgressPhotoRepository
  extends BaseSqliteRepository<ProgressPhoto, ProgressPhotoRow>
  implements ProgressPhotoRepository
{
  protected readonly table = 'progress_photo';
  private readonly files: FileStorage;

  constructor(deps: ProgressPhotoRepositoryDependencies) {
    super(deps);
    this.files = deps.files;
  }

  protected mapRow(row: ProgressPhotoRow): ProgressPhoto {
    return mapRow(row);
  }

  async create(input: CreateProgressPhotoInput, tx?: SqlExecutor): Promise<ProgressPhoto> {
    const at = input.takenAt ?? this.now();
    const localDate = this.localDate(at);
    const { id } = await this.insertRow(
      {
        file_name: input.fileName,
        thumb_name: input.thumbName,
        pose: input.pose,
        taken_at: at,
        width: input.width,
        height: input.height,
        byte_size: input.byteSize,
        note: input.note ?? null,
      },
      tx,
      { at, localDate },
    );
    const created = await this.findById(id, tx);
    if (!created) {
      throw new Error('unreachable: progress_photo row was just inserted');
    }
    return created;
  }

  async update(
    id: EntityId,
    patch: UpdateProgressPhotoPatch,
    tx?: SqlExecutor,
  ): Promise<ProgressPhoto> {
    const columns: Record<string, SqlParam> = {};
    if (patch.pose !== undefined) columns.pose = patch.pose;
    if (patch.note !== undefined) columns.note = patch.note;
    if (patch.takenAt !== undefined) {
      columns.taken_at = patch.takenAt;
      columns.local_date = this.localDate(patch.takenAt);
    }

    // Same "always call updateRow, even with an empty patch" reasoning as
    // SqliteBodyMetricRepository.update - it's the mechanism that throws
    // RepositoryNotFoundError for a missing/deleted id.
    await this.updateRow(id, columns, tx);

    const updated = await this.findById(id, tx);
    if (!updated) {
      throw new Error('unreachable: progress_photo row was just updated');
    }
    return updated;
  }

  async listAll(options?: ListProgressPhotosOptions, tx?: SqlExecutor): Promise<ProgressPhoto[]> {
    const executor = this.executor(tx);
    const { sql: limitSql, params: limitParams } = buildLimitOffset(options);

    if (options?.pose !== undefined) {
      const rows = await executor.select<ProgressPhotoRow>(
        `SELECT * FROM progress_photo
         WHERE pose = ? AND deleted_at IS NULL
         ORDER BY taken_at DESC
         ${limitSql}`,
        [options.pose, ...limitParams],
      );
      return rows.map(mapRow);
    }

    const rows = await executor.select<ProgressPhotoRow>(
      `SELECT * FROM progress_photo
       WHERE deleted_at IS NULL
       ORDER BY taken_at DESC
       ${limitSql}`,
      [...limitParams],
    );
    return rows.map(mapRow);
  }

  async findByIdIncludingDeleted(id: EntityId, tx?: SqlExecutor): Promise<ProgressPhoto | null> {
    const row = await this.executor(tx).selectOne<ProgressPhotoRow>(
      'SELECT * FROM progress_photo WHERE id = ?',
      [id],
    );
    return row ? mapRow(row) : null;
  }

  async verifyIntegrity(tx?: SqlExecutor): Promise<ProgressPhotoIntegrityReport> {
    const executor = this.executor(tx);
    const [diskFiles, rows] = await Promise.all([
      this.files.list(PHOTOS_DIRECTORY),
      executor.select<ProgressPhotoRow>('SELECT * FROM progress_photo'),
    ]);

    const referenced = new Set<string>();
    for (const row of rows) {
      referenced.add(row.file_name);
      referenced.add(row.thumb_name);
    }

    const orphanFiles = diskFiles.filter((fileName) => !referenced.has(fileName));

    const diskFileSet = new Set(diskFiles);
    const danglingRows = rows
      .filter((row) => row.deleted_at === null)
      .filter((row) => !diskFileSet.has(row.file_name) || !diskFileSet.has(row.thumb_name))
      .map(mapRow);

    return { orphanFiles, danglingRows };
  }
}
