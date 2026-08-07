import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useContainer } from '@/services/container';
import { kv } from '@/services/kv';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { useToastStore } from '@/stores/toastStore';

import { invalidateAfterWorkoutFinish } from './invalidation';

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
 */
export function useFinishDiscardWorkout(): UseFinishDiscardWorkoutResult {
  const { sessionService } = useContainer();
  const queryClient = useQueryClient();
  const [isFinishing, setIsFinishing] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  const clearAndExit = useCallback(() => {
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
