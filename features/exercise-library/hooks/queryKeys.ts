import type { ExerciseQuery } from '@/features/exercise-library';

/**
 * Query key convention (ARCHITECTURE.md section 12.1's `[domain, scope, ...params]`
 * shape, matching `features/profile/hooks/useSettings.ts`'s precedent). `all` is the
 * shared prefix every mutation invalidates against for the search cache - passing
 * `[...exerciseKeys.all, 'search']` to `invalidateQueries`/`setQueriesData` matches
 * every active search query regardless of its specific filter/text params, since
 * TanStack Query's default `exact: false` treats a query key as a prefix filter.
 */
export const exerciseKeys = {
  all: ['exercises'] as const,
  search: (query: ExerciseQuery) => ['exercises', 'search', query] as const,
  searchAll: ['exercises', 'search'] as const,
  detail: (id: string) => ['exercises', 'detail', id] as const,
};
