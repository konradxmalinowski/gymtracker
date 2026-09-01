import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import type { EntityId } from '@/repositories/contracts/repository';
import { useContainer } from '@/services/container';

import type {
  AddProgressPhotoInput,
  UpdateProgressPhotoInput,
} from '../services/ProgressPhotoService';
import type { PhotoPose } from '../types/ProgressPhoto';
import { invalidatePhotoQueries } from './invalidation';
import { photoKeys } from './queryKeys';

/**
 * `ProgressPhotoRepository.listAll`'s default `Pagination` clamp
 * (`repositories/query/OrderAndPage.ts`) is 20/page, not unbounded - a real
 * `useInfiniteQuery`, mirroring `useSessionHistoryList`'s exact shape
 * (`features/workout-logging/hooks/useSessionHistory.ts`), not a single
 * unbounded fetch. `PhotoGridScreen` is the one screen in this feature where
 * real photo counts are expected to exceed a bounded default page.
 */
const PHOTOS_PAGE_SIZE = 30;

export function usePhotoList(pose?: PhotoPose) {
  const { progressPhotoService } = useContainer();

  return useInfiniteQuery({
    queryKey: photoKeys.list(pose),
    queryFn: ({ pageParam }) =>
      progressPhotoService.listPhotos({
        limit: PHOTOS_PAGE_SIZE,
        offset: pageParam,
        ...(pose ? { pose } : {}),
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PHOTOS_PAGE_SIZE ? undefined : allPages.length * PHOTOS_PAGE_SIZE,
  });
}

/**
 * Wraps `ProgressPhotoService.addPhoto` - `sourceUri` is an `expo-image-picker`/
 * camera result URI, resolved by the caller (`PhotoSourceSheetContent`, which
 * owns the actual `launchCameraAsync`/`launchImageLibraryAsync` calls and
 * their permission handling, mirroring `OnboardingScreen.handlePickAvatar`'s
 * exact pattern) - this hook stays a thin service wrapper with no
 * `expo-image-picker` import of its own.
 *
 * @throws {ProgressPhotoValidationError} when `sourceUri` is empty, `pose` is
 * not recognized, or `note` exceeds `PHOTO_NOTE_MAX_LENGTH`.
 */
export function useAddPhoto() {
  const { progressPhotoService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AddProgressPhotoInput) => progressPhotoService.addPhoto(input),
    onSuccess: () => invalidatePhotoQueries(queryClient),
  });
}

/** @throws {ProgressPhotoValidationError} when a provided `pose` is not recognized, or `note` exceeds `PHOTO_NOTE_MAX_LENGTH`. */
export function useUpdatePhoto() {
  const { progressPhotoService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch }: { id: EntityId; patch: UpdateProgressPhotoInput }) =>
      progressPhotoService.updatePhoto(id, patch),
    onSuccess: () => invalidatePhotoQueries(queryClient),
  });
}

/** Soft delete - keeps the file on disk until {@link usePermanentlyDeletePhoto}. Pairs with {@link useRestorePhoto} for the undo-toast flow (call site owns the toast, same as `useDeleteMetricEntry`). */
export function useDeletePhoto() {
  const { progressPhotoService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: EntityId) => progressPhotoService.deletePhoto(id),
    onSuccess: () => invalidatePhotoQueries(queryClient),
  });
}

/** Undoes {@link useDeletePhoto}. */
export function useRestorePhoto() {
  const { progressPhotoService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: EntityId) => progressPhotoService.restorePhoto(id),
    onSuccess: () => invalidatePhotoQueries(queryClient),
  });
}

/**
 * Irreversible - deletes both files and purges the row. The call site gates
 * this behind a `ConfirmDialog` with explicit irreversibility copy
 * (`PhotoDetailScreen`), the same pattern
 * `WorkoutHistoryDetailScreen.handleConfirmDelete` uses for its own hard
 * delete; this hook does no gating of its own.
 */
export function usePermanentlyDeletePhoto() {
  const { progressPhotoService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: EntityId) => progressPhotoService.permanentlyDeletePhoto(id),
    onSuccess: () => invalidatePhotoQueries(queryClient),
  });
}
