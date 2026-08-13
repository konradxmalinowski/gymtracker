import { fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import { ProfileScreen } from '@/features/profile/screens/ProfileScreen';
import { ContainerProvider, createContainer, type AppContainer } from '@/services/container';

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

async function renderProfileScreen(options?: { container?: AppContainer }) {
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

  const view = await render(<ProfileScreen />, { wrapper: Wrapper });
  return { ...view, container, queryClient };
}

describe('ProfileScreen', () => {
  it('shows the nickname once the profile loads', async () => {
    const container = createContainer(createTestDatabase());
    await container.profileService.completeOnboarding({ nickname: 'Konrad' });

    const { findByText } = await renderProfileScreen({ container });

    expect(await findByText('Konrad')).toBeTruthy();
  });

  it('shows an error state with retry when the profile query fails', async () => {
    const container = createContainer(createTestDatabase());
    jest.spyOn(container.profileService, 'getProfile').mockRejectedValue(new Error('boom'));

    const { findByText } = await renderProfileScreen({ container });

    expect(await findByText('Could not load your profile.')).toBeTruthy();
  });

  it('navigates to settings from the settings row', async () => {
    const container = createContainer(createTestDatabase());
    await container.profileService.completeOnboarding({ nickname: 'Konrad' });

    const { findByText, getByTestId } = await renderProfileScreen({ container });
    await findByText('Konrad');

    await fireEvent.press(getByTestId('profile-settings-row'));

    expect(router.push).toHaveBeenCalledWith('/profile/settings');
  });

  it('P8: navigates to the personal-records list from the records row', async () => {
    const container = createContainer(createTestDatabase());
    await container.profileService.completeOnboarding({ nickname: 'Konrad' });

    const { findByText, getByTestId } = await renderProfileScreen({ container });
    await findByText('Konrad');

    await fireEvent.press(getByTestId('profile-records-row'));

    expect(router.push).toHaveBeenCalledWith('/profile/records');
  });

  it('P9: navigates to the training-history list from the history row', async () => {
    const container = createContainer(createTestDatabase());
    await container.profileService.completeOnboarding({ nickname: 'Konrad' });

    const { findByText, getByTestId } = await renderProfileScreen({ container });
    await findByText('Konrad');

    await fireEvent.press(getByTestId('profile-history-row'));

    expect(router.push).toHaveBeenCalledWith('/profile/history');
  });
});
