import type { WorkoutSessionService } from '@/features/workout-logging';
import { t } from '@/i18n';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { useToastStore } from '@/stores/toastStore';

/**
 * ADR-0008 rule 3: "if a write fails, the store is reconciled from the
 * database ... the database always wins." Every mutation hook in
 * `useSetMutations.ts`/`useExerciseMutations.ts` calls this on rejection
 * instead of trying to undo its own optimistic patch - re-reading the whole
 * aggregate is the one operation guaranteed to match whatever SQLite actually
 * committed (or didn't), rather than each call site guessing at a rollback.
 */
export async function reconcileActiveSession(sessionService: WorkoutSessionService): Promise<void> {
  const snapshot = await sessionService.findInProgress();
  useActiveWorkoutStore.getState().setSession(snapshot?.session ?? null);
}

/** Pairs with {@link reconcileActiveSession} at every mutation call site - reconcile first, then tell the user, so the toast reflects a screen that has already recovered. */
export async function recoverFromWriteFailure(
  sessionService: WorkoutSessionService,
): Promise<void> {
  await reconcileActiveSession(sessionService);
  useToastStore.getState().show({ message: t('workoutLogging.active.genericErrorMessage') });
}
