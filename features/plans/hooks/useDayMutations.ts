import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { AddPlanDayInput } from '@/features/plans';
import { useContainer } from '@/services/container';

import { invalidatePlanQueries } from './invalidation';

/** @throws {PlanValidationError} when `input.name` is empty/too long, or `input.note` fails its own check. */
export function useAddDay() {
  const { planService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ planId, input }: { planId: string; input: AddPlanDayInput }) =>
      planService.addDay(planId, input),
    onSuccess: () => invalidatePlanQueries(queryClient),
  });
}

/** @throws {PlanValidationError} when `name` is empty or too long. */
export function useRenameDay() {
  const { planService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dayId, name }: { dayId: string; name: string }) =>
      planService.renameDay(dayId, name),
    onSuccess: () => invalidatePlanQueries(queryClient),
  });
}

export function useDuplicateDay() {
  const { planService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dayId: string) => planService.duplicateDay(dayId),
    onSuccess: () => invalidatePlanQueries(queryClient),
  });
}

/** Soft delete - feeds the day-level undo toast (ARCHITECTURE.md section 10.2's nav rules: delete-plus-undo-toast for everything below plan level). Pairs with {@link useRestoreDay}. */
export function useDeleteDay() {
  const { planService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dayId: string) => planService.deleteDay(dayId),
    onSuccess: () => invalidatePlanQueries(queryClient),
  });
}

/** Undoes {@link useDeleteDay} - the undo toast's action target. */
export function useRestoreDay() {
  const { planService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dayId: string) => planService.restoreDay(dayId),
    onSuccess: () => invalidatePlanQueries(queryClient),
  });
}
