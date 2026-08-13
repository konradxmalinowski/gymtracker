import { useCallback, useState } from 'react';
import { useInfiniteQuery, useQuery, type QueryClient } from '@tanstack/react-query';

import type { EntityId } from '@/repositories/contracts/repository';
import { t } from '@/i18n';
import { useToastStore } from '@/stores/toastStore';

import { invalidateAfterHistoricalEdit, sessionHistoryKeys } from './invalidation';
import type {
  CompleteSetValues,
  SessionAggregate,
  SessionSummary,
  SetSeed,
  UpdateSetPatch,
} from '../repository/WorkoutSessionRepository';
import type { WorkoutSessionService } from '../services/WorkoutSessionService';

/**
 * P9's presentation-facing wrapper over the history/summary read paths and
 * the granular mutation methods reused against a `completed` session (see
 * `WorkoutSessionRepository`'s own top doc comment, "P9's historical-edit
 * mechanism"). Every hook here takes `sessionService` (and, where a cache
 * read/write is needed, `queryClient`) as a parameter rather than calling
 * `useContainer()` internally - the same import-cycle reason
 * `useExerciseHistory.ts`'s own header comment gives for its hooks, and the
 * same reason `useStartWorkout(sessionService)` already established
 * precedent for in this feature's own barrel: `services/container.ts`
 * imports `WorkoutSessionService` from `features/workout-logging`'s barrel,
 * so a hook that imported `@/services/container` directly here would risk
 * closing a cycle the moment anything in this file is ever barrel-exported.
 * Callers (`WorkoutSummaryScreen`, `WorkoutHistoryListScreen`,
 * `WorkoutHistoryDetailScreen`) already hold `useContainer()` themselves.
 */

/**
 * The one-shot key `useFinishDiscardWorkout` seeds with `finish()`'s real
 * `SessionSummary` (including `newPRs`) before navigating to
 * `workout/summary/[sessionId]`. Deliberately a *different* key family from
 * {@link sessionHistoryKeys} below - `SessionSummary` and `SessionAggregate`
 * are different shapes (only the former carries `newPRs`), and mixing them
 * under one key would make `initialData`'s type lie about what the cache
 * actually holds on a cold-cache fallback.
 */
export const sessionSummaryKeys = {
  detail: (sessionId: EntityId) => ['workout-logging', 'sessionSummary', sessionId] as const,
};

/**
 * Re-exported so existing callers/tests importing `sessionHistoryKeys` from
 * this module path keep working - the key factory itself now lives in
 * `invalidation.ts`. Its move there is what let this file's mutation hooks
 * (below) call {@link invalidateAfterHistoricalEdit} directly instead of
 * keeping their own private `invalidateHistoryQueries` duplicate, which
 * previously existed only to dodge the `useSessionHistory -> invalidation ->
 * useSessionHistory` cycle that importing the real function used to close.
 */
export { sessionHistoryKeys };

/** How many `SessionListItem` rows `useSessionHistoryList` fetches per page - within `repositories/query`'s own clamp (max 100), generous enough that a normal scroll session rarely needs more than two or three pages. */
const HISTORY_PAGE_SIZE = 50;

/**
 * `WorkoutSummaryScreen`'s data source. On the normal path (just finished),
 * `initialData` reads the value `useFinishDiscardWorkout` already seeded
 * under this exact key, so the query never calls `queryFn` at all - the
 * summary renders instantly with the real `newPRs` from `finish()`'s own
 * transaction, no extra request. If the cache is ever cold (the app was
 * backgrounded and evicted it, or a user somehow lands on this route later -
 * see `navigation/routes.ts`'s `workout.summary` doc comment for why that
 * shouldn't normally happen), `queryFn` falls back to `getSession()` for the
 * totals and renders an empty `newPRs` array: this route is a one-time
 * celebratory view by design, not a re-derivable read (`SessionSummary.newPRs`
 * cannot be recomputed after the fact - see that field's own doc comment).
 */
