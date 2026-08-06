import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import { SettingsScreen } from '@/features/profile/screens/SettingsScreen';
import { ContainerProvider, createContainer } from '@/services/container';
import { kv } from '@/services/kv';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

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

async function renderSettingsScreen() {
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

  const view = await render(<SettingsScreen />, { wrapper: Wrapper });
  return { ...view, container };
}

describe('SettingsScreen', () => {
  it('renders the haptics switch on (schema default) once settings resolve', async () => {
    const { getByTestId } = await renderSettingsScreen();

    await waitFor(() => {
      expect(getByTestId('settings-haptics-switch').props.value).toBe(true);
    });
  });

  it('toggling the haptics switch persists the change and mirrors it to MMKV', async () => {
    const { container, getByTestId } = await renderSettingsScreen();

    await waitFor(() => {
      expect(getByTestId('settings-haptics-switch').props.value).toBe(true);
    });

    await fireEvent(getByTestId('settings-haptics-switch'), 'valueChange', false);

    await waitFor(async () => {
      expect(await container.settings.get('haptics.enabled')).toBe(false);
    });
    expect(kv.get('haptics.enabled')).toBe(false);
  });

  it('navigates to the units screen from the units row', async () => {
    const { findByTestId } = await renderSettingsScreen();

    await fireEvent.press(await findByTestId('settings-units-row'));

    expect(router.push).toHaveBeenCalledWith('/profile/settings/units');
  });

  it('navigates to the about screen from the about row', async () => {
    const { findByTestId } = await renderSettingsScreen();

    await fireEvent.press(await findByTestId('settings-about-row'));

    expect(router.push).toHaveBeenCalledWith('/profile/settings/about');
  });
});
