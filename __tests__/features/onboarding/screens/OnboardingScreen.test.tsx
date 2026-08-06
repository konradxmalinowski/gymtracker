import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import { OnboardingScreen } from '@/features/onboarding/screens/OnboardingScreen';
import { NICKNAME_MAX_LENGTH } from '@/features/profile';
import { ContainerProvider, createContainer } from '@/services/container';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

/**
 * Real `ProfileService` over a real in-memory `schema.sql` database
 * (`createTestDatabase`) rather than a hand-rolled fake - this project's
 * standing rule for anything touching SQL (CLAUDE.md's testing strategy).
 * `expo-router` and `expo-image-picker` are mocked at their module boundary
 * since they're native/navigation surfaces jest-expo has no real
 * implementation for, not domain logic this suite owns.
 */
// Each test builds its own `QueryClient` via `renderOnboarding()`. A
// `QueryClient` registers `focusManager`/`onlineManager` listeners as soon as
// a query mounts, and unmounting the component tree does not remove them -
// only `queryClient.unmount()` does. Tracking the most recently created
// client here and tearing it down in `afterEach` keeps every test's client
// from leaking listeners into the next test (or past the whole suite).
let activeQueryClient: QueryClient | undefined;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient?.unmount();
  activeQueryClient = undefined;
});

async function renderOnboarding() {
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

  const view = await render(<OnboardingScreen />, { wrapper: Wrapper });
  return { ...view, container, queryClient };
}

describe('OnboardingScreen', () => {
  it('completes onboarding with a nickname and no avatar (skip path), then navigates to tabs', async () => {
    const { container, getByTestId } = await renderOnboarding();

    await fireEvent.changeText(getByTestId('onboarding-nickname-field'), 'Konrad');
    await fireEvent.press(getByTestId('onboarding-continue-button'));

    await waitFor(async () => {
      const profile = await container.profileService.getProfile();
      expect(profile?.nickname).toBe('Konrad');
      expect(profile?.avatarFileName).toBeNull();
    });

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/');
    });
  });

  it('shows a validation error and does not submit when the nickname is empty', async () => {
    const { container, getByTestId, findByRole } = await renderOnboarding();

    await fireEvent.press(getByTestId('onboarding-continue-button'));

    expect(await findByRole('alert')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
    await expect(container.profileService.getProfile()).resolves.toBeNull();
  });

  it('rejects a nickname longer than NICKNAME_MAX_LENGTH', async () => {
    const { getByTestId, findByRole } = await renderOnboarding();

    await fireEvent.changeText(
      getByTestId('onboarding-nickname-field'),
      'x'.repeat(NICKNAME_MAX_LENGTH + 1),
    );
    await fireEvent.press(getByTestId('onboarding-continue-button'));

    expect(await findByRole('alert')).toBeTruthy();
  });

  it('completes onboarding with a picked avatar when the picker succeeds', async () => {
    const { container, getByTestId } = await renderOnboarding();

    // A real source file in the mocked filesystem (jest-expo's in-memory
    // `expo-file-system`) - matching `ProfileService.test.ts`'s own pattern
    // - since `ProfileService.completeOnboarding` really copies the picked
    // URI and swallows a copy failure into "no avatar" rather than throwing,
    // so a nonexistent source URI would silently produce a null avatar here.
    const sourcePath = 'onboarding-test-source/picked.jpg';
    await container.files.writeBytes(sourcePath, new Uint8Array([1, 2, 3]));

    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
    });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: container.files.getUri(sourcePath) }],
    });

    await fireEvent.press(getByTestId('onboarding-pick-avatar-button'));
    await waitFor(() => {
      expect(getByTestId('onboarding-pick-avatar-button')).toHaveTextContent('Change photo');
    });

    await fireEvent.changeText(getByTestId('onboarding-nickname-field'), 'Konrad');
    await fireEvent.press(getByTestId('onboarding-continue-button'));

    await waitFor(async () => {
      const profile = await container.profileService.getProfile();
      expect(profile?.nickname).toBe('Konrad');
      expect(profile?.avatarFileName).not.toBeNull();
    });
  });

  it('degrades gracefully when photo-library permission is denied - onboarding stays completable without a photo', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
    });

    const { container, getByTestId, findByText } = await renderOnboarding();

    await fireEvent.press(getByTestId('onboarding-pick-avatar-button'));

    expect(await findByText(/Photo library access was denied/i)).toBeTruthy();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();

    await fireEvent.changeText(getByTestId('onboarding-nickname-field'), 'Konrad');
    await fireEvent.press(getByTestId('onboarding-continue-button'));

    await waitFor(async () => {
      const profile = await container.profileService.getProfile();
      expect(profile?.nickname).toBe('Konrad');
      expect(profile?.avatarFileName).toBeNull();
    });
  });

  it('degrades gracefully when the picker rejects (e.g. a failed iOS crop) - onboarding stays completable without a photo', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
    });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockRejectedValue(
      new Error('Failed to crop image'),
    );

    const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

    const { container, getByTestId, findByText } = await renderOnboarding();

    await fireEvent.press(getByTestId('onboarding-pick-avatar-button'));

    expect(await findByText(/Couldn't process that photo/i)).toBeTruthy();
    await waitFor(() => {
      expect(announceSpy).toHaveBeenCalledWith("Couldn't process that photo. Try a different one.");
    });

    await fireEvent.changeText(getByTestId('onboarding-nickname-field'), 'Konrad');
    await fireEvent.press(getByTestId('onboarding-continue-button'));

    await waitFor(async () => {
      const profile = await container.profileService.getProfile();
      expect(profile?.nickname).toBe('Konrad');
      expect(profile?.avatarFileName).toBeNull();
    });
  });
});
