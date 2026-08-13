import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import { ProgressionSettingsScreen } from '@/features/profile/screens/ProgressionSettingsScreen';
import { ContainerProvider, createContainer } from '@/services/container';

let activeQueryClient: QueryClient | undefined;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient?.unmount();
  activeQueryClient = undefined;
});

/** Real `SqliteSettingsRepository` over an in-memory schema.sql database, matching `UnitsSettingsScreen.test.tsx`'s integration-over-mocks precedent. */
async function renderProgressionScreen() {
  const db = createTestDatabase();
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

  const view = await render(<ProgressionSettingsScreen />, { wrapper: Wrapper });
  return { ...view, container };
}

describe('ProgressionSettingsScreen', () => {
  it('defaults to Epley and the ADR-0015 default increments once settings resolve', async () => {
    const { findByTestId, getByTestId, getByRole } = await renderProgressionScreen();

    await findByTestId('progression-formula-segmented-control');
    expect(getByRole('tab', { name: 'Epley' }).props.accessibilityState.selected).toBe(true);
    expect(getByTestId('progression-upper-increment-field').props.value).toBe('2.5');
    expect(getByTestId('progression-lower-increment-field').props.value).toBe('5.0');
  });

  it('persists a formula change to oneRm.formula', async () => {
    const { container, findByTestId, getByText } = await renderProgressionScreen();
    await findByTestId('progression-formula-segmented-control');

    fireEvent.press(getByText('Brzycki'));

    await waitFor(async () => {
      expect(await container.settings.get('oneRm.formula')).toBe('brzycki');
    });
  });

  it('persists an increment change to progression.upperIncrementKg', async () => {
    const { container, findByTestId } = await renderProgressionScreen();
    await findByTestId('progression-upper-increment-field');

    const upperField = await findByTestId('progression-upper-increment-field');
    await fireEvent.changeText(upperField, '3.5');
    await fireEvent(upperField, 'blur');

    await waitFor(async () => {
      expect(await container.settings.get('progression.upperIncrementKg')).toBe(3.5);
    });
  });
});
