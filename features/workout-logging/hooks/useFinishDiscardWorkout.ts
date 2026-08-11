import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

import { restTimerNotificationService } from '@/features/rest-timer';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useContainer } from '@/services/container';
import { kv } from '@/services/kv';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { useRestTimerStore } from '@/stores/restTimerStore';
import { useToastStore } from '@/stores/toastStore';

import { invalidateAfterWorkoutFinish } from './invalidation';
import { bumpTimerOperationSequence } from './useRestTimer';

export interface UseFinishDiscardWorkoutResult {
  finish: (sessionId: string) => Promise<void>;
  discard: (sessionId: string) => Promise<void>;
  isFinishing: boolean;
  isDiscarding: boolean;
}

/**
 * `finish()`/`discard()` both end the same way (ADR-0008 rule 4: clear the
 * store; ADR-0005 mechanism 6: clear the MMKV flags; ADR-0008's invalidation
 * convention: invalidate the query keys finishing a workout can affect) and
 * both navigate with `router.replace`, not `push` (ADR-0007 rule 3's intent -
 * "the user cannot swipe back into a workout that no longer exists" - applied
 * to Home instead of the not-yet-built `workout/summary` route, per this
 * phase's brief).
 *
 * P7 (code review finding, pass 3 follow-up): finishing or discarding while
 * a rest timer is still running used to leave it behind entirely - neither
 * `restTimerStore` nor the scheduled OS notification was ever cleared, so
 * the next workout started with a leftover countdown on screen (nothing
 * else calls `clearDeadline()` outside a fresh `setDeadline()`/crash-recovery
 * hydration) and the stale notification still fired later, deep-linking
 * into `workout/active` with no in-progress session to show. `clearAndExit`
 * now cancels whatever notification is currently scheduled (read from the
 * about-to-be-cleared session's own `activeState.timerNotificationId` before
 * it's gone), clears the live countdown, and bumps
 * `bumpTimerOperationSequence()` so a rest-timer start/adjust operation
 * still in flight at this exact moment (e.g. its own chain is mid-await on
 * the OS permission dialog) recognizes itself as stale when it resolves and
 * skips writing `active_session_state` timer columns back into a row
 * `finish()`/`discard()` already dropped - matching
 * `features/workout-logging/hooks/useRestTimer.ts`'s own ordering-guard
 * doc comment, which names this exact call site.
 */
export function useFinishDiscardWorkout(): UseFinishDiscardWorkoutResult {
  const { sessionService } = useContainer();
  const queryClient = useQueryClient();
  const [isFinishing, setIsFinishing] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  const clearAndExit = useCallback(() => {
    bumpTimerOperationSequence();

    const timerNotificationId =
      useActiveWorkoutStore.getState().session?.activeState.timerNotificationId ?? null;
    if (timerNotificationId) {
      void restTimerNotificationService.cancelScheduledNotification(timerNotificationId);
    }
    useRestTimerStore.getState().clearDeadline();

    useActiveWorkoutStore.getState().clear();
    kv.set('session.active', false);
    kv.delete('session.activeId');
    invalidateAfterWorkoutFinish(queryClient);
    router.replace(routes.tabs.home());
  }, [queryClient]);

  const finish = useCallback(
    async (sessionId: string) => {
      setIsFinishing(true);
      try {
        await sessionService.finish(sessionId);
        clearAndExit();
      } catch {
        useToastStore.getState().show({ message: t('workoutLogging.active.finishErrorMessage') });
      } finally {
        setIsFinishing(false);
      }
    },
    [sessionService, clearAndExit],
  );

  const discard = useCallback(
    async (sessionId: string) => {
      setIsDiscarding(true);
      try {
        await sessionService.discard(sessionId);
        clearAndExit();
      } catch {
        useToastStore.getState().show({ message: t('workoutLogging.active.discardErrorMessage') });
      } finally {
        setIsDiscarding(false);
      }
    },
    [sessionService, clearAndExit],
  );

  return { finish, discard, isFinishing, isDiscarding };
}
