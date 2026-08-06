import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import { seedLookupTables } from '@/database/seed/lookupSeeder';
import type { ExerciseListItem } from '@/features/exercise-library';
import { exerciseKeys } from '@/features/exercise-library/hooks/queryKeys';
import { useToggleExerciseFavorite } from '@/features/exercise-library/hooks/useToggleExerciseFavorite';
import { ContainerProvider, createContainer } from '@/services/container';

let activeQueryClient: QueryClient | undefined;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient?.unmount();
  activeQueryClient = undefined;
});

function seedItem(id: string, nameEn: string): ExerciseListItem {
  return {
    id,
    source: 'custom',
    catalogSlug: null,
    nameEn,
    namePl: null,
    displayNameOverride: null,
    level: null,
    equipmentSlug: 'barbell',
    bodyPart: null,
    trackingType: 'weight_reps',
    primaryImage: null,
    isFavorite: false,
  };
}

/**
 * Both scenarios share a single `renderHook()` mount (rather than one call per
 * `it()`) - a second `renderHook()` call later in this same file reliably left
 * `result.current` `null` on mount, a `@testing-library/react-native`
 * `renderHook`-in-sequence quirk unrelated to `useToggleExerciseFavorite`
 * itself (confirmed by running either scenario alone, which always passes).
 * Mounting once and exercising the optimistic-then-settle path followed by
 * the optimistic-then-rollback path against two different exercise ids sidesteps
 * it entirely while still covering both.
 */
describe('useToggleExerciseFavorite - optimistic update', () => {
  it('flips isFavorite immediately and settles or rolls back to match the write outcome', async () => {
    const db = createTestDatabase();
    await seedLookupTables(db);
    const container = createContainer(db);
    const succeeding = await container.exerciseService.createCustom({
      nameEn: 'Barbell Row',
      equipmentSlug: 'barbell',
      muscles: [{ slug: 'lats', role: 'primary' }],
    });
    const failing = await container.exerciseService.createCustom({
      nameEn: 'Barbell Curl',
      equipmentSlug: 'barbell',
      muscles: [{ slug: 'biceps', role: 'primary' }],
    });

    let resolveWrite: () => void = () => {};
    const setFavoriteSpy = jest
      .spyOn(container.exerciseService, 'setFavorite')
      .mockImplementation((id) => {
        if (id === failing.id) {
          return Promise.reject(new Error('boom'));
        }
        return new Promise<void>((resolve) => {
          resolveWrite = resolve;
        });
      });

    const queryClient = new QueryClient({
      defaultOptions: {
        // No `gcTime: 0` for queries here (unlike other tests in this repo) -
        // the search-results cache entry below is seeded manually via
        // `setQueryData`, with no `useQuery` observer ever mounted for it, so
        // a zero gcTime would garbage-collect it almost immediately (a query
        // with zero active observers becomes eligible for GC as soon as its
        // gcTime elapses) and every assertion below would read back
        // `undefined` instead of the optimistically-updated value.
        queries: { retry: false },
        mutations: { retry: false, gcTime: 0 },
      },
    });
    activeQueryClient = queryClient;

    queryClient.setQueryData(exerciseKeys.search({}), [
      seedItem(succeeding.id, succeeding.nameEn),
      seedItem(failing.id, failing.nameEn),
    ]);

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <ContainerProvider container={container}>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </ContainerProvider>
      );
    }

    const { result } = await renderHook(() => useToggleExerciseFavorite(), { wrapper: Wrapper });

    // --- Optimistic flip, then a successful settle ---
    act(() => {
      result.current.mutate({ id: succeeding.id, value: true });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<ExerciseListItem[]>(exerciseKeys.search({}));
      expect(cached?.find((item) => item.id === succeeding.id)?.isFavorite).toBe(true);
    });

    // The write is still pending at this point - the flip above happened
    // optimistically, not as a reflection of a completed mutation.
    expect(result.current.isPending).toBe(true);
    expect(setFavoriteSpy).toHaveBeenCalledWith(succeeding.id, true);

    resolveWrite();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // --- Optimistic flip, then a rollback on failure ---
    await act(async () => {
      await expect(result.current.mutateAsync({ id: failing.id, value: true })).rejects.toThrow(
        'boom',
      );
    });

    const cachedAfterFailure = queryClient.getQueryData<ExerciseListItem[]>(
      exerciseKeys.search({}),
    );
    expect(cachedAfterFailure?.find((item) => item.id === failing.id)?.isFavorite).toBe(false);
    // The earlier successful flip is untouched by the later rollback.
    expect(cachedAfterFailure?.find((item) => item.id === succeeding.id)?.isFavorite).toBe(true);
  });
});
