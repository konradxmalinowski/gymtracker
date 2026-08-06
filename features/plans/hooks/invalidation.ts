import type { QueryClient } from '@tanstack/react-query';

import { planKeys } from './queryKeys';

/**
 * Centralized invalidation (ARCHITECTURE.md section 12.1: "Invalidation is
 * centralized in each feature's own hooks/invalidation.ts rather than
 * scattered across mutations"). Every plan/day/day-exercise mutation hook in this
 * feature calls this on success rather than invalidating its own ad hoc
 * subset of query keys - the section 12.1 table's rule for this feature is
 * exactly "plan mutations -> `['plans',*]`, `['home','dashboard']`", with no
 * per-mutation variation (unlike, say, `exercise-library`'s favorite toggle,
 * which only needs to touch its own search/detail keys).
 *
 * `['home','dashboard']` has no active consumer yet - the Home tab doesn't
 * read plan data until a later phase - but invalidating a query key nothing
 * has subscribed to is a no-op, not an error, and this keeps every mutation
 * compliant with the documented rule now rather than requiring every one of
 * them to be revisited when Home actually starts reading plans.
 */
export function invalidatePlanQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: planKeys.all });
  void queryClient.invalidateQueries({ queryKey: ['home', 'dashboard'] });
}
