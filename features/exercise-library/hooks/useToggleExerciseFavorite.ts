import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';

import type { Exercise, ExerciseListItem } from '@/features/exercise-library';
import { useContainer } from '@/services/container';

import { exerciseKeys } from './queryKeys';

interface ToggleFavoriteVariables {
  id: string;
  value: boolean;
}

/**
 * `useExerciseSearch`'s cache holds `InfiniteData<ExerciseListItem[]>` (post-P12
 * bugfix pass: the search hook itself became `useInfiniteQuery`-backed, see its own
 * doc comment) - `pages` is the array of already-fetched pages, each a flat
 * `ExerciseListItem[]`, not one flat list.
 */
type SearchCacheData = InfiniteData<ExerciseListItem[]>;

interface ToggleFavoriteContext {
  previousSearches: [readonly unknown[], SearchCacheData | undefined][];
  previousDetail: Exercise | null | undefined;
}

/**
 * Optimistic favorite toggle: every active `['exercises','search',...]` query and
 * the matching `['exercises','detail',id]` entry (if cached) are flipped
 * immediately, before the write resolves, then reconciled for real via invalidation
 * once it settles - the repository's own favorites-first ordering is the source of
 * truth for row *position*, so this only patches the `isFavorite` flag in place
 * rather than trying to reorder the cached list client-side.
 */
export function useToggleExerciseFavorite() {
  const { exerciseService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation<void, Error, ToggleFavoriteVariables, ToggleFavoriteContext>({
    mutationFn: ({ id, value }) => exerciseService.setFavorite(id, value),
    onMutate: async ({ id, value }) => {
      await queryClient.cancelQueries({ queryKey: exerciseKeys.searchAll });
      await queryClient.cancelQueries({ queryKey: exerciseKeys.detail(id) });

      const previousSearches = queryClient.getQueriesData<SearchCacheData>({
        queryKey: exerciseKeys.searchAll,
      });
      const previousDetail = queryClient.getQueryData<Exercise | null>(exerciseKeys.detail(id));

      queryClient.setQueriesData<SearchCacheData>({ queryKey: exerciseKeys.searchAll }, (cached) =>
        cached
          ? {
              ...cached,
              pages: cached.pages.map((page) =>
                page.map((item) => (item.id === id ? { ...item, isFavorite: value } : item)),
              ),
            }
          : cached,
      );

      if (previousDetail) {
        queryClient.setQueryData<Exercise>(exerciseKeys.detail(id), {
          ...previousDetail,
          userData: { ...previousDetail.userData, isFavorite: value },
        });
      }

      return { previousSearches, previousDetail };
    },
    onError: (_error, variables, context) => {
      context?.previousSearches.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
      if (context && context.previousDetail !== undefined) {
        queryClient.setQueryData(exerciseKeys.detail(variables.id), context.previousDetail);
      }
    },
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({ queryKey: exerciseKeys.searchAll });
      void queryClient.invalidateQueries({ queryKey: exerciseKeys.detail(variables.id) });
    },
  });
}
