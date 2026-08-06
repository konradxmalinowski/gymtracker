import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import { seedLookupTables } from '@/database/seed/lookupSeeder';
import { ExerciseLibraryScreen } from '@/features/exercise-library/screens/ExerciseLibraryScreen';
import {
  DEFAULT_EXERCISE_FILTERS,
  useExerciseFilterStore,
} from '@/features/exercise-library/hooks/exerciseFilterStore';
import { ContainerProvider, createContainer, type AppContainer } from '@/services/container';
import { useSheetStore } from '@/stores/sheetStore';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

// See `__tests__/__mocks__/vectorIconsMock.tsx` for why this is a separate
// module rather than an inline `jest.mock()` factory.
jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

let activeQueryClient: QueryClient | undefined;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient?.unmount();
  activeQueryClient = undefined;
  useExerciseFilterStore.setState({ filters: DEFAULT_EXERCISE_FILTERS });
  useSheetStore.setState({ current: null, queue: [] });
});

async function renderLibraryScreen(options?: { container?: AppContainer }) {
  const container = options?.container ?? createContainer(createTestDatabase());
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

  const view = await render(<ExerciseLibraryScreen />, { wrapper: Wrapper });
  return { ...view, container };
}

async function createTestContainer() {
  const db = createTestDatabase();
  await seedLookupTables(db);
  return createContainer(db);
}

describe('ExerciseLibraryScreen', () => {
  it('shows the catalog-not-seeded empty state when there are no exercises at all', async () => {
    const container = await createTestContainer();
    const { findByText } = await renderLibraryScreen({ container });

    expect(await findByText('No exercises yet')).toBeTruthy();
  });

  it('renders a created custom exercise in the results list', async () => {
    const container = await createTestContainer();
    await container.exerciseService.createCustom({
      nameEn: 'Barbell Bench Press',
      equipmentSlug: 'barbell',
      muscles: [{ slug: 'chest', role: 'primary' }],
    });

    const { findByText } = await renderLibraryScreen({ container });

    expect(await findByText('Barbell Bench Press')).toBeTruthy();
  });

  it('navigates to the create form when the add button is pressed', async () => {
    const container = await createTestContainer();
    const { findByTestId } = await renderLibraryScreen({ container });

    await fireEvent.press(await findByTestId('exercise-add-button'));

    expect(router.push).toHaveBeenCalledWith('/exercises/create');
  });

  it('navigates to the detail screen when a row is pressed', async () => {
    const container = await createTestContainer();
    const created = await container.exerciseService.createCustom({
      nameEn: 'Barbell Bench Press',
      equipmentSlug: 'barbell',
      muscles: [{ slug: 'chest', role: 'primary' }],
    });

    const { findByTestId } = await renderLibraryScreen({ container });

    await fireEvent.press(await findByTestId(`exercise-row-${created.id}`));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/exercises/[id]',
      params: { id: created.id },
    });
  });

  it('toggles favorite from the row without navigating to the detail screen', async () => {
    const container = await createTestContainer();
    const created = await container.exerciseService.createCustom({
      nameEn: 'Barbell Bench Press',
      equipmentSlug: 'barbell',
      muscles: [{ slug: 'chest', role: 'primary' }],
    });

    const { findByTestId } = await renderLibraryScreen({ container });

    await fireEvent.press(await findByTestId(`exercise-row-${created.id}-favorite`));

    await waitFor(async () => {
      const exercise = await container.exerciseService.getById(created.id);
      expect(exercise?.userData.isFavorite).toBe(true);
    });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('opens the filter sheet when the filters button is pressed', async () => {
    const container = await createTestContainer();
    const { findByTestId } = await renderLibraryScreen({ container });

    await fireEvent.press(await findByTestId('exercise-filters-button'));

    expect(useSheetStore.getState().current?.id).toBe('exercise-filters');
  });
});
