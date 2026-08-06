import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { PlanListItem } from '@/features/plans';
import { useContainer } from '@/services/container';

import { invalidatePlanQueries } from './invalidation';
import { planKeys } from './queryKeys';

interface ReorderPlansContext {
  previous: PlanListItem[] | undefined;
}

/**
 * Optimistic reorder: `DraggableList.onReorder` needs the list screen to
 * reflect the new order immediately, not after a round trip through SQLite
 * and an invalidated refetch - a plain invalidate-on-success (the pattern
 * every non-reorder mutation in this feature uses) would visually snap the
 * dragged row back to its old position for a beat, which is exactly the
 * jarring interaction this optimistic update exists to avoid. Reconciled
 * for real via invalidation once the write settles, mirroring
 * `useToggleExerciseFavorite`'s documented precedent for the same
 * optimistic-then-reconcile shape.
 */
export function useReorderPlans() {
  const { planService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation<void, Error, readonly string[], ReorderPlansContext>({
    mutationFn: (orderedIds) => planService.reorderPlans(orderedIds),
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: planKeys.list });
      const previous = queryClient.getQueryData<PlanListItem[]>(planKeys.list);

      if (previous) {
        const byId = new Map(previous.map((plan) => [plan.id, plan]));
        const reordered = orderedIds
          .map((id) => byId.get(id))
          .filter((plan): plan is PlanListItem => plan !== undefined);
        queryClient.setQueryData(planKeys.list, reordered);
      }

      return { previous };
    },
    onError: (_error, _orderedIds, context) => {
      if (context?.previous) {
        queryClient.setQueryData(planKeys.list, context.previous);
      }
    },
    onSettled: () => invalidatePlanQueries(queryClient),
  });
}
