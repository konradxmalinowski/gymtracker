import { useCallback } from 'react';

import type { SessionExercise } from '@/features/workout-logging';
import { t } from '@/i18n';
import { useContainer } from '@/services/container';
import { haptics } from '@/services/haptics';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { useToastStore } from '@/stores/toastStore';

import { recoverFromWriteFailure } from './sessionSync';

/**
 * `addExercise` is the one mutation in this file that is *not* front-run with
 * a synchronous store update before the repository call (contrast every hook
 * in `useSetMutations.ts`, and `useRemoveExercise`/`useReorderExercises`
 * below). A true optimistic insert needs the full `SessionExercise` shape
 * (image, tracking type, favorite state) available client-side before the
 * write - the picker only returns exercise ids, not the looked-up
 * `ExerciseListItem` - and this is a structural, occasional edit, not the
 * per-tap interaction NFR-01 budgets. Awaiting the service call and
 * committing its result is the simpler, still-correct choice here; see the
 * P6 handoff report for the same reasoning spelled out once, in full.
 */
export function useAddExercise() {
  const { sessionService } = useContainer();
  return useCallback(
    async (sessionId: string, exerciseId: string) => {
      try {
        const exercise = await sessionService.addExercise(sessionId, exerciseId);
        useActiveWorkoutStore.getState().upsertExercise(exercise);
      } catch {
        await recoverFromWriteFailure(sessionService);
      }
    },
    [sessionService],
  );
}

/** Swipe/overflow "Remove" - optimistic, with an undo toast restoring the exact object that was removed (the undo target is `restoreExercise`, which brings back exactly this row and its sets, not a re-add). */
export function useRemoveExercise() {
  const { sessionService } = useContainer();
  return useCallback(
    (exercise: SessionExercise) => {
      haptics.destructive();
      useActiveWorkoutStore.getState().removeExerciseLocally(exercise.id);
      void sessionService
        .removeExercise(exercise.id)
        .catch(() => recoverFromWriteFailure(sessionService));

      useToastStore.getState().show({
        message: t('workoutLogging.active.exerciseRemovedUndoMessageTemplate', {
          name: exercise.exerciseNameSnapshot,
        }),
        actionLabel: t('common.undo'),
        onAction: () => {
          useActiveWorkoutStore.getState().upsertExercise(exercise);
          void sessionService
            .restoreExercise(exercise.id)
            .catch(() => recoverFromWriteFailure(sessionService));
        },
      });
    },
    [sessionService],
  );
}

/** Move-up/move-down (see `SessionExerciseCard`'s header) rather than a drag gesture - `DraggableList` requires a fixed row height, and a card's height varies with its set count, so drag reordering is not usable here; the accessible non-gesture path `DraggableList` itself falls back to for the same reason is used directly, not as a fallback. */
export function useReorderExercises() {
  const { sessionService } = useContainer();
  return useCallback(
    (sessionId: string, orderedIds: readonly string[]) => {
      useActiveWorkoutStore.getState().reorderExercisesLocally(orderedIds);
      void sessionService
        .reorderExercises(sessionId, orderedIds)
        .catch(() => recoverFromWriteFailure(sessionService));
    },
    [sessionService],
  );
}

export function useSetSupersetGroup() {
  const { sessionService } = useContainer();
  return useCallback(
    (sessionExerciseIds: readonly string[], group: number | null) => {
      useActiveWorkoutStore.getState().setSupersetGroupLocally(sessionExerciseIds, group);
      void sessionService
        .setSupersetGroup(sessionExerciseIds, group)
        .catch(() => recoverFromWriteFailure(sessionService));
    },
    [sessionService],
  );
}
