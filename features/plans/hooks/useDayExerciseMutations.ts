import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { AddPlanDayExerciseInput, UpdatePlanDayExercisePatch } from '@/features/plans';
import { useContainer } from '@/services/container';

import { invalidatePlanQueries } from './invalidation';

/** @throws {PlanValidationError} when `exerciseId` is missing, a target field is out of range, or `targetRepMin > targetRepMax`. */
export function useAddExerciseToDay() {
  const { planService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dayId, input }: { dayId: string; input: AddPlanDayExerciseInput }) =>
      planService.addExerciseToDay(dayId, input),
    onSuccess: () => invalidatePlanQueries(queryClient),
  });
}

/** @throws {PlanValidationError} when a provided target field is out of range, or the patch would leave `targetRepMin > targetRepMax`. */
export function useUpdateDayExercise() {
  const { planService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdatePlanDayExercisePatch }) =>
      planService.updateDayExercise(id, patch),
    onSuccess: () => invalidatePlanQueries(queryClient),
  });
}

/** Soft delete - delete-plus-undo-toast, same nav-rules reasoning as {@link useDeleteDay}. Pairs with {@link useRestoreDayExercise}. */
export function useRemoveDayExercise() {
  const { planService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => planService.removeExerciseFromDay(id),
    onSuccess: () => invalidatePlanQueries(queryClient),
  });
}

/** Undoes {@link useRemoveDayExercise} - the undo toast's action target. */
export function useRestoreDayExercise() {
  const { planService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => planService.restoreDayExercise(id),
    onSuccess: () => invalidatePlanQueries(queryClient),
  });
}

/**
 * @throws {SupersetMinimumSizeError} when `group` is a number and fewer
 * than 2 ids are passed - see `PlanService.setSupersetGroup()`'s own doc
 * comment. A single id with `group: null` (removing one exercise from an
 * existing superset back to standalone) is exempt from that minimum and
 * always allowed.
 * @throws {SupersetSpansMultipleDaysError} propagated from the repository
 * when the ids span more than one day - not reachable from a correct UI
 * (every call site in `PlanDayEditorScreen` only ever selects within one
 * day's exercise list), kept as a defensive catch in the screen rather than
 * silently swallowed here.
 */
export function useSetSupersetGroup() {
  const { planService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dayExerciseIds,
      group,
    }: {
      dayExerciseIds: readonly string[];
      group: number | null;
    }) => planService.setSupersetGroup(dayExerciseIds, group),
    onSuccess: () => invalidatePlanQueries(queryClient),
  });
}
