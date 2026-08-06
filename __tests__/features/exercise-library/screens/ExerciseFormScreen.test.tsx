import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import { seedLookupTables } from '@/database/seed/lookupSeeder';
import { ExerciseFormScreen } from '@/features/exercise-library/screens/ExerciseFormScreen';
import { ContainerProvider, createContainer, type AppContainer } from '@/services/container';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(),
  Stack: { Screen: () => null },
}));

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

async function renderCreateForm(container: AppContainer) {
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

  return render(<ExerciseFormScreen mode="create" />, { wrapper: Wrapper });
}

describe('ExerciseFormScreen - create mode', () => {
  it('shows validation errors and does not submit when required fields are missing', async () => {
    const container = await createTestContainer();
    const { findByTestId, findByText } = await renderCreateForm(container);

    await fireEvent.press(await findByTestId('exercise-form-save-button'));

    expect(await findByText('Enter a name for this exercise.')).toBeTruthy();
    expect(await findByText('Select at least one primary muscle.')).toBeTruthy();
    expect(await findByText('Select the equipment this exercise uses.')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('creates the exercise and navigates to its detail screen on success', async () => {
    const container = await createTestContainer();
    const { findByTestId, findByPlaceholderText } = await renderCreateForm(container);

    await fireEvent.changeText(
      await findByPlaceholderText('e.g. Barbell Bench Press'),
      'Test Exercise',
    );
    await fireEvent.press(await findByTestId('exercise-form-primary-muscle-chest'));
    await fireEvent.press(await findByTestId('exercise-form-equipment-barbell'));

    await fireEvent.press(await findByTestId('exercise-form-save-button'));

    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    const [calledWith] = (router.replace as jest.Mock).mock.calls[0] as [
      { pathname: string; params: { id: string } },
    ];
    expect(calledWith.pathname).toBe('/exercises/[id]');

    const created = await container.exerciseService.getById(calledWith.params.id);
    expect(created?.nameEn).toBe('Test Exercise');
    expect(created?.equipmentSlug).toBe('barbell');
    expect(created?.muscles).toEqual([{ slug: 'chest', role: 'primary' }]);
  });

  it('selecting a muscle as primary then as secondary moves it between groups', async () => {
    const container = await createTestContainer();
    const { findByTestId } = await renderCreateForm(container);

    await fireEvent.press(await findByTestId('exercise-form-primary-muscle-chest'));
    expect(
      (await findByTestId('exercise-form-primary-muscle-chest')).props.accessibilityState.selected,
    ).toBe(true);

    await fireEvent.press(await findByTestId('exercise-form-secondary-muscle-chest'));

    expect(
      (await findByTestId('exercise-form-secondary-muscle-chest')).props.accessibilityState
        .selected,
    ).toBe(true);
    expect(
      (await findByTestId('exercise-form-primary-muscle-chest')).props.accessibilityState.selected,
    ).toBe(false);
  });
});
