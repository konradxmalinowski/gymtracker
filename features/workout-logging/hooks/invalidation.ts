import type { QueryClient } from '@tanstack/react-query';

/**
 * Centralized invalidation (ARCHITECTURE.md section 12.1 / ADR-0008), reproduced
 * from the ADR's own example verbatim. Several of these keys have no active
 * subscriber yet - `sessions`/`records`/`stats`/`calendar` all belong to features
 * that don't exist until later phases, and `home` renders a static wordmark
 * until P10 - but invalidating a key nothing has queried is a no-op, not an
 * error, and this keeps `finish()`/`discard()` compliant with the documented
 * rule now instead of requiring a revisit once those phases land and start
 * reading session data for the first time.
 */
export function invalidateAfterWorkoutFinish(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['sessions'] });
  void queryClient.invalidateQueries({ queryKey: ['records'] });
  void queryClient.invalidateQueries({ queryKey: ['stats'] });
  void queryClient.invalidateQueries({ queryKey: ['calendar'] });
  void queryClient.invalidateQueries({ queryKey: ['home'] });
  void queryClient.invalidateQueries({ queryKey: ['exercises', 'history'] });
}
