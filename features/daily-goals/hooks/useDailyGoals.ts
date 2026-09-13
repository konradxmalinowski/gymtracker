import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CreateDailyGoalInput, UpdateDailyGoalPatch } from '@/features/daily-goals';
import type { EntityId } from '@/repositories/contracts/repository';
import { useContainer } from '@/services/container';

import { invalidateDailyGoalQueries } from './invalidation';
import { dailyGoalKeys } from './queryKeys';

/**
 * Confined to `app/goals/**`'s own screens (never barrel-exported) - these
 * hooks call `useContainer()` internally rather than taking
 * `dailyGoalService` as a parameter, which is safe specifically because
 * nothing outside this feature's own screens consumes them. `home`'s
 * `TodaysGoalsCard` is the one cross-feature consumer this feature has, and
 * it reaches `dailyGoalService.listTodaysGoals` directly inside
 * `useHomeDashboard`'s own query function instead of importing anything from
 * here - see `domain/summarizeTodaysGoals.ts`'s doc comment for the full
 * reasoning. This mirrors every other single-feature screen's hooks file in
 * this codebase (e.g. `features/body-metrics/hooks/useBodyMetrics.ts`), not
 * the barrel-exported, dependency-injected shape `useHomeDashboard`/
 * `useCurrentRecords` need for their own cross-feature `import/no-cycle`
 * reasons.
 */

/** `DailyGoalsScreen`'s own read - every enabled goal active on `localDate`'s weekday, paired with today's entry. */
export function useTodaysGoals(localDate: string) {
  const { dailyGoalService } = useContainer();

  return useQuery({
    queryKey: dailyGoalKeys.today(localDate),
    queryFn: () => dailyGoalService.listTodaysGoals(localDate),
  });
}

/** `GoalListScreen`'s own read - every non-deleted goal, enabled or not. */
export function useAllGoals() {
  const { dailyGoalService } = useContainer();

  return useQuery({
    queryKey: dailyGoalKeys.list,
    queryFn: () => dailyGoalService.listAllGoals(),
  });
}

/** `GoalFormScreen`'s edit-mode read. `id` may be `undefined` while a route param is still resolving - `enabled: false` then, the same guard `usePlan`/`useMetricHistory` already use for the identical situation. */
export function useGoal(id: EntityId | undefined) {
  const { dailyGoalService } = useContainer();

  return useQuery({
    queryKey: dailyGoalKeys.detail(id ?? ''),
    queryFn: () => dailyGoalService.getGoal(id as EntityId),
    enabled: Boolean(id),
  });
}

/** @throws {DailyGoalValidationError} */
export function useCreateGoal() {
  const { dailyGoalService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateDailyGoalInput) => dailyGoalService.createGoal(input),
    onSuccess: () => invalidateDailyGoalQueries(queryClient),
  });
}

/** @throws {DailyGoalValidationError} */
export function useUpdateGoal() {
  const { dailyGoalService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch }: { id: EntityId; patch: UpdateDailyGoalPatch }) =>
      dailyGoalService.updateGoal(id, patch),
    onSuccess: (_data, variables) => {
      queryClient.removeQueries({ queryKey: dailyGoalKeys.detail(variables.id) });
      invalidateDailyGoalQueries(queryClient);
    },
  });
}

/**
 * Hard delete, confirm-gated (`DailyGoalService.deleteGoal`'s own doc
 * comment) - no matching restore hook, the same "no undo for a top-level
 * object's delete" shape `useDeletePlan` already establishes.
 */
export function useDeleteGoal() {
  const { dailyGoalService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: EntityId) => dailyGoalService.deleteGoal(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: dailyGoalKeys.detail(id) });
      invalidateDailyGoalQueries(queryClient);
    },
  });
}

/** This feature's real "hide without losing history" affordance (`DailyGoalService.setEnabled`'s own doc comment). */
export function useSetGoalEnabled() {
  const { dailyGoalService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isEnabled }: { id: EntityId; isEnabled: boolean }) =>
      dailyGoalService.setEnabled(id, isEnabled),
    onSuccess: () => invalidateDailyGoalQueries(queryClient),
  });
}

export function useReorderGoals() {
  const { dailyGoalService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderedIds: EntityId[]) => dailyGoalService.reorder(orderedIds),
    onSuccess: () => invalidateDailyGoalQueries(queryClient),
  });
}

/** @throws {DailyGoalValidationError} when `progressValue` is negative or non-finite. */
export function useRecordGoalProgress() {
  const { dailyGoalService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      goalId,
      localDate,
      progressValue,
    }: {
      goalId: EntityId;
      localDate: string;
      progressValue: number;
    }) => dailyGoalService.recordProgress(goalId, localDate, progressValue),
    onSuccess: () => invalidateDailyGoalQueries(queryClient),
  });
}
