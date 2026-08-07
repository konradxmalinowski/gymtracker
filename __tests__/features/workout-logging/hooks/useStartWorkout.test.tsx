import { act, renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import { useStartWorkout } from '@/features/workout-logging/hooks/useStartWorkout';
import { createContainer } from '@/services/container';
import { kv } from '@/services/kv';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
}));

afterEach(() => {
  useActiveWorkoutStore.getState().clear();
  kv.delete('session.active');
  kv.delete('session.activeId');
  jest.clearAllMocks();
});

/**
 * All four scenarios share a single `renderHook()` mount, the same
 * reasoning `useReorderPlans.test.tsx`'s file header documents for the
 * identical `@testing-library/react-native` quirk: a second `renderHook()`
 * call later in the same file reliably leaves `result.current` stale, so
 * every scenario below drives the same hook instance forward instead.
 */
describe('useStartWorkout', () => {
  it('start, block, dismiss and resume all behave correctly against one hook instance', async () => {
    const container = createContainer(createTestDatabase());
    const { result } = await renderHook(() => useStartWorkout(container.sessionService));

    // --- startEmpty: hydrates the store, writes the ADR-0005 MMKV flags, navigates ---
    await act(async () => {
      await result.current.startEmpty();
    });

    const firstSession = useActiveWorkoutStore.getState().session;
    expect(firstSession).not.toBeNull();
    expect(useActiveWorkoutStore.getState().isHydrated).toBe(true);
    expect(kv.get('session.active')).toBe(true);
    expect(kv.get('session.activeId')).toBe(firstSession?.id);
    expect(router.push).toHaveBeenCalledWith('/workout/active');

    // --- A second start while the first is still in progress: blocked, not an exception, and no navigation ---
    jest.clearAllMocks();
    useActiveWorkoutStore.getState().clear();
    kv.delete('session.active');
    kv.delete('session.activeId');

    await act(async () => {
      await result.current.startEmpty();
    });

    expect(result.current.blockedSession?.session.id).toBe(firstSession?.id);
    expect(router.push).not.toHaveBeenCalled();
    expect(kv.get('session.active')).toBeUndefined();

    // --- dismissBlocked: clears the prompt without starting or navigating ---
    await act(() => {
      result.current.dismissBlocked();
    });
    expect(result.current.blockedSession).toBeNull();
    expect(useActiveWorkoutStore.getState().session).toBeNull();

    // --- Blocked again, then resumeBlocked: hydrates with the existing session and navigates ---
    await act(async () => {
      await result.current.startEmpty();
    });
    expect(result.current.blockedSession).not.toBeNull();

    await act(() => {
      result.current.resumeBlocked();
    });

    expect(useActiveWorkoutStore.getState().session?.id).toBe(firstSession?.id);
    expect(kv.get('session.activeId')).toBe(firstSession?.id);
    expect(router.push).toHaveBeenCalledWith('/workout/active');
  });
});
