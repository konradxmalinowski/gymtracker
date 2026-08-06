import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import { useHapticsSetting } from '@/features/profile/hooks/useSettings';
import type { SettingsRepository } from '@/repositories/settings';
import { ContainerProvider, createContainer } from '@/services/container';
import { kv } from '@/services/kv';

/**
 * `useHapticsSetting` (and `useUnitsSettings`, which gives each of its own
 * mutations the identical `scope: { id: 'settings:<key>' }` shape) relies on
 * TanStack Query serializing mutations that share a scope id: a second
 * `mutate()` call queues behind the first rather than running concurrently,
 * so the underlying `SettingsRepository.set()` for the second call never
 * even starts until the first one has fully settled (including its
 * `onSuccess`). Only `useHapticsSetting` is exercised directly here - the
 * mechanism under test is TanStack Query's scope serialization itself, not
 * anything hook-specific, so a second near-identical test against
 * `useUnitsSettings` would prove the same thing again for no extra signal.
 *
 * This fake `SettingsRepository` makes the guard's effect concrete: the
 * *first* write is slow (40ms) and the *second* is fast (5ms). Without scope
 * serialization, both `set()` calls would race - the fast second write would
 * resolve first, then the slow first write would resolve later and overwrite
 * it with the stale value, silently reverting the user's most recent tap.
 * With serialization, the second write cannot start until the first is
 * done, so the final state always matches the last call regardless of
 * per-call latency.
 */
function createRaceDetectingSettingsRepository(initial: Record<string, unknown>) {
  const store = new Map<string, unknown>(Object.entries(initial));
  const callOrder: unknown[] = [];
  let concurrentCalls = 0;
  let maxConcurrentCalls = 0;

  const settings: SettingsRepository = {
    get: async (key) => store.get(key) as never,
    set: async (key, value) => {
      callOrder.push(value);
      concurrentCalls += 1;
      maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);

      const isFirstCall = callOrder.length === 1;
      await new Promise((resolve) => setTimeout(resolve, isFirstCall ? 40 : 5));

      store.set(key, value);
      concurrentCalls -= 1;
    },
  };

  return {
    settings,
    store,
    callOrder,
    /** Peak number of `set()` calls that were in flight at the same time - 1 if serialized, >1 if raced. */
    getMaxConcurrentCalls: () => maxConcurrentCalls,
  };
}

describe('useHapticsSetting - rapid double-tap race guard (scope: settings:haptics.enabled)', () => {
  afterEach(() => {
    kv.delete('haptics.enabled');
  });

  it('serializes two rapid setEnabled() calls so the last call always wins, even when its write resolves faster than the first', async () => {
    const { settings, store, callOrder, getMaxConcurrentCalls } =
      createRaceDetectingSettingsRepository({ 'haptics.enabled': false });

    const db = createTestDatabase();
    const container = createContainer(db, { settings });
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false, gcTime: 0 },
      },
    });

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <ContainerProvider container={container}>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </ContainerProvider>
      );
    }

    const { result } = await renderHook(() => useHapticsSetting(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.enabled).toBe(false));

    // Two taps in immediate succession - "on" then "off" - with no await
    // between them, the way a real rapid double-tap would fire.
    act(() => {
      result.current.setEnabled(true);
      result.current.setEnabled(false);
    });

    // Wait for both underlying writes to have actually run - checking
    // `callOrder.length` rather than the final stored value first matters:
    // the seeded initial value is already `false`, so asserting on the
    // stored value alone would trivially "pass" before the second write
    // (or even the first) has had a chance to run at all.
    await waitFor(() => expect(callOrder.length).toBe(2));

    expect(callOrder).toEqual([true, false]);
    // The defining assertion: if the mutations had run concurrently instead
    // of serialized, this would be 2.
    expect(getMaxConcurrentCalls()).toBe(1);

    // The second write's own delay (and onSuccess) still has to land after
    // its call was recorded above.
    await waitFor(() => expect(result.current.enabled).toBe(false));
    expect(store.get('haptics.enabled')).toBe(false);
    expect(kv.get('haptics.enabled')).toBe(false);

    queryClient.clear();
    queryClient.unmount();
  });
});
