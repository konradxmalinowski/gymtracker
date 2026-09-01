import { z } from 'zod';
import type { EntityId } from '@/repositories/contracts/repository';
import type { FileStorage } from '@/services/files';
import type { ImageProcessor } from '@/services/images';
import type { IdGenerator } from '@/services/id';
import type { Logger } from '@/services/logging';
import type {
  CreateProgressPhotoInput,
  ListProgressPhotosOptions,
  ProgressPhotoIntegrityReport,
  ProgressPhotoRepository,
} from '../repository/ProgressPhotoRepository';
import type { PhotoPose, ProgressPhoto } from '../types/ProgressPhoto';
import { ProgressPhotoValidationError } from './errors';

/**
 * Relative directory `progress_photo.file_name`/`.thumb_name` live inside,
 * under `FileStorage`'s `'document'` root (ADR-0012) - mirrors
 * `ProfileService.AVATAR_DIRECTORY`'s export shape. `SqliteProgressPhotoRepository`
 * carries the same literal as its own `PHOTOS_DIRECTORY` constant (a
 * repository must not depend on its feature's service layer) - see that
 * file's doc comment for why the two are not unified into one shared export.
 */
export const PROGRESS_PHOTO_DIRECTORY = 'progress-photos';

export const PHOTO_NOTE_MAX_LENGTH = 1000;

/** ADR-0012: full image capped at 1600px long edge, JPEG quality 0.8. */
const FULL_MAX_LONG_EDGE = 1600;
const FULL_QUALITY = 0.8;
/** ADR-0012: thumbnail 240x240 square center-crop, JPEG quality 0.7. */
const THUMB_SIZE = 240;
const THUMB_QUALITY = 0.7;

const poseSchema = z.enum(['front', 'side', 'back', 'other']);
const noteSchema = z.string().trim().max(PHOTO_NOTE_MAX_LENGTH).nullish();
const takenAtSchema = z.number().finite().nonnegative();

const addPhotoSchema = z.object({
  sourceUri: z.string().trim().min(1, 'sourceUri is required.'),
  pose: poseSchema.optional(),
  note: noteSchema,
  takenAt: takenAtSchema.optional(),
});

const updatePhotoSchema = z.object({
  pose: poseSchema.optional(),
  note: noteSchema,
  takenAt: takenAtSchema.optional(),
});

/** Same `exactOptionalPropertyTypes`-driven split as `PlanService.checkWithSchema()`/`BodyMetricService`'s own helper - see either's doc comment. */
function checkWithSchema(schema: z.ZodTypeAny, input: unknown): void {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ProgressPhotoValidationError(result.error.issues);
  }
}

export interface AddProgressPhotoInput {
  /** A picker/camera result URI, outside app storage - `FileStorage.copyFrom()`'s source. */
  sourceUri: string;
  pose?: PhotoPose;
  note?: string | null;
  takenAt?: number;
}

export interface UpdateProgressPhotoInput {
  pose?: PhotoPose;
  note?: string | null;
  takenAt?: number;
}

export interface ProgressPhotoServiceDependencies {
  repository: ProgressPhotoRepository;
  files: FileStorage;
  imageProcessor: ImageProcessor;
  idGenerator: IdGenerator;
  /** Optional, same convention as `ProfileServiceDependencies.logging` - a fake in tests may omit it entirely. */
  logging?: Logger;
}

/**
 * The only door into `ProgressPhotoRepository` (ARCHITECTURE.md section 3.1,
 * rule 3 - presentation never touches a repository directly).
 */
export class ProgressPhotoService {
  constructor(private readonly deps: ProgressPhotoServiceDependencies) {}