export function useSessionSummary(
  sessionService: WorkoutSessionService,
  queryClient: QueryClient,
  sessionId: EntityId | undefined,
) {
  return useQuery({
    queryKey: sessionSummaryKeys.detail(sessionId ?? ''),
    queryFn: async (): Promise<SessionSummary | null> => {
      const session = await sessionService.getSession(sessionId as EntityId);
      if (!session) {
        return null;
      }
      return {
        sessionId: session.id,
        title: session.title,
        startedAt: session.startedAt,
        finishedAt: session.finishedAt,
        localDate: session.localDate,
        durationSeconds: session.durationSeconds,
        totalVolumeKg: session.totalVolumeKg,
        totalSets: session.totalSets,
        totalReps: session.totalReps,
        estimatedKcal: session.estimatedKcal,
        newPRs: [],
      };
    },
    // `app/workout/summary/[sessionId].tsx` reads `sessionId` via
    // `useLocalSearchParams`, which can render `undefined` on an early pass
    // despite its typed-route signature claiming `string` - the same
    // still-resolving-route-param case `useSessionDetail` already guards
    // against. Without this, an undefined-keyed fetch would run immediately
    // and miss the entry `useFinishDiscardWorkout` seeded under the real id.
    enabled: Boolean(sessionId),
    initialData: () =>
      queryClient.getQueryData<SessionSummary>(sessionSummaryKeys.detail(sessionId ?? '')),
    // The seeded value never goes stale on its own - nothing re-derives
    // `newPRs` later (see this hook's own doc comment) - so there is nothing
    // to gain from a background refetch racing the initial render.
    staleTime: Infinity,
  });
}

/**
 * Full detail for one `completed` session - `WorkoutSummaryScreen`'s
 * exercise-count/exercise-list source (`SessionSummary` itself carries
 * neither) and `WorkoutHistoryDetailScreen`'s sole data source. `sessionId`
 * is `string | undefined` and the query is `enabled` only once it resolves,
 * the same pattern `usePreviousPerformance`/`useCurrentRecords` already use
 * for a still-resolving route param.
 */
export function useSessionDetail(
  sessionService: WorkoutSessionService,
  sessionId: EntityId | undefined,
) {
  return useQuery({
    queryKey: sessionHistoryKeys.detail(sessionId ?? ''),
    queryFn: () => sessionService.getSession(sessionId as EntityId),
    enabled: Boolean(sessionId),
  });
}

/**
 * `WorkoutHistoryListScreen`'s paginated data source
 * (`WorkoutSessionRepository.listHistory`'s own doc comment: "never an
 * unbounded `SELECT *`"). `useInfiniteQuery` rather than fetching everything
 * up front - the roadmap's own 2,500-session NFR requires the screen to
 * never hold more than a window of rows at once, and `listHistory` is
 * already offset-paginated at the repository level to make that possible.
 */
