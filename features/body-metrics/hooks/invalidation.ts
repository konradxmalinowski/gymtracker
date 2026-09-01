import type { QueryClient } from '@tanstack/react-query';

import type { BodyMetricType } from '../domain/metrics';
import { bodyMetricKeys, photoKeys } from './queryKeys';

/**
 * Centralized invalidation (ARCHITECTURE.md section 12.1: "Invalidation is
 * centralized in each feature's own hooks/invalidation.ts rather than
 * scattered across mutations"), mirroring `features/plans/hooks/invalidation.ts`.
 * A metric mutation touches both its own history key and the shared "latest
 * value per metric" list - `listLatestValues()` reads the newest row across
 * every metric, so any metric's write can change what that list shows.
 */
export function invalidateBodyMetricQueries(
  queryClient: QueryClient,
  metric: BodyMetricType,
): void {
  void queryClient.invalidateQueries({ queryKey: bodyMetricKeys.latest });
  void queryClient.invalidateQueries({ queryKey: bodyMetricKeys.history(metric) });
}

/**
 * A photo mutation invalidates every cached pose-filtered list plus the
 * unfiltered one - `photoKeys.all` is the shared prefix every one of them
 * shares (`photoKeys.list()` always starts with `['bodyMetricPhotos','list']`),
 * so one call covers all of them regardless of which `pose` a given screen
 * happened to query with.
 */
export function invalidatePhotoQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: photoKeys.all });
}
