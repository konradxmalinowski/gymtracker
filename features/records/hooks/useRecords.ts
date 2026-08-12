import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { EntityId } from '@/repositories/contracts/repository';

import type { PersonalRecordService } from '../services/PersonalRecordService';

/**
 * Every hook here takes `recordService` as its first parameter instead of
 * calling `useContainer()` internally - the same pattern
 * `useStartWorkout(sessionService)` (`features/workout-logging/hooks/
 * useStartWorkout.ts`) already established, and for the same reason: these
 * hooks are re-exported through `features/records/index.ts` so `profile`/
 * `app/` can reach them, and `services/container.ts` itself imports
 * `PersonalRecordService` from that same barrel - a hook in this file that
 * imported `@/services/container` directly would close a real cycle
 * (barrel -> this hook -> container -> barrel), caught by `import/no-cycle`.
 * Each hook's own caller already holds the container (`useContainer()` is
 * always called from a component, never nested inside another feature's
 * barrel-exported hook) and passes the one service down.
 */

/** Query key convention (ARCHITECTURE.md section 12.1's `[domain, scope, ...params]` shape), matching `exerciseKeys`/`useSettings.ts`'s precedent. */
export const recordKeys = {
  all: ['records'] as const,
  current: (exerciseId: EntityId) => ['records', 'current', exerciseId] as const,
  recent: (limit: number) => ['records', 'recent', limit] as const,
};

/**
 * One exercise's current records (every record type), for the
 * `ExerciseDetailScreen` personal-records slot. `exerciseId` is
 * `string | undefined` and the query is `enabled` only once it resolves -
 * the same `useExercise`/`enabled: Boolean(id)` pattern this hook's caller
 * (`app/(tabs)/exercises/[id].tsx`) needs while its route param is still
 * resolving.
 */
export function useCurrentRecords(
  recordService: PersonalRecordService,
  exerciseId: EntityId | undefined,
) {
  return useQuery({
    queryKey: recordKeys.current(exerciseId ?? ''),
    queryFn: () => recordService.listCurrent(exerciseId as EntityId),
    enabled: Boolean(exerciseId),
  });
}

/** Most recently achieved current records across every exercise - `PersonalRecordsScreen`'s data source. */
export function useRecentRecords(recordService: PersonalRecordService, limit: number) {
  return useQuery({
    queryKey: recordKeys.recent(limit),
    queryFn: () => recordService.listRecent(limit),
  });
}

/** "Recalculate records" (Settings) - a real, potentially slow bulk recompute; the caller gates this behind a `ConfirmDialog` and shows a pending/loading state, not this hook's concern. */
export function useRebuildRecords(recordService: PersonalRecordService) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => recordService.rebuild(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recordKeys.all });
    },
  });
}
