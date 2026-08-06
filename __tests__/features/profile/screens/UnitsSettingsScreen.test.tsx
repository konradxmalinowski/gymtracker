import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccessibilityInfo } from 'react-native';
import type { ReactNode } from 'react';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import { UnitsSettingsScreen } from '@/features/profile/screens/UnitsSettingsScreen';
import { ContainerProvider, createContainer } from '@/services/container';
import { kv } from '@/services/kv';

// See OnboardingScreen.test.tsx's identical comment: a `QueryClient`'s
// focusManager/onlineManager listeners outlive the component tree unless
// `unmount()` is called explicitly, so the most recently created client is
// tracked here and torn down after every test.
let activeQueryClient: QueryClient | undefined;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient?.unmount();
  activeQueryClient = undefined;
});

/** Real `SqliteSettingsRepository` over an in-memory schema.sql database, matching the project's integration-over-mocks testing rule. */
async function renderUnitsScreen() {
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

  const view = await render(<UnitsSettingsScreen />, { wrapper: Wrapper });
  return { ...view, container };
}

describe('UnitsSettingsScreen', () => {
  it('announces "Loading" for screen readers while settings are still pending', async () => {
    const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

    const { findByTestId } = await renderUnitsScreen();
    await findByTestId('units-weight-preview');

    expect(announceSpy).toHaveBeenCalledWith('Loading');
  });

  it('defaults to kg/cm and shows a matching preview once settings resolve', async () => {
    const { findByTestId, getByTestId } = await renderUnitsScreen();

    expect(await findByTestId('units-weight-preview')).toHaveTextContent(/kg/);
    expect(getByTestId('units-length-preview')).toHaveTextContent(/cm/);
  });

  it('updates the preview the instant a segment is tapped, before the write settles', async () => {
    const { container, findByTestId, getByTestId, getByText } = await renderUnitsScreen();

    await findByTestId('units-weight-preview');

    await fireEvent.press(getByText('lb'));

    // The preview reflects the tap synchronously (optimistic local state) -
    // no `waitFor` needed for the visual update itself.
    expect(getByTestId('units-weight-preview')).toHaveTextContent(/lb/);

    // The background write eventually lands in SQLite too.
    await waitFor(async () => {
      const value = await container.settings.get('units.weight');
      expect(value).toBe('lb');
    });
  });

  it('persists a length unit change and mirrors it to MMKV', async () => {
    const { container, findByTestId, getByTestId, getByText } = await renderUnitsScreen();
    await findByTestId('units-length-preview');

    await fireEvent.press(getByText('in'));

    expect(getByTestId('units-length-preview')).toHaveTextContent(/in/);
    await waitFor(async () => {
      expect(await container.settings.get('units.length')).toBe('in');
    });
    expect(kv.get('units.length')).toBe('in');
  });
});
