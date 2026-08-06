import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useContainer } from '@/services/container';

import { exerciseKeys } from './queryKeys';

/**
 * @throws {ExerciseDeleteBlockedError} when the exercise is still referenced by a
 * plan - the detail screen catches this via the mutation's `error` and renders the
 * blocking plan names in a dialog (ROADMAP.md P4's literal acceptance criterion),
 * rather than a generic failure message.
 */
export function useDeleteExercise() {
  const { exerciseService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => exerciseService.deleteWithGuard(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: exerciseKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: exerciseKeys.searchAll });
    },
  });
}
