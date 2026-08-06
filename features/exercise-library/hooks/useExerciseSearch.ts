import { useQuery } from '@tanstack/react-query';

import type { ExerciseQuery } from '@/features/exercise-library';
import { useContainer } from '@/services/container';

import type { ExerciseFilterState } from './exerciseFilterStore';
import { useDebouncedValue } from './useDebouncedValue';
import { exerciseKeys } from './queryKeys';

/** ADR-0003's "instant search" budget. */
const SEARCH_DEBOUNCE_MS = 120;

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
 */
export function useExerciseSearch(searchText: string, filters: ExerciseFilterState) {
  const { exerciseService } = useContainer();
  const trimmedText = searchText.trim();
  const debouncedText = useDebouncedValue(trimmedText, SEARCH_DEBOUNCE_MS);
  const effectiveText = trimmedText === '' ? '' : debouncedText;

  const query = buildExerciseQuery(effectiveText, filters);

  return useQuery({
    queryKey: exerciseKeys.search(query),
    queryFn: () => exerciseService.search(query),
  });
}
