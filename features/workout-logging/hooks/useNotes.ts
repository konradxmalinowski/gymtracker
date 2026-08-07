import { useCallback } from 'react';

import { useContainer } from '@/services/container';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';

import { recoverFromWriteFailure } from './sessionSync';

/**
 * FR-16's two note fields. Both follow the same await-then-commit shape as
 * `useAddExercise`/`useAppendSet`/`useAddDropSet` - not the synchronous-
 * optimistic-then-reconcile pattern the NFR-01 hot path (`useCompleteSet`
 * etc.) uses. Editing a note is a deliberate, occasional action behind an
 * explicit "save" tap (the inline editor in `ExerciseHeader`, the sheet in
 * `WorkoutHeader`), not a per-tap interaction with a latency budget - the
 * same reasoning `useExerciseMutations.ts`'s file header gives for
 * `useAddExercise`.
 */
export function useSetExerciseNote() {
  const { sessionService } = useContainer();
  return useCallback(
    async (sessionExerciseId: string, note: string | null) => {
      try {
        await sessionService.setExerciseNote(sessionExerciseId, note);
        useActiveWorkoutStore.getState().patchExercise(sessionExerciseId, { note });
      } catch {
        await recoverFromWriteFailure(sessionService);
      }
    },
    [sessionService],
  );
}

/**
 * `setSessionNotes` is deliberately not restricted to in-progress sessions on
 * the service side, so this hook doesn't gate the call on session status
 * either - `WorkoutHeader`'s notes sheet stays usable for as long as the
 * screen itself is mounted, regardless of what `finish()`/`discard()` do to
 * `status` in the same tick.
 */
export function useSetSessionNotes() {
  const { sessionService } = useContainer();
  return useCallback(
    async (sessionId: string, notes: string | null) => {
      try {
        await sessionService.setSessionNotes(sessionId, notes);
        useActiveWorkoutStore.getState().setSessionNotes(notes);
      } catch {
        await recoverFromWriteFailure(sessionService);
      }
    },
    [sessionService],
  );
}
