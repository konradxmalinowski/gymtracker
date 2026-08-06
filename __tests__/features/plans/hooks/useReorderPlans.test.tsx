import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import type { PlanListItem } from '@/features/plans';
import { planKeys } from '@/features/plans/hooks/queryKeys';
import { useReorderPlans } from '@/features/plans/hooks/useReorderPlans';
import { ContainerProvider, createContainer } from '@/services/container';

let activeQueryClient: QueryClient | undefined;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient?.unmount();
  activeQueryClient = undefined;
});

/**
 * Both scenarios share a single `renderHook()` mount, same reasoning as
 * `useToggleExerciseFavorite.test.tsx`'s identical comment: a second
 * `renderHook()` call later in this file reliably left `result.current`
 * `null` on mount, a `@testing-library/react-native` quirk unrelated to
 * `useReorderPlans` itself.
 */
describe('useReorderPlans', () => {
  it('reorders the cache optimistically, settles on success, and rolls back on failure', async () => {
    const container = createContainer(createTestDatabase());
    const first = await container.planService.createPlan({ name: 'Push' });
    const second = await container.planService.createPlan({ name: 'Pull' });
    const third = await container.planService.createPlan({ name: 'Legs' });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false, gcTime: 0 },
      },
    });
    activeQueryClient = queryClient;

    const originalOrder = await container.planService.listPlans();
    queryClient.setQueryData<PlanListItem[]>(planKeys.list, originalOrder);

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <ContainerProvider container={container}>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </ContainerProvider>
      );
    }

    const { result } = await renderHook(() => useReorderPlans(), { wrapper: Wrapper });

    // --- Optimistic reorder, then a successful settle ---
    act(() => {
      result.current.mutate([third.id, first.id, second.id]);
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<PlanListItem[]>(planKeys.list);
      expect(cached?.map((plan) => plan.id)).toEqual([third.id, first.id, second.id]);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const persisted = await container.planService.listPlans();
    expect(persisted.map((plan) => plan.id)).toEqual([third.id, first.id, second.id]);

    // --- Optimistic reorder, then a rollback on failure ---
    jest.spyOn(container.planService, 'reorderPlans').mockRejectedValueOnce(new Error('boom'));
    const beforeFailedAttempt = queryClient.getQueryData<PlanListItem[]>(planKeys.list);

    await act(async () => {
      await expect(
        result.current.mutateAsync([second.id, first.id, third.id]),
      ).rejects.toThrow('boom');
    });

    const cachedAfterFailure = queryClient.getQueryData<PlanListItem[]>(planKeys.list);
    expect(cachedAfterFailure?.map((plan) => plan.id)).toEqual(
      beforeFailedAttempt?.map((plan) => plan.id),
    );
  });
});
