import type { QueryClient } from '@tanstack/react-query';

import type { EntityId } from '@/repositories/contracts/repository';

/**
 * Query key convention (ARCHITECTURE.md section 12.1's `[domain, scope, ...params]`
 * shape), matching `recordKeys`/`exerciseHistoryKeys`'s precedent. Defined here
 * rather than in `useSessionHistory.ts` (which re-exports it for its own
 * callers) so that this file's own invalidation functions can use it without
 * importing back from `useSessionHistory.ts` - the reverse direction closes a
 * real `useSessionHistory -> invalidation -> useSessionHistory` cycle
 * (`import/no-cycle`), which is exactly what previously forced
 * `useSessionHistory.ts`'s mutation hooks to keep their own duplicate
 * invalidation logic instead of calling {@link invalidateAfterHistoricalEdit}
 * directly.
 */
export const sessionHistoryKeys = {
  list: () => ['workout-logging', 'sessionHistory', 'list'] as const,
  detail: (sessionId: EntityId) =>
    ['workout-logging', 'sessionHistory', 'detail', sessionId] as const,
};

/**
 * Centralized invalidation (ARCHITECTURE.md section 12.1 / ADR-0008), reproduced
 * from the ADR's own example verbatim. Several of these keys have no active
 * subscriber yet - `sessions`/`stats`/`calendar` all belong to features
 * that don't exist until later phases, and `home` renders a static wordmark
 * until P10 - but invalidating a key nothing has queried is a no-op, not an
 * error, and this keeps `finish()`/`discard()` compliant with the documented
 * rule now instead of requiring a revisit once those phases land and start
 * reading session data for the first time.
 *
 * P9: `sessionHistoryKeys.list` joins this set - a finished workout is a new
 * row `WorkoutHistoryListScreen`'s paginated query needs to see on its next
 * mount, and `records` genuinely does have a live subscriber as of P8
 * (`PersonalRecordsScreen`), so its own invalidation here is no longer
 * theoretical.
 */
export function invalidateAfterWorkoutFinish(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['sessions'] });
  void queryClient.invalidateQueries({ queryKey: ['records'] });
  void queryClient.invalidateQueries({ queryKey: ['stats'] });
  void queryClient.invalidateQueries({ queryKey: ['calendar'] });
  void queryClient.invalidateQueries({ queryKey: ['home'] });
  void queryClient.invalidateQueries({ queryKey: ['exercises', 'history'] });
  void queryClient.invalidateQueries({ queryKey: sessionHistoryKeys.list() });
}

/**
 * P9: after a historical edit (any granular mutation reused against a
 * `completed` session) or a `deleteSession` call. Every one of those already
 * recomputes totals and rebuilds affected personal records server-side (see
 * `WorkoutSessionRepository`'s own top doc comment) - this only re-points the
 * query cache at what changed: the edited/deleted session's own detail read,
 * the history list (a delete removes a row; an edit can change a list row's
 * totals), and `records` (a rebuild can promote/demote/clear a PR the
 * records screen or an exercise-detail slot is currently showing).
 */
export function invalidateAfterHistoricalEdit(queryClient: QueryClient, sessionId: string): void {
  void queryClient.invalidateQueries({ queryKey: sessionHistoryKeys.detail(sessionId) });
  void queryClient.invalidateQueries({ queryKey: sessionHistoryKeys.list() });
  void queryClient.invalidateQueries({ queryKey: ['records'] });
  void queryClient.invalidateQueries({ queryKey: ['exercises', 'history'] });
}
