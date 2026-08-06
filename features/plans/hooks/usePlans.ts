import { useQuery } from '@tanstack/react-query';

import { useContainer } from '@/services/container';

import { planKeys } from './queryKeys';

/** List screen's read hook - `PlanListItem[]` with day counts, favorites/active ordering left to the repository. */
export function usePlans() {
  const { planService } = useContainer();

  return useQuery({
    queryKey: planKeys.list,
    queryFn: () => planService.listPlans(),
  });
}
