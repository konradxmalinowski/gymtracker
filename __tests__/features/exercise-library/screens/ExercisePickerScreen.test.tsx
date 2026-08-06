import { fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import { seedLookupTables } from '@/database/seed/lookupSeeder';
import { ExercisePickerScreen } from '@/features/exercise-library/screens/ExercisePickerScreen';
import { ContainerProvider, createContainer, type AppContainer } from '@/services/container';

// See `__tests__/__mocks__/vectorIconsMock.tsx` for why this is a separate module.
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

async function renderPicker(
  container: AppContainer,
  props: { alreadySelectedIds: readonly string[]; onConfirm: (ids: string[]) => void },
) {
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

  return render(<ExercisePickerScreen {...props} />, { wrapper: Wrapper });
}

describe('ExercisePickerScreen', () => {
  it('confirms with the exercises checked by the user, excluding already-selected ones', async () => {
    const container = await createTestContainer();
    const benchPress = await container.exerciseService.createCustom({
      nameEn: 'Bench Press',
      equipmentSlug: 'barbell',
      muscles: [{ slug: 'chest', role: 'primary' }],
    });
    const overheadPress = await container.exerciseService.createCustom({
      nameEn: 'Overhead Press',
      equipmentSlug: 'barbell',
      muscles: [{ slug: 'shoulders', role: 'primary' }],
    });

    const onConfirm = jest.fn();
    const { findByText, findByTestId } = await renderPicker(container, {
      alreadySelectedIds: [benchPress.id],
      onConfirm,
    });

    expect(await findByText('Already in this day')).toBeTruthy();

    await fireEvent.press(await findByTestId(`exercise-picker-row-${overheadPress.id}`));
    await fireEvent.press(await findByTestId('exercise-picker-confirm-button'));

    expect(onConfirm).toHaveBeenCalledWith([overheadPress.id]);
  });

  it('disables the confirm button until at least one exercise is selected', async () => {
    const container = await createTestContainer();
    await container.exerciseService.createCustom({
      nameEn: 'Bench Press',
      equipmentSlug: 'barbell',
      muscles: [{ slug: 'chest', role: 'primary' }],
    });

    const onConfirm = jest.fn();
    const { findByTestId } = await renderPicker(container, {
      alreadySelectedIds: [],
      onConfirm,
    });

    await fireEvent.press(await findByTestId('exercise-picker-confirm-button'));

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
