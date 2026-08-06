import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import { seedLookupTables } from '@/database/seed/lookupSeeder';
import { DEFAULT_EXERCISE_FILTERS } from '@/features/exercise-library/hooks/exerciseFilterStore';
import { useExerciseSearch } from '@/features/exercise-library/hooks/useExerciseSearch';
import { ContainerProvider, createContainer, type AppContainer } from '@/services/container';

let activeQueryClient: QueryClient | undefined;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient?.unmount();
  activeQueryClient = undefined;
});

async function setup() {
  const db = createTestDatabase();
  await seedLookupTables(db);
  const container = createContainer(db);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  activeQueryClient = queryClient;

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ContainerProvider container={container}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ContainerProvider>
    );
  }

  return { container, Wrapper };
}

function spyOnSearch(container: AppContainer) {
  return jest.spyOn(container.exerciseService, 'search');
}

describe('useExerciseSearch - debounce behavior (ADR-0003, 120ms budget)', () => {
  it('debounces a non-empty search text change before calling search() again', async () => {
    const { container, Wrapper } = await setup();
    const searchSpy = spyOnSearch(container);

    const { rerender } = await renderHook(
      ({ text }: { text: string }) => useExerciseSearch(text, DEFAULT_EXERCISE_FILTERS),
      { wrapper: Wrapper, initialProps: { text: '' } },
    );

    await waitFor(() => expect(searchSpy).toHaveBeenCalledWith({}));
    searchSpy.mockClear();

    rerender({ text: 'ben' });

    // Immediately after the keystroke, the debounce window hasn't elapsed yet -
    // no new call should have fired.
    expect(searchSpy).not.toHaveBeenCalled();

    await waitFor(() => expect(searchSpy).toHaveBeenCalledWith({ text: 'ben' }), {
      timeout: 1000,
    });
  });

  it('skips the debounce entirely once the text is cleared back to empty', async () => {
    const { container, Wrapper } = await setup();
    const searchSpy = spyOnSearch(container);

    const { rerender } = await renderHook(
      ({ text }: { text: string }) => useExerciseSearch(text, DEFAULT_EXERCISE_FILTERS),
      { wrapper: Wrapper, initialProps: { text: 'bench' } },
    );

    await waitFor(() => expect(searchSpy).toHaveBeenCalledWith({ text: 'bench' }));
    searchSpy.mockClear();

    rerender({ text: '' });

    // No 120ms wait needed here - an empty query issues immediately.
    await waitFor(() => expect(searchSpy).toHaveBeenCalledWith({}));
  });
});

describe('useExerciseSearch - filter composition', () => {
  it('composes filter-sheet state and search text into a single ExerciseQuery', async () => {
    const { container, Wrapper } = await setup();
    const searchSpy = spyOnSearch(container);

    const filters = {
      ...DEFAULT_EXERCISE_FILTERS,
      muscleSlugs: ['chest', 'triceps'],
      equipmentSlugs: ['barbell'],
      level: 'beginner' as const,
      favoritesOnly: true,
    };

    await renderHook(() => useExerciseSearch('', filters), { wrapper: Wrapper });

    await waitFor(() =>
      expect(searchSpy).toHaveBeenCalledWith({
        muscleSlugs: ['chest', 'triceps'],
        equipmentSlugs: ['barbell'],
        level: 'beginner',
        favoritesOnly: true,
      }),
    );
  });

  it('omits empty/default filter categories from the composed query entirely', async () => {
    const { container, Wrapper } = await setup();
    const searchSpy = spyOnSearch(container);

    await renderHook(() => useExerciseSearch('', DEFAULT_EXERCISE_FILTERS), { wrapper: Wrapper });

    await waitFor(() => expect(searchSpy).toHaveBeenCalledWith({}));
    const [calledQuery] = searchSpy.mock.calls[0]!;
    expect(Object.keys(calledQuery)).toHaveLength(0);
  });
});
