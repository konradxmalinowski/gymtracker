import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { PlanAggregate, PlanDayExercise } from '@/features/plans';
import { useContainer } from '@/services/container';

import { invalidatePlanQueries } from './invalidation';
import { planKeys } from './queryKeys';

interface ReorderDayExercisesVariables {
  planId: string;
  dayId: string;
  orderedIds: readonly string[];
}

interface ReorderDayExercisesContext {
  previous: PlanAggregate | null | undefined;
}

/**
 * Same optimistic-then-reconcile shape as {@link useReorderPlans}/
 * {@link useReorderDays}, one level deeper: patches the one `PlanDay` inside
 * the aggregate's `days` array whose `id` matches `dayId`, leaving every
 * other day untouched. `planId` is a required variable (not derivable from
 * `dayId` alone) purely so this hook knows which `planKeys.detail(planId)`
 * cache entry to read/patch - the underlying `reorderDayExercises` service
 * call itself only needs `dayId`.
 */
export function useReorderDayExercises() {
  const { planService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation<void, Error, ReorderDayExercisesVariables, ReorderDayExercisesContext>({
    mutationFn: ({ dayId, orderedIds }) => planService.reorderDayExercises(dayId, orderedIds),
    onMutate: async ({ planId, dayId, orderedIds }) => {
      const detailKey = planKeys.detail(planId);
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<PlanAggregate | null>(detailKey);

      if (previous) {
        const day = previous.days.find((candidate) => candidate.id === dayId);
        if (day) {
          const byId = new Map(day.exercises.map((exercise) => [exercise.id, exercise]));
          const reorderedExercises = orderedIds
            .map((id) => byId.get(id))
            .filter((exercise): exercise is PlanDayExercise => exercise !== undefined);
          const reorderedDays = previous.days.map((candidate) =>
            candidate.id === dayId ? { ...candidate, exercises: reorderedExercises } : candidate,
          );
          queryClient.setQueryData(detailKey, { ...previous, days: reorderedDays });
        }
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
