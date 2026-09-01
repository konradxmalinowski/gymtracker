import type { BodyMetricType } from '../domain/metrics';
import type { PhotoPose } from '../types/ProgressPhoto';

/**
 * Query key convention - ARCHITECTURE.md section 12.1's `[domain, scope,
 * ...params]` shape, mirroring `features/plans/hooks/queryKeys.ts` exactly:
 * `all` is the shared prefix every mutation invalidates against
 * (`invalidation.ts`), relying on TanStack Query's default `exact: false`
 * prefix-match behavior.
 */
export const bodyMetricKeys = {
  all: ['bodyMetrics'] as const,
  latest: ['bodyMetrics', 'latest'] as const,
  history: (metric: BodyMetricType) => ['bodyMetrics', 'history', metric] as const,
};

/**
 * `pose` folds into the key so a pose-filtered list and the unfiltered "all
 * poses" list are cached (and invalidated) independently - the same
 * "scope by the actual query params" shape `bodyMetricKeys.history` uses for
 * `metric`.
 */
export const photoKeys = {
  all: ['bodyMetricPhotos'] as const,
  list: (pose?: PhotoPose) => ['bodyMetricPhotos', 'list', pose ?? 'all'] as const,
};
