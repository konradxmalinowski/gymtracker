import { useQuery } from '@tanstack/react-query';

import { useContainer } from '@/services/container';

import { exerciseKeys } from './queryKeys';

/** Detail screen's read hook. `enabled: false` when `id` is missing keeps this safe to call before a route param has resolved, rather than requiring every caller to guard first. */
export function useExercise(id: string | undefined) {
  const { exerciseService } = useContainer();

  return useQuery({
    queryKey: exerciseKeys.detail(id ?? ''),
    queryFn: () => exerciseService.getById(id as string),
    enabled: Boolean(id),
  });
}
