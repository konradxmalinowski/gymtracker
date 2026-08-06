import { useQuery } from '@tanstack/react-query';

import { useContainer } from '@/services/container';

import { planKeys } from './queryKeys';

/** Detail/day-editor screens' read hook - the full aggregate (plan + days + day exercises). `enabled: false` when `id` is missing keeps this safe to call before a route param has resolved. */
export function usePlan(id: string | undefined) {
  const { planService } = useContainer();

  return useQuery({
    queryKey: planKeys.detail(id ?? ''),
    queryFn: () => planService.getPlan(id as string),
    enabled: Boolean(id),
  });
}
