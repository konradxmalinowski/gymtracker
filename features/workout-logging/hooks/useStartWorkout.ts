import { useCallback, useState } from 'react';
import { router } from 'expo-router';

import type {
  ActiveSessionAggregate,
  ActiveSessionSnapshot,
  StartSessionResult,
  WorkoutSessionService,
} from '@/features/workout-logging';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { kv } from '@/services/kv';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { useToastStore } from '@/stores/toastStore';

export interface UseStartWorkoutResult {
  startFromPlanDay: (planDayId: string) => Promise<void>;
  startEmpty: () => Promise<void>;
  isStarting: boolean;
  /** Set when the service reports `outcome: 'blocked'` - a session is already in progress. The caller renders a resume/cancel prompt from this. */
  blockedSession: ActiveSessionSnapshot | null;
  dismissBlocked: () => void;
  /** Hydrates the store with the already-in-progress session and navigates - the "Resume" choice on the blocked prompt. */
  resumeBlocked: () => void;
}

/**
 * Shared by every start entry point (`PlanDayCard`'s "Start workout", Home's
 * "Quick Start"): calls the service, writes the `session.active`/
 * `session.activeId` MMKV flags per ADR-0005 mechanism 6 (this hook's call
 * site is exactly the "UI-adjacent call site" CLAUDE.md's P6 brief describes -
 * services never import `services/kv` themselves), hydrates
 * `activeWorkoutStore` directly with the just-created aggregate (skips the
 * round trip `useActiveSessionHydration` would otherwise make inside
 * `ActiveWorkoutScreen` a moment later), and navigates to `workout/active`.
 *
 * A `SessionAlreadyInProgressError` is not a thrown exception here - the
 * service already turns it into `{ outcome: 'blocked', existing }`
 * (`WorkoutSessionService.start`'s own doc comment) - so the blocked state is
 * rendered by the caller via `blockedSession`, not caught as an error.
 *
 * Takes `sessionService` as a parameter rather than calling `useContainer()`
 * itself, deliberately: this is the one hook this feature's barrel
 * re-exports (see `index.ts`'s doc comment on that export), and
 * `services/container.ts` itself imports `WorkoutSessionService` through
 * that same barrel - if this hook also imported `useContainer` from
 * `@/services/container`, the module graph would be
 * `container.ts -> features/workout-logging (barrel) -> useStartWorkout.ts
 * -> services/container.ts`, a real cycle `import/no-cycle` correctly
 * rejects. Every caller (`PlanDetailScreen`, Home) already has its own
 * `useContainer()` call and passes `sessionService` straight through.
 */
export function useStartWorkout(sessionService: WorkoutSessionService): UseStartWorkoutResult {
  const [isStarting, setIsStarting] = useState(false);
  const [blockedSession, setBlockedSession] = useState<ActiveSessionSnapshot | null>(null);

  function enterWorkout(session: ActiveSessionAggregate) {
    useActiveWorkoutStore.getState().setSession(session);
    useActiveWorkoutStore.getState().markHydrated();
    kv.set('session.active', true);
    kv.set('session.activeId', session.id);
    router.push(routes.workout.active());
  }

  const run = useCallback(async (start: () => Promise<StartSessionResult>) => {
    setIsStarting(true);
    try {
      const result = await start();
      if (result.outcome === 'blocked') {
        setBlockedSession(result.existing);
        return;
      }
      enterWorkout(result.session);
    } catch {
      useToastStore.getState().show({ message: t('workoutLogging.start.genericErrorMessage') });
    } finally {
      setIsStarting(false);
    }
  }, []);

  return {
    startFromPlanDay: (planDayId) => run(() => sessionService.startFromPlanDay(planDayId)),
    startEmpty: () => run(() => sessionService.startEmpty()),
    isStarting,
    blockedSession,
    dismissBlocked: () => setBlockedSession(null),
    resumeBlocked: () => {
      if (!blockedSession) {
        return;
      }
      enterWorkout(blockedSession.session);
      setBlockedSession(null);
    },
  };
}
