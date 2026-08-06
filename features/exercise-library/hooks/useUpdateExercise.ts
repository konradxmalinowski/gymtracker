import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { UpdateCustomExercisePatch } from '@/features/exercise-library';
import { useContainer } from '@/services/container';

import { exerciseKeys } from './queryKeys';

interface UpdateExerciseVariables {
  id: string;
  patch: UpdateCustomExercisePatch;
}

/** @throws {ExerciseValidationError} | {ExerciseNotEditableError} - surfaced through the mutation's `error`, same handling as `useCreateExercise`. */
export function useUpdateExercise() {
  const { exerciseService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch }: UpdateExerciseVariables) => exerciseService.updateCustom(id, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(exerciseKeys.detail(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: exerciseKeys.searchAll });
    },
  });
}
