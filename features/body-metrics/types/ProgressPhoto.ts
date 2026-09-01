import type { EntityId } from '@/repositories/contracts/repository';

export type PhotoPose = 'front' | 'side' | 'back' | 'other';

/**
 * One `progress_photo` row, camelCase. `fileName`/`thumbName` are relative
 * names only (`ProgressPhotoService.PROGRESS_PHOTO_DIRECTORY`-scoped), never
 * absolute URIs - the same `FileStorage` relative-name convention
 * `user_profile.avatar_file_name` already established (see `services/files/
 * FileStorage.ts`'s own header comment for why: an absolute
 * `file:///.../Application/<uuid>/...` path dangles after the next iOS
 * update).
 */
export interface ProgressPhoto {
  id: EntityId;
  fileName: string;
  thumbName: string;
  pose: PhotoPose;
  takenAt: number;
  localDate: string;
  width: number;
  height: number;
  byteSize: number;
  note: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}
