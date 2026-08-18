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

export interface StartWorkoutNavigationOptions {
  /**
   * Defaults to `'push'` (every existing caller's behavior, unchanged).
   * Pass `'replace'` when the caller is itself a screen that must not remain
   * on the stack once the workout starts - e.g. a `(modals)` picker. A plain
   * push would leave that screen sitting underneath `workout/active`, and
   * there is no correct way to remove it *afterward*: `router.back()` at
   * that point targets whichever screen is currently focused (`workout/
   * active`, the one just pushed), not the earlier picker underneath it -
   * confirmed against `goBack`'s bubbling semantics in `node_modules/
   * expo-router`, this doesn't just risk a stale screen, it pops the wrong
   * one. `router.replace` swaps the caller's own stack entry for
   * `workout/active` in one atomic action instead - the same cross-group
   * `replace` mechanism `useFinishDiscardWorkout` already uses for
   * `finish()`/`discard()` (ADR-0007 rule 3), so there is no push-then-pop
   * ordering to get right.
   */
  navigation?: 'push' | 'replace';
}

export interface UseStartWorkoutResult {
  startFromPlanDay: (planDayId: string, options?: StartWorkoutNavigationOptions) => Promise<void>;
  startEmpty: (options?: StartWorkoutNavigationOptions) => Promise<void>;
  isStarting: boolean;
  /** Set when the service reports `outcome: 'blocked'` - a session is already in progress. The caller renders a resume/cancel prompt from this. */
  blockedSession: ActiveSessionSnapshot | null;
  dismissBlocked: () => void;
  /** Hydrates the store with the already-in-progress session and navigates - the "Resume" choice on the blocked prompt. */
  resumeBlocked: (options?: StartWorkoutNavigationOptions) => void;
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

  function enterWorkout(session: ActiveSessionAggregate, navigation: 'push' | 'replace' = 'push') {
    useActiveWorkoutStore.getState().setSession(session);
    useActiveWorkoutStore.getState().markHydrated();
    kv.set('session.active', true);
    kv.set('session.activeId', session.id);
    if (navigation === 'replace') {
      router.replace(routes.workout.active());
    } else {
      router.push(routes.workout.active());
    }
  }

  const run = useCallback(
    async (start: () => Promise<StartSessionResult>, navigation: 'push' | 'replace' = 'push') => {
      setIsStarting(true);
      try {
        const result = await start();
        if (result.outcome === 'blocked') {
          setBlockedSession(result.existing);
          return;
        }
        enterWorkout(result.session, navigation);
      } catch {
        useToastStore.getState().show({ message: t('workoutLogging.start.genericErrorMessage') });
      } finally {
        setIsStarting(false);
      }
    },
    [],
  );

  return {
    startFromPlanDay: (planDayId, options) =>
      run(() => sessionService.startFromPlanDay(planDayId), options?.navigation),
    startEmpty: (options) => run(() => sessionService.startEmpty(), options?.navigation),
    isStarting,
    blockedSession,
    dismissBlocked: () => setBlockedSession(null),
    resumeBlocked: (options) => {
      if (!blockedSession) {
        return;
      }
      enterWorkout(blockedSession.session, options?.navigation);
      setBlockedSession(null);
    },
  };
}
