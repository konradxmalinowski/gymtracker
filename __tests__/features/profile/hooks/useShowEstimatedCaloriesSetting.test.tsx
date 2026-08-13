import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import { useShowEstimatedCaloriesSetting } from '@/features/profile/hooks/useSettings';
import { ContainerProvider, createContainer } from '@/services/container';

/**
 * P9's `workout.showEstimatedCalories` setting hook - kept in its own file
 * rather than appended to `useSettings.test.tsx` (which already covers
 * `useHapticsSetting`'s rapid-double-tap race guard using real 40ms/5ms
 * `setTimeout` delays): running both in the same file/process was observed
 * to leak async state across tests (a second render's `result.current` came
 * back `null`), so this stays isolated rather than risking that flakiness.
 */
describe('useShowEstimatedCaloriesSetting', () => {
  it('reads the schema default (false) and persists a write, with no MMKV mirror (unlike haptics.enabled)', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
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

    const { result } = await renderHook(() => useShowEstimatedCaloriesSetting(), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.enabled).toBe(false));

    act(() => {
      result.current.setEnabled(true);
    });

    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(await container.settings.get('workout.showEstimatedCalories')).toBe(true);

    queryClient.clear();
    queryClient.unmount();
  });
});
