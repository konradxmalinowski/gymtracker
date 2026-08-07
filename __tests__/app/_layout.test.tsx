import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import { ContainerProvider, createContainer, type AppContainer } from '@/services/container';
import { FixedClock } from '@/services/clock';
import { kv } from '@/services/kv';
import { useToastStore } from '@/stores/toastStore';
// No `@/app/*` tsconfig path alias exists (expo-router file-based routing
// never needs one for app code) - a relative import is this test's only option.
import { RootNavigationGate } from '../../app/_layout';

// `app/_layout.tsx` imports `../global.css` (NativeWind's Tailwind
// directives) as its very first line - nothing in this repo's Jest config
// transforms `.css` files (no prior test has ever imported from `app/
// _layout.tsx` directly), so this mock is this test file's own
// responsibility, not a `jest.config.js` change outside this fix's owned
// files. `jest.mock` calls are hoisted above imports by babel-plugin-jest-
// hoist regardless of source position, so this still intercepts the import
// above. Resolves to the same absolute path `app/_layout.tsx`'s own
// `../global.css` does.
jest.mock('../../global.css', () => ({}), { virtual: true });

jest.mock('expo-router', () => ({
  Stack: () => null,
  Redirect: () => null,
}));

const START = Date.UTC(2026, 7, 6, 18, 0, 0);
const HOUR = 60 * 60 * 1000;
// `workout.staleAfterHours` defaults to 6 (`repositories/settings/settingsSchema.ts`).
const STALE_AFTER_HOURS = 6;

async function setupStaleSession() {
  const db = createTestDatabase();
  const clock = new FixedClock(START);
  const container = createContainer(db, { clock });
  await container.profileService.completeOnboarding({ nickname: 'Konrad' });

  const started = await container.sessionService.startEmpty(START);
  if (started.outcome !== 'started') {
    throw new Error('unreachable - no prior session exists in a fresh test database');
  }
  kv.set('session.active', true);
  kv.set('session.activeId', started.session.id);

  // Past `workout.staleAfterHours` so the gate renders the finish-or-discard
  // dialog (ADR-0005 mechanism 7) rather than silently redirecting to resume.
  clock.advance((STALE_AFTER_HOURS + 1) * HOUR);

  return { container, sessionId: started.session.id };
}

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

function wrapper(container: AppContainer) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <ContainerProvider container={container}>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </ContainerProvider>
      </SafeAreaProvider>
    );
  };
}

afterEach(() => {
  kv.delete('session.active');
  kv.delete('session.activeId');
  useToastStore.setState({ current: null });
  jest.restoreAllMocks();
});

describe('RootNavigationGate - stale session resolution', () => {
  it('on a successful Finish, clears the MMKV flags (ADR-0005 mechanism 6)', async () => {
    const { container, sessionId } = await setupStaleSession();

    const { findByRole } = await render(<RootNavigationGate />, { wrapper: wrapper(container) });
    await fireEvent.press(await findByRole('button', { name: 'Finish' }));

    await waitFor(() => {
      expect(kv.get('session.active')).toBe(false);
    });
    expect(kv.get('session.activeId')).toBeUndefined();

    const persisted = await container.sessionRepository.findInProgress();
    expect(persisted?.id).not.toBe(sessionId);
  });

  it('when finish() fails, leaves the MMKV flags untouched and shows a toast - the database still wins, not the failed write', async () => {
    const { container, sessionId } = await setupStaleSession();
    jest.spyOn(container.sessionService, 'finish').mockRejectedValueOnce(new Error('boom'));

    const { findByRole } = await render(<RootNavigationGate />, { wrapper: wrapper(container) });
    await fireEvent.press(await findByRole('button', { name: 'Finish' }));

    await waitFor(() => {
      expect(useToastStore.getState().current).not.toBeNull();
    });

    // The flags must survive exactly as they were - a cleared flag here
    // would mean no future boot ever checks `findInProgress()` again, and
    // the still-`in_progress` row is silently orphaned forever.
    expect(kv.get('session.active')).toBe(true);
    expect(kv.get('session.activeId')).toBe(sessionId);

    const persisted = await container.sessionRepository.findInProgress();
    expect(persisted?.id).toBe(sessionId);
    expect(persisted?.status).toBe('in_progress');
  });

  it('when discard() fails, also leaves the MMKV flags untouched and shows a toast', async () => {
    const { container, sessionId } = await setupStaleSession();
    jest.spyOn(container.sessionService, 'discard').mockRejectedValueOnce(new Error('boom'));

    const { findByRole } = await render(<RootNavigationGate />, { wrapper: wrapper(container) });
    await fireEvent.press(await findByRole('button', { name: 'Discard' }));

    await waitFor(() => {
      expect(useToastStore.getState().current).not.toBeNull();
    });

    expect(kv.get('session.active')).toBe(true);
    expect(kv.get('session.activeId')).toBe(sessionId);

    const persisted = await container.sessionRepository.findInProgress();
    expect(persisted?.id).toBe(sessionId);
    expect(persisted?.status).toBe('in_progress');
  });
});
