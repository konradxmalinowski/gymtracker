import { useCallback } from 'react';

import type {
  CompleteSetValues,
  SetSeed,
  UpdateSetPatch,
  WorkoutSet,
} from '@/features/workout-logging';
import { t } from '@/i18n';
import { useContainer } from '@/services/container';
import { haptics } from '@/services/haptics';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { useToastStore } from '@/stores/toastStore';

import { recoverFromWriteFailure } from './sessionSync';

/** `AddSetButton` - pre-fill is the repository's own job (FR-11); this only needs to commit whatever comes back. Not front-run optimistically for the same reason `useAddExercise` isn't: no client-side id yet. */
export function useAppendSet() {
  const { sessionService } = useContainer();
  return useCallback(
    async (sessionExerciseId: string, seed: SetSeed = {}) => {
      try {
        const workoutSet = await sessionService.appendSet(sessionExerciseId, seed);
        useActiveWorkoutStore.getState().upsertSet(workoutSet);
        return workoutSet;
      } catch {
        await recoverFromWriteFailure(sessionService);
        return null;
      }
    },
    [sessionService],
  );
}

/**
 * Field edits (weight/reps/RPE/note/set-type) from a `SetRow`'s inline
 * expanded editor - optimistic per ADR-0008 rule 2, reconciled with the
 * canonical row once the write settles so any server-side normalization
 * (e.g. rounding) is reflected back.
 */
export function useUpdateSet() {
  const { sessionService } = useContainer();
  return useCallback(
    (setId: string, patch: UpdateSetPatch) => {
      useActiveWorkoutStore.getState().patchSet(setId, patch);
      void sessionService.updateSet(setId, patch).then(
        (canonical) => useActiveWorkoutStore.getState().upsertSet(canonical),
        () => recoverFromWriteFailure(sessionService),
      );
    },
    [sessionService],
  );
}

/**
 * The NFR-01 hot path (ARCHITECTURE.md section 5.1): the store update and the
 * haptic fire synchronously, before the service call even starts - nothing
 * here is awaited by the caller (`SetRow`'s checkbox `onPress` calls this and
 * returns immediately). PR evaluation and the rest timer are out of scope
 * (`CompletedSetResult.newPRs` is always `[]` in P6).
 */
export function useCompleteSet() {
  const { sessionService } = useContainer();
  return useCallback(
    (workoutSet: WorkoutSet, values: CompleteSetValues = {}) => {
      useActiveWorkoutStore.getState().patchSet(workoutSet.id, {
        ...values,
        isCompleted: true,
        completedAt: values.completedAt ?? Date.now(),
      });
      haptics.setCompleted();
      void sessionService.completeSet(workoutSet.id, values).then(
        (result) => useActiveWorkoutStore.getState().upsertSet(result.set),
        () => recoverFromWriteFailure(sessionService),
      );
    },
    [sessionService],
  );
}

export function useUncompleteSet() {
  const { sessionService } = useContainer();
  return useCallback(
    (setId: string) => {
      useActiveWorkoutStore.getState().patchSet(setId, { isCompleted: false, completedAt: null });
      void sessionService.uncompleteSet(setId).then(
        (canonical) => useActiveWorkoutStore.getState().upsertSet(canonical),
        () => recoverFromWriteFailure(sessionService),
      );
    },
    [sessionService],
  );
}

/** "Add drop set" (SetRow's expanded editor, parent sets only) - awaited, same reasoning as `useAppendSet`. */
export function useAddDropSet() {
  const { sessionService } = useContainer();
  return useCallback(
    async (parentSetId: string, seed: SetSeed = {}) => {
      try {
        const workoutSet = await sessionService.addDropSet(parentSetId, seed);
        useActiveWorkoutStore.getState().upsertSet(workoutSet);
      } catch {
        await recoverFromWriteFailure(sessionService);
      }
    },
    [sessionService],
  );
}

/** Swipe-left delete, with an undo toast restoring the set with its original id (P6 acceptance criterion) - the same object removed from the store is the one re-inserted, not a re-fetch. */
export function useDeleteSet() {
  const { sessionService } = useContainer();
  return useCallback(
    (workoutSet: WorkoutSet) => {
      haptics.destructive();
      useActiveWorkoutStore.getState().removeSetLocally(workoutSet.id);
      void sessionService
        .deleteSet(workoutSet.id)
        .catch(() => recoverFromWriteFailure(sessionService));

      useToastStore.getState().show({
        message: t('workoutLogging.active.setDeletedUndoMessage'),
        actionLabel: t('common.undo'),
        onAction: () => {
          useActiveWorkoutStore.getState().upsertSet(workoutSet);
          void sessionService
            .restoreSet(workoutSet.id)
            .catch(() => recoverFromWriteFailure(sessionService));
        },
      });
    },
    [sessionService],
  );
}
