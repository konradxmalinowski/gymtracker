import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import { seedLookupTables } from '@/database/seed/lookupSeeder';
import { ExerciseDetailScreen } from '@/features/exercise-library/screens/ExerciseDetailScreen';
import { ContainerProvider, createContainer, type AppContainer } from '@/services/container';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(),
  Stack: { Screen: () => null },
}));

// See `__tests__/__mocks__/vectorIconsMock.tsx` for why this is a separate
// module rather than an inline `jest.mock()` factory.
jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

let activeQueryClient: QueryClient | undefined;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient?.unmount();
  activeQueryClient = undefined;
});

async function createTestContainer() {
  const db = createTestDatabase();
  await seedLookupTables(db);
  return createContainer(db);
}

async function insertCatalogExercise(container: AppContainer, nameEn: string) {
  await container.exerciseRepository.replaceCatalog(
    [
      {
        catalogSlug: 'test-catalog-exercise',
        nameEn,
        nameSearch: nameEn.toLowerCase(),
        equipmentSlug: 'barbell',
        muscles: [{ slug: 'chest', role: 'primary' }],
      },
    ],
    'test-version',
  );
  const [found] = await container.exerciseService.search({ text: nameEn });
  return found!;
}

async function seedPlanReferencing(container: AppContainer, exerciseId: string, planName: string) {
  const db = container.db;
  const now = Date.now();
  const planId = `plan-${Math.random().toString(36).slice(2)}`;
  const planDayId = `plan-day-${Math.random().toString(36).slice(2)}`;
  const pdeId = `pde-${Math.random().toString(36).slice(2)}`;
  await db.run(
    'INSERT INTO plan (id, name, is_active, sort_order, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)',
    [planId, planName, now, now],
  );
  await db.run(
    'INSERT INTO plan_day (id, plan_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
    [planDayId, planId, 'Day 1', now, now],
  );
  await db.run(
    'INSERT INTO plan_day_exercise (id, plan_day_id, exercise_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
    [pdeId, planDayId, exerciseId, now, now],
  );
  return planId;
}

async function renderDetailScreen(id: string, container: AppContainer) {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id });

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

  return render(<ExerciseDetailScreen />, { wrapper: Wrapper });
}

describe('ExerciseDetailScreen', () => {
  it('hides edit/delete actions for a catalog exercise', async () => {
    const container = await createTestContainer();
    const catalogExercise = await insertCatalogExercise(container, 'Catalog Only Exercise');

    const { findByText, queryByTestId } = await renderDetailScreen(catalogExercise.id, container);

    await findByText('Catalog Only Exercise');

    expect(queryByTestId('exercise-detail-edit-button')).toBeNull();
    expect(queryByTestId('exercise-detail-delete-button')).toBeNull();
  });

  it('shows edit/delete actions for a custom exercise', async () => {
    const container = await createTestContainer();
    const created = await container.exerciseService.createCustom({
      nameEn: 'My Custom Exercise',
      equipmentSlug: 'barbell',
      muscles: [{ slug: 'chest', role: 'primary' }],
    });

    const { findByTestId } = await renderDetailScreen(created.id, container);

    expect(await findByTestId('exercise-detail-edit-button')).toBeTruthy();
    expect(await findByTestId('exercise-detail-delete-button')).toBeTruthy();
  });

  it('navigates to the edit form when the edit button is pressed', async () => {
    const container = await createTestContainer();
    const created = await container.exerciseService.createCustom({
      nameEn: 'My Custom Exercise',
      equipmentSlug: 'barbell',
      muscles: [{ slug: 'chest', role: 'primary' }],
    });

    const { findByTestId } = await renderDetailScreen(created.id, container);

    await fireEvent.press(await findByTestId('exercise-detail-edit-button'));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/exercises/edit/[id]',
      params: { id: created.id },
    });
  });

  it('shows the blocking plan names when deleting an exercise still used in a plan', async () => {
    const container = await createTestContainer();
    const created = await container.exerciseService.createCustom({
      nameEn: 'Referenced Exercise',
      equipmentSlug: 'barbell',
      muscles: [{ slug: 'chest', role: 'primary' }],
    });
    await seedPlanReferencing(container, created.id, 'Push Day');

    const { findByTestId, findByText } = await renderDetailScreen(created.id, container);

    await fireEvent.press(await findByTestId('exercise-detail-delete-button'));
    const confirmDialog = within(await findByTestId('exercise-detail-delete-confirm-dialog'));
    await fireEvent.press(confirmDialog.getByText('Delete'));

    expect(await findByText(/Push Day/)).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('deletes and navigates back when the exercise has no blocking plans', async () => {
    const container = await createTestContainer();
    const created = await container.exerciseService.createCustom({
      nameEn: 'Unreferenced Exercise',
      equipmentSlug: 'barbell',
      muscles: [{ slug: 'chest', role: 'primary' }],
    });

    const { findByTestId } = await renderDetailScreen(created.id, container);

    await fireEvent.press(await findByTestId('exercise-detail-delete-button'));
    const confirmDialog = within(await findByTestId('exercise-detail-delete-confirm-dialog'));
    await fireEvent.press(confirmDialog.getByText('Delete'));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(await container.exerciseService.getById(created.id)).toBeNull();
  });

  it('toggles favorite from the detail screen', async () => {
    const container = await createTestContainer();
    const created = await container.exerciseService.createCustom({
      nameEn: 'Favoritable Exercise',
      equipmentSlug: 'barbell',
      muscles: [{ slug: 'chest', role: 'primary' }],
    });

    const { findByTestId } = await renderDetailScreen(created.id, container);

    await fireEvent.press(await findByTestId('exercise-detail-favorite'));

    await waitFor(async () => {
      const exercise = await container.exerciseService.getById(created.id);
      expect(exercise?.userData.isFavorite).toBe(true);
    });
  });
});