export function useSessionHistoryList(sessionService: WorkoutSessionService) {
  return useInfiniteQuery({
    queryKey: sessionHistoryKeys.list(),
    queryFn: ({ pageParam }) =>
      sessionService.listHistory({ limit: HISTORY_PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < HISTORY_PAGE_SIZE ? undefined : allPages.length * HISTORY_PAGE_SIZE,
  });
}

export interface UseHistoricalSessionMutationsResult {
  addExercise: (exerciseId: EntityId) => Promise<void>;
  removeExercise: (sessionExerciseId: EntityId) => Promise<void>;
  restoreExercise: (sessionExerciseId: EntityId) => Promise<void>;
  setExerciseNote: (sessionExerciseId: EntityId, note: string | null) => Promise<void>;
  appendSet: (sessionExerciseId: EntityId, seed?: SetSeed) => Promise<void>;
  updateSet: (setId: EntityId, patch: UpdateSetPatch) => Promise<void>;
  completeSet: (setId: EntityId, values?: CompleteSetValues) => Promise<void>;
  uncompleteSet: (setId: EntityId) => Promise<void>;
  deleteSet: (setId: EntityId) => Promise<void>;
  restoreSet: (setId: EntityId) => Promise<void>;
  addDropSet: (parentSetId: EntityId, seed?: SetSeed) => Promise<void>;
  updateNotes: (notes: string | null) => Promise<void>;
  /** `true` while any of the above is in flight - `WorkoutHistoryDetailScreen` disables further edits (and the delete action) while one settles, rather than letting two edits race each other's `syncCompletedSessionAfterEdit` recompute. */
  isMutating: boolean;
}

/**
 * `WorkoutHistoryDetailScreen`'s edit-mode wrapper: one hook covering every
 * granular mutation method reused against a `completed` session, plus
 * `updateHistoricalSession`'s own `notes`-only surface. Deliberately not
 * front-run with an optimistic local patch the way `useSetMutations.ts`/
 * `useExerciseMutations.ts` are for the *active* workout - those hooks exist
 * because `activeWorkoutStore` needs to feel instant per NFR-01; a historical
 * edit has no such budget, and every one of these methods already recomputes
 * totals and rebuilds personal records server-side (see the repository's own
 * doc comment), so the simplest correct shape here is "await the write, then
 * invalidate" rather than a second local-reconciliation mechanism to keep in
 * sync with that server-side recompute.
 */
export function useHistoricalSessionMutations(
  sessionService: WorkoutSessionService,
  queryClient: QueryClient,
  sessionId: EntityId,
): UseHistoricalSessionMutationsResult {
  const [pendingCount, setPendingCount] = useState(0);

  const run = useCallback(
    async (op: () => Promise<unknown>) => {
      setPendingCount((count) => count + 1);
      try {
        await op();
        invalidateAfterHistoricalEdit(queryClient, sessionId);
      } catch {
        useToastStore.getState().show({ message: t('workoutLogging.history.editErrorMessage') });
      } finally {
        setPendingCount((count) => count - 1);
      }
    },
    [queryClient, sessionId],
  );

  return {
    addExercise: (exerciseId) => run(() => sessionService.addExercise(sessionId, exerciseId)),
    removeExercise: (sessionExerciseId) =>
      run(() => sessionService.removeExercise(sessionExerciseId)),
    restoreExercise: (sessionExerciseId) =>
      run(() => sessionService.restoreExercise(sessionExerciseId)),
    setExerciseNote: (sessionExerciseId, note) =>
      run(() => sessionService.setExerciseNote(sessionExerciseId, note)),
    appendSet: (sessionExerciseId, seed) =>
      run(() => sessionService.appendSet(sessionExerciseId, seed)),
    updateSet: (setId, patch) => run(() => sessionService.updateSet(setId, patch)),
    completeSet: (setId, values) => run(() => sessionService.completeSet(setId, values)),
    uncompleteSet: (setId) => run(() => sessionService.uncompleteSet(setId)),
    deleteSet: (setId) => run(() => sessionService.deleteSet(setId)),
    restoreSet: (setId) => run(() => sessionService.restoreSet(setId)),
    addDropSet: (parentSetId, seed) => run(() => sessionService.addDropSet(parentSetId, seed)),
    updateNotes: (notes) => run(() => sessionService.updateHistoricalSession(sessionId, notes)),
    isMutating: pendingCount > 0,
  };
}

export interface UseDeleteSessionResult {
  deleteSession: () => Promise<boolean>;
  isDeleting: boolean;
}

/**
 * `deleteSession` - hard delete, no undo (see the repository method's own
 * doc comment for the `PlanRepository.purgePlan` precedent). Returns whether
 * the delete actually committed so the caller (`WorkoutHistoryDetailScreen`)
 * can decide whether to navigate away, mirroring how `useFinishDiscardWorkout`
 * only calls `clearAndExit()` after `sessionService.finish()`/`discard()`
 * actually resolve.
 */
export function useDeleteSession(
  sessionService: WorkoutSessionService,
  queryClient: QueryClient,
  sessionId: EntityId,
): UseDeleteSessionResult {
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteSession = useCallback(async () => {
    setIsDeleting(true);
    try {
      await sessionService.deleteSession(sessionId);
      invalidateAfterHistoricalEdit(queryClient, sessionId);
      return true;
    } catch {
      useToastStore.getState().show({ message: t('workoutLogging.history.deleteErrorMessage') });
      return false;
    } finally {
      setIsDeleting(false);
    }
  }, [sessionService, queryClient, sessionId]);

  return { deleteSession, isDeleting };
}

/** Re-exported so callers of this file don't also need a direct import from `../repository/WorkoutSessionRepository` just to type a `getSession` result. */
export type { SessionAggregate };
