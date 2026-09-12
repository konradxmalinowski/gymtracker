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

/**
 * ADR-0015 Decision 1's `oneRm.formula` setting - Epley by default, Brzycki
 * selectable. Not mirrored into MMKV (unlike `haptics.enabled`/`units.*`):
 * nothing reads this setting from a synchronous, render-adjacent code path
 * the way `services/haptics` reads `haptics.enabled` - every consumer already
 * goes through a React Query hook.
 */
export function useOneRmFormulaSetting() {
  const { settings } = useContainer();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['settings', 'oneRm.formula'],
    queryFn: () => settings.get('oneRm.formula'),
  });

  const mutation = useMutation({
    scope: { id: 'settings:oneRm.formula' },
    mutationFn: (value: 'epley' | 'brzycki') => settings.set('oneRm.formula', value),
    onSuccess: (_data, value) => {
      queryClient.setQueryData(['settings', 'oneRm.formula'], value);
    },
  });

  return {
    formula: query.data,
    isPending: query.isPending,
    isError: query.isError,
    setFormula: mutation.mutate,
  };
}

/**
 * P9's `workout.showEstimatedCalories` boolean (default `false`, D-04) -
 * shape mirrors {@link useHapticsSetting} exactly, minus the MMKV mirror:
 * `haptics.enabled` needs a synchronous read for gesture handlers (ADR-0008),
 * this setting doesn't - `finish()`'s own read of it already goes through
 * `WorkoutSessionService`, not this hook, and the only UI consumer
 * (`SettingsScreen`'s `Switch` row) is already a React Query subscriber.
 */