  /**
   * ADR-0012 write-then-commit ordering: both the full image and the
   * thumbnail are processed, copied into `FileStorage`, and verified
   * non-zero-size **before** the `progress_photo` row is ever committed - so
   * the only possible inconsistency this can leave behind is an orphan file
   * with no row pointing at it, never a row pointing at a file that isn't
   * there. Unlike `ProfileService.completeOnboarding`'s best-effort avatar
   * write, a failure here always throws: adding a progress photo is an
   * explicit, standalone user action, not one optional step inside a larger
   * flow.
   *
   * @throws {ProgressPhotoValidationError} when `sourceUri` is empty, `pose`
   * is not a recognized {@link PhotoPose}, or `note` exceeds
   * {@link PHOTO_NOTE_MAX_LENGTH}.
   */
  async addPhoto(input: AddProgressPhotoInput): Promise<ProgressPhoto> {
    checkWithSchema(addPhotoSchema, input);
    const pose = input.pose ?? 'front';

    const id = this.deps.idGenerator.generate();
    const fileName = `${id}.jpg`;
    const thumbName = `${id}-thumb.jpg`;

    const [full, thumb] = await Promise.all([
      this.deps.imageProcessor.resizeToFit(input.sourceUri, FULL_MAX_LONG_EDGE, FULL_QUALITY),
      this.deps.imageProcessor.cropToSquareThumbnail(input.sourceUri, THUMB_SIZE, THUMB_QUALITY),
    ]);

    const fullRelativePath = `${PROGRESS_PHOTO_DIRECTORY}/${fileName}`;
    const thumbRelativePath = `${PROGRESS_PHOTO_DIRECTORY}/${thumbName}`;
    const [byteSize, thumbSize] = await Promise.all([
      (async () => {
        await this.deps.files.copyFrom(full.uri, fullRelativePath);
        return this.deps.files.size(fullRelativePath);
      })(),
      (async () => {
        await this.deps.files.copyFrom(thumb.uri, thumbRelativePath);
        return this.deps.files.size(thumbRelativePath);
      })(),
    ]);
    if (!byteSize) {
      throw new Error(
        `Progress photo copy produced no file (or a zero-byte file) at "${fullRelativePath}".`,
      );
    }
    if (!thumbSize) {
      throw new Error(
        `Progress photo thumbnail copy produced no file (or a zero-byte file) at "${thumbRelativePath}".`,
      );
    }

    // Built incrementally (rather than a single object literal with
    // `takenAt: input.takenAt`/`note: input.note`) because
    // `exactOptionalPropertyTypes` forbids assigning an explicit `undefined`
    // to an optional property - the key must be omitted entirely when the
    // caller didn't provide a value, the same mismatch `PlanService`'s own
    // `checkWithSchema()` doc comment describes for validation-only schemas.
    const createInput: CreateProgressPhotoInput = {
      fileName,
      thumbName,
      pose,
      width: full.width,
      height: full.height,
      byteSize,
    };
    if (input.takenAt !== undefined) {
      createInput.takenAt = input.takenAt;
    }
    if (input.note !== undefined) {
      createInput.note = input.note;
    }
    return this.deps.repository.create(createInput);
  }

  /** @throws {ProgressPhotoValidationError} when a provided `pose` is not recognized, or `note` exceeds {@link PHOTO_NOTE_MAX_LENGTH}. */
  async updatePhoto(id: EntityId, patch: UpdateProgressPhotoInput): Promise<ProgressPhoto> {
    checkWithSchema(updatePhotoSchema, patch);
    return this.deps.repository.update(id, patch);
  }

  /**
   * Soft delete only - the file stays on disk until {@link permanentlyDeletePhoto}
   * (acceptance criterion: "deleting a photo soft-deletes the row and keeps
   * the file on disk until a real purge"). Pairs with {@link restorePhoto}.
   */
  deletePhoto(id: EntityId): Promise<void> {
    return this.deps.repository.softDelete(id);
  }

  /** Undoes {@link deletePhoto}. */
  restorePhoto(id: EntityId): Promise<void> {
    return this.deps.repository.restore(id);
  }

  /**
   * Hard delete: looks the row up (including a soft-deleted one, via
   * `findByIdIncludingDeleted` - a photo already soft-deleted must still be
   * purgeable), purges the row, then deletes both its files - ADR-0012's
   * "deletion is the reverse [of write-then-commit]: the row is soft-deleted
   * first, and the file is removed only by purge()" ordering. Purging the row
   * first means a failure in the subsequent file deletes (I/O error, locked
   * DB) leaves only an orphan file with no row, the same safe-failure shape
   * {@link addPhoto}'s own doc comment describes - never a dangling row
   * pointing at files that no longer exist.
   *
   * @throws {Error} when `id` does not reference any row at all, live or
   * soft-deleted.
   */
  async permanentlyDeletePhoto(id: EntityId): Promise<void> {
    const photo = await this.deps.repository.findByIdIncludingDeleted(id);
    if (!photo) {
      throw new Error(`No progress photo with id "${id}".`);
    }

    await this.deps.repository.purge(id);
    await this.deps.files.delete(`${PROGRESS_PHOTO_DIRECTORY}/${photo.fileName}`);
    await this.deps.files.delete(`${PROGRESS_PHOTO_DIRECTORY}/${photo.thumbName}`);
  }

  listPhotos(options?: ListProgressPhotosOptions): Promise<ProgressPhoto[]> {
    return this.deps.repository.listAll(options);
  }

  /** Thin pass-through to `ProgressPhotoRepository.verifyIntegrity()` - the dev diagnostics screen's call target. */
  verifyIntegrity(): Promise<ProgressPhotoIntegrityReport> {
    return this.deps.repository.verifyIntegrity();
  }
}
