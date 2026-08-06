import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useContainer } from '@/services/container';

import { exerciseKeys } from './queryKeys';

interface SetNoteVariables {
  id: string;
  note: string | null;
}

/** @throws {ExerciseValidationError} when `note` exceeds `EXERCISE_NOTE_MAX_LENGTH`. */
export function useSetExerciseNote() {
  const { exerciseService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, note }: SetNoteVariables) => exerciseService.setNote(id, note),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: exerciseKeys.detail(id) });
    },
  });
}
