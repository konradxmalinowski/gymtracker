/**
 * Query key convention - ARCHITECTURE.md section 12.1, verbatim:
 * `['plans','list']` and `['plans','detail',id]`. `all` is the shared
 * prefix every plan/day/day-exercise mutation invalidates against
 * (`invalidation.ts`) - TanStack Query's default `exact: false` treats a
 * query key as a prefix filter, so invalidating `['plans']` matches every
 * active `['plans','list']` and `['plans','detail',id]` query regardless of
 * which specific plan id.
 */
export const planKeys = {
  all: ['plans'] as const,
  list: ['plans', 'list'] as const,
  detail: (id: string) => ['plans', 'detail', id] as const,
};
