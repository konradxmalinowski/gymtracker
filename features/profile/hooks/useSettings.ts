import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useContainer } from '@/services/container';
import { kv } from '@/services/kv';

/**
 * Settings query keys follow ARCHITECTURE.md section 12.1's `[domain, scope,
 * ...params]` convention (`['profile']`/`['settings']` are the section's own
 * flat examples; `settings` has per-key scope here the same way
 * `['exercises', 'detail', id]` scopes by id).
 *
 * `haptics.enabled` and `units.*` are additionally mirrored into MMKV on a
 * successful write (ADR-0008 "MMKV key inventory": SQLite stays
 * authoritative, the mirror exists purely so other code - `services/haptics`,
 * a future render-time unit read - can read the value synchronously). The
 * boot-time re-sync from SQLite lives in `app/_layout.tsx`.
 */
export function useHapticsSetting() {
  const { settings } = useContainer();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['settings', 'haptics.enabled'],
    queryFn: () => settings.get('haptics.enabled'),
  });

  const mutation = useMutation({
    // Serializes rapid double-taps into one write queue instead of letting
    // two in-flight writes race and the earlier one win on resolution order.
    scope: { id: 'settings:haptics.enabled' },
    mutationFn: async (value: boolean) => {
      await settings.set('haptics.enabled', value);
      kv.set('haptics.enabled', value);
      return value;
    },
    onSuccess: (value) => {
      queryClient.setQueryData(['settings', 'haptics.enabled'], value);
    },
  });

  return {
    enabled: query.data,
    isPending: query.isPending,
    isError: query.isError,
    setEnabled: mutation.mutate,
  };
}

/**
 * Both units read/write together since the Units settings screen shows and
 * edits them side by side. Switching a segment is a pure display toggle
 * (ADR-0009) - no domain row is ever touched - and must read back instantly
 * everywhere it's rendered, so the query cache is written synchronously in
 * `onSuccess` rather than waiting on a refetch.
 */
export function useUnitsSettings() {
  const { settings } = useContainer();
  const queryClient = useQueryClient();

  const weightQuery = useQuery({
    queryKey: ['settings', 'units.weight'],
    queryFn: () => settings.get('units.weight'),
  });
  const lengthQuery = useQuery({
    queryKey: ['settings', 'units.length'],
    queryFn: () => settings.get('units.length'),
  });

  const setWeightUnitMutation = useMutation({
    // Same rapid-tap race guard as the haptics mutation above.
    scope: { id: 'settings:units.weight' },
    mutationFn: async (value: 'kg' | 'lb') => {
      await settings.set('units.weight', value);
      kv.set('units.weight', value);
      return value;
    },
    onSuccess: (value) => {
      queryClient.setQueryData(['settings', 'units.weight'], value);
    },
  });

  const setLengthUnitMutation = useMutation({
    scope: { id: 'settings:units.length' },
    mutationFn: async (value: 'cm' | 'in') => {
      await settings.set('units.length', value);
      kv.set('units.length', value);
      return value;
    },
    onSuccess: (value) => {
      queryClient.setQueryData(['settings', 'units.length'], value);
    },
  });

  return {
    weightUnit: weightQuery.data,
    lengthUnit: lengthQuery.data,
    isPending: weightQuery.isPending || lengthQuery.isPending,
    isError: weightQuery.isError || lengthQuery.isError,
    setWeightUnit: setWeightUnitMutation.mutate,
    setLengthUnit: setLengthUnitMutation.mutate,
  };
}
