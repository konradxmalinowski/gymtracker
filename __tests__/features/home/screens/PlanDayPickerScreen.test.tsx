import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import { PlanDayPickerScreen } from '@/features/home/screens/PlanDayPickerScreen';
import { ContainerProvider, createContainer, type AppContainer } from '@/services/container';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { kv } from '@/services/kv';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  Stack: { Screen: () => null },
}));

jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

let activeQueryClient: QueryClient | undefined;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient?.unmount();
  activeQueryClient = undefined;
  useActiveWorkoutStore.getState().clear();
  kv.delete('session.active');
  kv.delete('session.activeId');
  jest.clearAllMocks();
});

async function renderPicker(planId: string, container: AppContainer) {
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

  return render(<PlanDayPickerScreen planId={planId} />, { wrapper: Wrapper });
}

describe('PlanDayPickerScreen', () => {
  it("lists the plan's days and shows the empty state for a plan with zero days", async () => {
    const container = createContainer(createTestDatabase());
    const emptyPlan = await container.planService.createPlan({ name: 'Empty Plan' });

    const { findByTestId } = await renderPicker(emptyPlan.id, container);

    expect(await findByTestId('plan-day-picker-empty-state')).toBeTruthy();
  });

  it('lists each day as a row', async () => {
    const container = createContainer(createTestDatabase());
    const plan = await container.planService.createPlan({ name: 'Push Pull Legs' });
    const dayA = await container.planService.addDay(plan.id, { name: 'Push Day' });
    const dayB = await container.planService.addDay(plan.id, { name: 'Pull Day' });

    const { findByTestId, findByText } = await renderPicker(plan.id, container);

    await findByTestId(`plan-day-picker-row-${dayA.id}`);
    await findByTestId(`plan-day-picker-row-${dayB.id}`);
    expect(await findByText('Push Day')).toBeTruthy();
    expect(await findByText('Pull Day')).toBeTruthy();
  });

  it('shows an error state with retry when the plan fails to load', async () => {
    const container = createContainer(createTestDatabase());
    const plan = await container.planService.createPlan({ name: 'Push Pull Legs' });
    const getPlanSpy = jest
      .spyOn(container.planService, 'getPlan')
      .mockRejectedValueOnce(new Error('boom'));

    const { findByText } = await renderPicker(plan.id, container);

    expect(await findByText('Could not load this plan.')).toBeTruthy();

    await fireEvent.press(await findByText('Try again'));
    await waitFor(() => expect(getPlanSpy).toHaveBeenCalledTimes(2));
  });

  it('shows a not-found state for a plan id that does not exist', async () => {
    const container = createContainer(createTestDatabase());

    const { findByText } = await renderPicker('does-not-exist', container);

    expect(await findByText('This plan could not be found.')).toBeTruthy();
  });

  /**
   * Regression coverage for a real bug caught in code review: an earlier
   * implementation tried to push `workout/active` and then pop this screen
   * off the stack afterward (`router.back()`) once the start settled. That
   * doesn't work - `goBack`'s bubbling semantics target whichever screen is
   * *currently focused* (the just-pushed `workout/active`), not this picker
   * sitting underneath it, so `router.back()` at that point would have
   * dismissed the workout screen it was supposed to protect, not the picker.
   * The fix replaces this screen's own stack entry with `workout/active` in
   * one atomic `router.replace` instead (`useStartWorkout`'s `{ navigation:
   * 'replace' }` option) - `router.push`/`router.back` must never be called
   * for a direct start.
   */
  it('replaces itself with the workout screen on a successful start, using router.replace (not push+back)', async () => {
    const container = createContainer(createTestDatabase());
    const plan = await container.planService.createPlan({ name: 'Push Pull Legs' });
    const day = await container.planService.addDay(plan.id, { name: 'Push Day' });

    const { findByTestId } = await renderPicker(plan.id, container);

    await fireEvent.press(await findByTestId(`plan-day-picker-row-${day.id}`));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/workout/active'));
    expect(router.push).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('does NOT replace itself while a start is blocked by an already-in-progress session, and shows the blocked-session dialog instead', async () => {
    const container = createContainer(createTestDatabase());
    const plan = await container.planService.createPlan({ name: 'Push Pull Legs' });
    const day = await container.planService.addDay(plan.id, { name: 'Push Day' });

    // Pre-existing in-progress session, real repository-level guard
    // (`ux_session_single_in_progress`), surfaced by the service as
    // `outcome: 'blocked'`.
    const existing = await container.sessionService.startEmpty(Date.now(), 'Existing Session');
    if (existing.outcome !== 'started') {
      throw new Error('unreachable - fresh test database');
    }

    const { findByTestId, findByText } = await renderPicker(plan.id, container);

    await fireEvent.press(await findByTestId(`plan-day-picker-row-${day.id}`));

    expect(await findByText('A workout is already in progress')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  /**
   * Accessibility regression (found by the P10 accessibility review,
   * `reports/accessibility-2026-08-18-p10.md` A11Y-P10-001): this screen's
   * loading and empty states previously never announced, unlike this same
   * phase's `HomeScreen.tsx` (`common.loading`) and the established
   * `PersonalRecordsScreen.tsx`/`WorkoutHistoryListScreen.tsx` precedent for
   * the empty-title announcement (A11Y-P8-003/A11Y-P9-002's violation
   * class).
   */
  it('announces loading, then the empty-plan title, via AccessibilityInfo', async () => {
    const container = createContainer(createTestDatabase());
    const emptyPlan = await container.planService.createPlan({ name: 'Empty Plan' });
    const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

    const { findByTestId } = await renderPicker(emptyPlan.id, container);

    expect(announceSpy).toHaveBeenCalledWith('Loading');

    await findByTestId('plan-day-picker-empty-state');
    expect(announceSpy).toHaveBeenCalledWith('No days yet');
  });

  /**
   * Accessibility regression (A11Y-P10-002): an earlier implementation
   * gated the tap by nulling `ListRow`'s `onPress` prop while `isStarting`
   * was true (`onPress={isStarting ? undefined : () => ...}`), which took
   * the row out of `ListRow`'s `PressScale`/accessible branch entirely -
   * silently discarding `accessibilityRole="button"`, its descriptive
   * `accessibilityLabel`, and the `accessibilityState={{ disabled, busy }}`
   * `busy={isStarting}` was supposed to expose, confirmed empirically via an
   * RNTL prop dump showing `{}` for all three while a start was in flight.
   * The fix relies on `disabled` alone to gate the press (the same pattern
   * `Button.tsx`'s own `loading` state already uses, since `PressScale`/RN
   * `Pressable` already refuse to fire `onPress` once `disabled` is true) -
   * this test asserts the row stays a correctly-labeled, busy-announced
   * button throughout, not just that the press eventually resolves.
   */
  it('keeps the pressed row a labeled, busy button while a start is in flight, not a bare unlabeled node (A11Y-P10-002 regression)', async () => {
    const container = createContainer(createTestDatabase());
    const plan = await container.planService.createPlan({ name: 'Push Pull Legs' });
    const day = await container.planService.addDay(plan.id, { name: 'Push Day' });

    let resolveStart: (() => void) | undefined;
    jest.spyOn(container.sessionService, 'startFromPlanDay').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStart = () => resolve({ outcome: 'started', session: { id: 's1' } as never });
        }),
    );

    const { findByTestId } = await renderPicker(plan.id, container);
    const row = await findByTestId(`plan-day-picker-row-${day.id}`);

    await act(async () => {
      fireEvent.press(row);
    });

    const rowWhileStarting = await findByTestId(`plan-day-picker-row-${day.id}`);
    expect(rowWhileStarting.props.accessibilityRole).toBe('button');
    expect(rowWhileStarting.props.accessibilityLabel).toBe('Push Day');
    expect(rowWhileStarting.props.accessibilityState).toEqual({ disabled: true, busy: true });

    resolveStart?.();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/workout/active'));
  });

  it('replaces itself with the workout screen when the user resumes the blocked session', async () => {
    const container = createContainer(createTestDatabase());
    const plan = await container.planService.createPlan({ name: 'Push Pull Legs' });
    const day = await container.planService.addDay(plan.id, { name: 'Push Day' });
    const existing = await container.sessionService.startEmpty(Date.now(), 'Existing Session');
    if (existing.outcome !== 'started') {
      throw new Error('unreachable - fresh test database');
    }

    const { findByTestId, findByText } = await renderPicker(plan.id, container);

    await fireEvent.press(await findByTestId(`plan-day-picker-row-${day.id}`));
    expect(await findByText('A workout is already in progress')).toBeTruthy();

    await fireEvent.press(await findByText('Resume'));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/workout/active'));
    expect(router.push).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });
});
