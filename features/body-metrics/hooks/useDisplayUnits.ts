import { useQuery } from '@tanstack/react-query';

import { useContainer } from '@/services/container';

/**
 * Reads `units.weight`/`units.length` directly off the shared `settings`
 * container member (root-level infra, like `db`/`clock`/`files` - not
 * something `profile` owns) rather than importing
 * `features/profile/hooks/useSettings.ts`'s `useUnitsSettings`, which is
 * neither barrel-exported (checked: `features/profile/index.ts` does not
 * list it) nor reachable without violating ARCHITECTURE.md section 3.1 rule
 * 4 (cross-feature imports only through a barrel) - `body-metrics` stays a
 * leaf per its own barrel's header comment.
 *
 * Query keys are deliberately identical to `useUnitsSettings`'s own
 * (`['settings','units.weight']`/`['settings','units.length']`) so both
 * features share one cache entry: a units change made from the Profile
 * settings screen invalidates/updates this hook's data too, with no
 * cross-feature subscription needed.
 */
export function useDisplayUnits() {
  const { settings } = useContainer();

  const weightQuery = useQuery({
    queryKey: ['settings', 'units.weight'],
    queryFn: () => settings.get('units.weight'),
  });
  const lengthQuery = useQuery({
    queryKey: ['settings', 'units.length'],
    queryFn: () => settings.get('units.length'),
  });

  return {
    weightUnit: weightQuery.data,
    lengthUnit: lengthQuery.data,
    isPending: weightQuery.isPending || lengthQuery.isPending,
    isError: weightQuery.isError || lengthQuery.isError,
  };
}