export function useShowEstimatedCaloriesSetting() {
  const { settings } = useContainer();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['settings', 'workout.showEstimatedCalories'],
    queryFn: () => settings.get('workout.showEstimatedCalories'),
  });

  const mutation = useMutation({
    scope: { id: 'settings:workout.showEstimatedCalories' },
    mutationFn: (value: boolean) => settings.set('workout.showEstimatedCalories', value),
    onSuccess: (_data, value) => {
      queryClient.setQueryData(['settings', 'workout.showEstimatedCalories'], value);
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
 * ADR-0015 Decision 2's per-movement progression increments
 * (`progression.upperIncrementKg`/`progression.lowerIncrementKg`). Read/write
 * together, same reasoning `useUnitsSettings` gives for its own pair - the
 * Progression settings screen shows and edits both side by side.
 */
export function useProgressionIncrementSettings() {
  const { settings } = useContainer();
  const queryClient = useQueryClient();

  const upperQuery = useQuery({
    queryKey: ['settings', 'progression.upperIncrementKg'],
    queryFn: () => settings.get('progression.upperIncrementKg'),
  });
  const lowerQuery = useQuery({
    queryKey: ['settings', 'progression.lowerIncrementKg'],
    queryFn: () => settings.get('progression.lowerIncrementKg'),
  });

  const setUpperMutation = useMutation({
    scope: { id: 'settings:progression.upperIncrementKg' },
    mutationFn: (value: number) => settings.set('progression.upperIncrementKg', value),
    onSuccess: (_data, value) => {
      queryClient.setQueryData(['settings', 'progression.upperIncrementKg'], value);
    },
  });
  const setLowerMutation = useMutation({
    scope: { id: 'settings:progression.lowerIncrementKg' },
    mutationFn: (value: number) => settings.set('progression.lowerIncrementKg', value),
    onSuccess: (_data, value) => {
      queryClient.setQueryData(['settings', 'progression.lowerIncrementKg'], value);
    },
  });

  return {
    upperIncrementKg: upperQuery.data,
    lowerIncrementKg: lowerQuery.data,
    isPending: upperQuery.isPending || lowerQuery.isPending,
    isError: upperQuery.isError || lowerQuery.isError,
    setUpperIncrementKg: setUpperMutation.mutate,
    setLowerIncrementKg: setLowerMutation.mutate,
  };
}

/**
 * Gravitus-inspired refresh's plate calculator settings
 * (`plateCalculator.barWeightKg`/`ezBarWeightKg`/`availablePlatesKg`) - read/
 * write together, the same `useUnitsSettings`/`useProgressionIncrementSettings`
 * shape, since `PlateCalculatorSettingsScreen` shows and edits all three side
 * by side. Lives here (not `workout-logging`, which owns the plate-math
 * domain calculator and the in-workout sheet) per this feature's own
 * settings-hook convention - `PlateCalculatorSheet` reads these same keys
 * directly off `settings` via its own `useQuery` calls instead of importing
 * this hook, since it isn't barrel-exported and `workout-logging` importing
 * straight into `features/profile/hooks/useSettings.ts` would violate the
 * cross-feature-imports-through-a-barrel rule.
 */
export function usePlateCalculatorSettings() {
  const { settings } = useContainer();
  const queryClient = useQueryClient();

  const barWeightQuery = useQuery({
    queryKey: ['settings', 'plateCalculator.barWeightKg'],
    queryFn: () => settings.get('plateCalculator.barWeightKg'),
  });
  const ezBarWeightQuery = useQuery({
    queryKey: ['settings', 'plateCalculator.ezBarWeightKg'],
    queryFn: () => settings.get('plateCalculator.ezBarWeightKg'),
  });
  const availablePlatesQuery = useQuery({
    queryKey: ['settings', 'plateCalculator.availablePlatesKg'],
    queryFn: () => settings.get('plateCalculator.availablePlatesKg'),
  });

  const setBarWeightMutation = useMutation({
    scope: { id: 'settings:plateCalculator.barWeightKg' },
    mutationFn: (value: number) => settings.set('plateCalculator.barWeightKg', value),
    onSuccess: (_data, value) => {
      queryClient.setQueryData(['settings', 'plateCalculator.barWeightKg'], value);
    },
  });
  const setEzBarWeightMutation = useMutation({
    scope: { id: 'settings:plateCalculator.ezBarWeightKg' },
    mutationFn: (value: number) => settings.set('plateCalculator.ezBarWeightKg', value),
    onSuccess: (_data, value) => {
      queryClient.setQueryData(['settings', 'plateCalculator.ezBarWeightKg'], value);
    },
  });
  const setAvailablePlatesMutation = useMutation({
    scope: { id: 'settings:plateCalculator.availablePlatesKg' },
    mutationFn: (value: number[]) => settings.set('plateCalculator.availablePlatesKg', value),
    onSuccess: (_data, value) => {
      queryClient.setQueryData(['settings', 'plateCalculator.availablePlatesKg'], value);
    },
  });

  return {
    barWeightKg: barWeightQuery.data,
    ezBarWeightKg: ezBarWeightQuery.data,
    availablePlatesKg: availablePlatesQuery.data,
    isPending:
      barWeightQuery.isPending || ezBarWeightQuery.isPending || availablePlatesQuery.isPending,
    isError: barWeightQuery.isError || ezBarWeightQuery.isError || availablePlatesQuery.isError,
    setBarWeightKg: setBarWeightMutation.mutate,
    setEzBarWeightKg: setEzBarWeightMutation.mutate,
    setAvailablePlatesKg: setAvailablePlatesMutation.mutate,
  };
}

/**
 * Gravitus-inspired refresh's local weekly workout reminders
 * (`reminders.enabled`/`days`/`time`) - same read/write-together shape as
 * every other multi-field settings hook in this file. Not mirrored into
 * MMKV: nothing reads these synchronously off a render-adjacent path the way
 * `haptics.enabled` needs to be (ADR-0008) - `RemindersSettingsScreen`'s own
 * save handler calls `services/notifications/WorkoutReminderService`
 * directly to reschedule, the same "kv writes happen at UI-adjacent call
 * sites, not inside services" shape this app already uses elsewhere.
 */
export function useReminderSettings() {
  const { settings } = useContainer();
  const queryClient = useQueryClient();

  const enabledQuery = useQuery({
    queryKey: ['settings', 'reminders.enabled'],
    queryFn: () => settings.get('reminders.enabled'),
  });
  const daysQuery = useQuery({
    queryKey: ['settings', 'reminders.days'],
    queryFn: () => settings.get('reminders.days'),
  });
  const timeQuery = useQuery({
    queryKey: ['settings', 'reminders.time'],
    queryFn: () => settings.get('reminders.time'),
  });

  const setEnabledMutation = useMutation({
    scope: { id: 'settings:reminders.enabled' },
    mutationFn: (value: boolean) => settings.set('reminders.enabled', value),
    onSuccess: (_data, value) => {
      queryClient.setQueryData(['settings', 'reminders.enabled'], value);
    },
  });
  const setDaysMutation = useMutation({
    scope: { id: 'settings:reminders.days' },
    mutationFn: (value: number[]) => settings.set('reminders.days', value),
    onSuccess: (_data, value) => {
      queryClient.setQueryData(['settings', 'reminders.days'], value);
    },
  });
  const setTimeMutation = useMutation({
    scope: { id: 'settings:reminders.time' },
    mutationFn: (value: string) => settings.set('reminders.time', value),
    onSuccess: (_data, value) => {
      queryClient.setQueryData(['settings', 'reminders.time'], value);
    },
  });

  return {
    enabled: enabledQuery.data,
    days: daysQuery.data,
    time: timeQuery.data,
    isPending: enabledQuery.isPending || daysQuery.isPending || timeQuery.isPending,
    isError: enabledQuery.isError || daysQuery.isError || timeQuery.isError,
    setEnabled: setEnabledMutation.mutate,
    setDays: setDaysMutation.mutate,
    setTime: setTimeMutation.mutate,
  };
}
