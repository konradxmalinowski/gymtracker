import { useInfiniteQuery } from '@tanstack/react-query';

import type { ExerciseQuery } from '@/features/exercise-library';
import { useContainer } from '@/services/container';

import type { ExerciseFilterState } from './exerciseFilterStore';
import { useDebouncedValue } from './useDebouncedValue';
import { exerciseKeys } from './queryKeys';

/** ADR-0003's "instant search" budget. */
const SEARCH_DEBOUNCE_MS = 120;

/**
 * How many `ExerciseListItem` rows `useExerciseSearch` fetches per page - within
 * `repositories/query`'s own clamp (max 100), the same `useInfiniteQuery` shape
 * `useSessionHistoryList` already established (`HISTORY_PAGE_SIZE = 50`). Chosen to
 * match that precedent rather than invent a second page-size convention: reasonable
 * for a FlashList row this size, and against an 873-row catalog it means a handful
 * of pages for an unfiltered browse rather than either a single 100-row fetch or a
 * flood of tiny ones.
 */
const EXERCISE_SEARCH_PAGE_SIZE = 50;

/**
 * Composes the raw search text and the filter-sheet state into one `ExerciseQuery`.
 * Built with conditional spreads rather than assigning `undefined` to an absent
 * field - `tsconfig.json`'s `exactOptionalPropertyTypes` treats `field?: T` as
 * "present with type T, or entirely absent", so `{ text: undefined }` does not
 * type-check against `ExerciseQuery` even though `text` is optional there.
 */
export function buildExerciseQuery(text: string, filters: ExerciseFilterState): ExerciseQuery {
  return {
    ...(text ? { text } : null),
    ...(filters.muscleSlugs.length > 0 ? { muscleSlugs: filters.muscleSlugs } : null),
    ...(filters.equipmentSlugs.length > 0 ? { equipmentSlugs: filters.equipmentSlugs } : null),
    ...(filters.bodyParts.length > 0 ? { bodyParts: filters.bodyParts } : null),
    ...(filters.level !== null ? { level: filters.level } : null),
    ...(filters.context !== null ? { context: filters.context } : null),
    ...(filters.favoritesOnly ? { favoritesOnly: true } : null),
  };
}

/**
 * Library screen's search hook. Empty text skips the debounce entirely and issues a
 * plain (still favorites-first, still filtered) query immediately - ADR-0003: an
 * empty query has nothing to wait 120ms for, and a user who just cleared the field
 * expects the full filtered list back right away, not after a lag.
 *
 * `useInfiniteQuery` rather than a plain `useQuery` (fixed post-P12 bugfix pass,
 * QA-found): `exerciseService.search()` goes through `buildLimitOffset`, which
 * defaults to a 20-row `DEFAULT_LIMIT` when no `limit`/`offset` is given - a plain
 * `useQuery` calling it with neither meant every search, the default unfiltered
 * browse included, silently capped at the catalog's first 20 rows with no way to
 * see more. Mirrors `useSessionHistoryList`'s exact shape (`initialPageParam: 0`,
 * `getNextPageParam` checking the last page's length against the page size).
 */
export function useExerciseSearch(searchText: string, filters: ExerciseFilterState) {
  const { exerciseService } = useContainer();
  const trimmedText = searchText.trim();
  const debouncedText = useDebouncedValue(trimmedText, SEARCH_DEBOUNCE_MS);
  const effectiveText = trimmedText === '' ? '' : debouncedText;

  const query = buildExerciseQuery(effectiveText, filters);

  return useInfiniteQuery({
    queryKey: exerciseKeys.search(query),
    queryFn: ({ pageParam }) =>
      exerciseService.search({ ...query, limit: EXERCISE_SEARCH_PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < EXERCISE_SEARCH_PAGE_SIZE
        ? undefined
        : allPages.length * EXERCISE_SEARCH_PAGE_SIZE,
  });
}
