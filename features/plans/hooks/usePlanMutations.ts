import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CreatePlanInput } from '@/features/plans';
import { useContainer } from '@/services/container';

import { invalidatePlanQueries } from './invalidation';
import { planKeys } from './queryKeys';

/** @throws {PlanValidationError} when `input.name` is empty/too long, or `input.description`/`input.color` fails its own check. */
export function useCreatePlan() {
  const { planService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePlanInput) => planService.createPlan(input),
    onSuccess: () => invalidatePlanQueries(queryClient),
  });
}

/** @throws {PlanValidationError} when `name` is empty or too long. */
export function useRenamePlan() {
  const { planService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => planService.renamePlan(id, name),
    onSuccess: () => invalidatePlanQueries(queryClient),
  });
}

/** Disambiguated "(copy)"/"(copy 2)"/... naming is `PlanService`'s own job - this hook just calls through and invalidates. */
export function useDuplicatePlan() {
  const { planService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => planService.duplicatePlan(id),
    onSuccess: () => invalidatePlanQueries(queryClient),
  });
}

export function useSetActivePlan() {
  const { planService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => planService.setActivePlan(id),
    onSuccess: () => invalidatePlanQueries(queryClient),
  });
}

/**
 * Confirm-dialog, no-undo (ARCHITECTURE.md section 10.2's nav rules table:
 * confirmation dialogs are reserved for delete-*plan*, not
 * delete-plus-undo-toast) - `PlanService.deletePlan()` is a hard delete
 * (see that method's own doc comment for why), so there is no matching
 * restore hook to pair with this one, unlike every other delete below plan
 * level in this feature.
 */
export function useDeletePlan() {
  const { planService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => planService.deletePlan(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: planKeys.detail(id) });
      invalidatePlanQueries(queryClient);
    },
  });
}
