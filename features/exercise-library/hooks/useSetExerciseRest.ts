import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useContainer } from '@/services/container';

import { exerciseKeys } from './queryKeys';

interface SetRestVariables {
  id: string;
  seconds: number | null;
}

/** @throws {ExerciseValidationError} when `seconds` is negative, non-integer, or exceeds `EXERCISE_REST_SECONDS_MAX`. */
export function useSetExerciseRest() {
  const { exerciseService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, seconds }: SetRestVariables) => exerciseService.setDefaultRest(id, seconds),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: exerciseKeys.detail(id) });
    },
  });
}
