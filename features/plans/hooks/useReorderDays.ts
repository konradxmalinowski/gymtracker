import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { PlanAggregate, PlanDay } from '@/features/plans';
import { useContainer } from '@/services/container';

import { invalidatePlanQueries } from './invalidation';
import { planKeys } from './queryKeys';

interface ReorderDaysVariables {
  planId: string;
  orderedDayIds: readonly string[];
}

interface ReorderDaysContext {
  previous: PlanAggregate | null | undefined;
}

/** Same optimistic-then-reconcile shape as {@link useReorderPlans}, patching the detail screen's `days` array instead of the list screen's flat array. */
export function useReorderDays() {
  const { planService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation<void, Error, ReorderDaysVariables, ReorderDaysContext>({
    mutationFn: ({ planId, orderedDayIds }) => planService.reorderDays(planId, orderedDayIds),
    onMutate: async ({ planId, orderedDayIds }) => {
      const detailKey = planKeys.detail(planId);
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<PlanAggregate | null>(detailKey);

      if (previous) {
        const byId = new Map(previous.days.map((day) => [day.id, day]));
        const reorderedDays = orderedDayIds
          .map((id) => byId.get(id))
          .filter((day): day is PlanDay => day !== undefined);
        queryClient.setQueryData(detailKey, { ...previous, days: reorderedDays });
      }

      return { previous };
    },
    onError: (_error, { planId }, context) => {
      if (context && context.previous !== undefined) {
        queryClient.setQueryData(planKeys.detail(planId), context.previous);
      }
    },
    onSettled: () => invalidatePlanQueries(queryClient),
  });
}
