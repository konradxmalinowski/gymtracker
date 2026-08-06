import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CreateCustomExerciseInput } from '@/features/exercise-library';
import { useContainer } from '@/services/container';

import { exerciseKeys } from './queryKeys';

/** @throws {ExerciseValidationError} surfaced through the mutation's `error`/`onError` - the create form maps `.issues` to field-level errors when a validation slips past the client-side Zod schema. */
export function useCreateExercise() {
  const { exerciseService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCustomExerciseInput) => exerciseService.createCustom(input),
    onSuccess: (created) => {
      queryClient.setQueryData(exerciseKeys.detail(created.id), created);
      void queryClient.invalidateQueries({ queryKey: exerciseKeys.searchAll });
    },
  });
}
