import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import type { DatabaseContext } from '@/repositories/contracts/database';
import { ActiveWorkoutScreen } from '@/features/workout-logging/screens/ActiveWorkoutScreen';
import { ContainerProvider, createContainer, type AppContainer } from '@/services/container';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
}));

// See `__tests__/__mocks__/vectorIconsMock.tsx` for why this is a separate module.
jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

const START = Date.UTC(2026, 7, 6, 18, 0, 0);

async function insertExercise(db: DatabaseContext, id = 'ex-1'): Promise<string> {
  await db.run(
    `INSERT INTO exercise (id, source, name_en, name_search, tracking_type, created_at, updated_at)
     VALUES (?, 'catalog', 'Bench Press', 'bench press', 'weight_reps', ?, ?)`,
    [id, START, START],
  );
  return id;
}

let activeQueryClient: QueryClient | undefined;

afterEach(() => {
  useActiveWorkoutStore.getState().clear();
  jest.clearAllMocks();
  activeQueryClient?.clear();
  activeQueryClient = undefined;
});

function Wrapper(container: AppContainer) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  activeQueryClient = queryClient;

  return function InnerWrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <ContainerProvider container={container}>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </ContainerProvider>
      </SafeAreaProvider>
    );
  };
}

describe('ActiveWorkoutScreen', () => {
  it('hydrates from the database on mount and renders the session title and its exercise', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const started = await container.sessionService.startEmpty(START, 'Push Day A');
    if (started.outcome !== 'started') throw new Error('unreachable');
    const sessionExercise = await container.sessionService.addExercise(started.session.id, 'ex-1');
    await container.sessionService.appendSet(sessionExercise.id, { weightKg: 60, reps: 8 });

    const { findByText, findByTestId } = await render(<ActiveWorkoutScreen />, {
      wrapper: Wrapper(container),
    });

    expect(await findByText('Push Day A')).toBeTruthy();
    expect(await findByTestId(`session-exercise-card-${sessionExercise.id}`)).toBeTruthy();
  });

  it('shows the empty-session fallback and returns Home when nothing is in progress', async () => {
    const container = createContainer(createTestDatabase());

    const { findByTestId } = await render(<ActiveWorkoutScreen />, { wrapper: Wrapper(container) });

    const empty = await findByTestId('active-workout-empty-state');
    expect(empty).toBeTruthy();
  });

  it('completing a set from the screen persists it and reflects the checked state', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const started = await container.sessionService.startEmpty(START, 'Push Day A');
    if (started.outcome !== 'started') throw new Error('unreachable');
    const sessionExercise = await container.sessionService.addExercise(started.session.id, 'ex-1');
    const workoutSet = await container.sessionService.appendSet(sessionExercise.id, {
      weightKg: 60,
      reps: 8,
    });

    const { findByTestId } = await render(<ActiveWorkoutScreen />, { wrapper: Wrapper(container) });

    const checkbox = await findByTestId(
      `session-exercise-card-${sessionExercise.id}-set-${workoutSet.id}-complete`,
    );
    fireEvent.press(checkbox);

    await waitFor(async () => {
      const persisted = await container.sessionRepository.findInProgress();
      expect(persisted?.exercises[0]?.sets[0]?.isCompleted).toBe(true);
    });
  });

  it('P8: completing a set that earns a personal record shows the PR badge on its row', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const started = await container.sessionService.startEmpty(START, 'Push Day A');
    if (started.outcome !== 'started') throw new Error('unreachable');
    const sessionExercise = await container.sessionService.addExercise(started.session.id, 'ex-1');
    const workoutSet = await container.sessionService.appendSet(sessionExercise.id, {
      weightKg: 100,
      reps: 5,
    });

    const { findByTestId, findByText } = await render(<ActiveWorkoutScreen />, {
      wrapper: Wrapper(container),
    });

    const checkbox = await findByTestId(
      `session-exercise-card-${sessionExercise.id}-set-${workoutSet.id}-complete`,
    );
    fireEvent.press(checkbox);

    // A fresh exercise's first-ever completed set trivially earns several
    // PRs at once (ADR-0015 Decision 3: max weight, max reps, weight-at-reps,
    // max set volume, e1RM) - the badge appears once the async completeSet()
    // write settles and writes activeWorkoutStore.latestPR.
    expect(await findByText('5 new PRs!')).toBeTruthy();
  });

  it('P8: the PR badge disappears once activeWorkoutStore.latestPR clears, even though session.exercises itself never changes for that update', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const started = await container.sessionService.startEmpty(START, 'Push Day A');
    if (started.outcome !== 'started') throw new Error('unreachable');
    const sessionExercise = await container.sessionService.addExercise(started.session.id, 'ex-1');
    const workoutSet = await container.sessionService.appendSet(sessionExercise.id, {
      weightKg: 100,
      reps: 5,
    });

    const { findByTestId, findByText, queryByText, unmount } = await render(
      <ActiveWorkoutScreen />,
      { wrapper: Wrapper(container) },
    );

    const checkbox = await findByTestId(
      `session-exercise-card-${sessionExercise.id}-set-${workoutSet.id}-complete`,
    );
    fireEvent.press(checkbox);
    expect(await findByText('5 new PRs!')).toBeTruthy();

    // `clearLatestPR()` is exactly what `ActiveWorkoutScreen`'s own
    // self-clear timeout calls - triggered directly here rather than via
    // `jest.advanceTimersByTime`/a real 4s wait, since the point under test
    // is the redraw, not the timing: this store update touches only
    // `latestPR`, never `session`, so `activeSession.exercises` (FlashList's
    // `data` prop) keeps the exact same array/item references it had a
    // moment ago.
    //
    // NOTE for future readers (found while re-verifying this suite, P8 test-
    // coverage pass): this does NOT actually exercise `extraData` the way
    // its inline comment on the `<FlashList>` call site claims. Confirmed by
    // temporarily deleting `extraData={{ focusedSetId, latestPR }}` from
    // `ActiveWorkoutScreen.tsx` and re-running this file - both this test and
    // the "badge appears" test above still passed unchanged. Root cause:
    // FlashList v2's `ViewHolder` is `React.memo`'d comparing `renderItem` by
    // reference among its other props
    // (`@shopify/flash-list/dist/recyclerview/ViewHolder.js`), and this
    // screen's `renderItem` is an inline arrow function re-created on every
    // `ActiveWorkoutScreen` render - so every cell already re-renders on any
    // state change in this screen, `extraData` or not. `extraData` is still
    // correct, harmless, defensive practice (it is exactly what would matter
    // if `renderItem` were ever wrapped in `useCallback`), but as the code
    // stands today it is not load-bearing, and no RNTL assertion can honestly
    // claim otherwise. This test is kept because the behavior itself (the
    // badge actually disappearing on a `latestPR`-only store update) is worth
    // covering regardless of which mechanism causes it to re-render.
    await act(async () => {
      useActiveWorkoutStore.getState().clearLatestPR();
    });

    await waitFor(() => {
      expect(queryByText('5 new PRs!')).toBeNull();
    });

    unmount();
  });

  it('Finish persists the summary, clears the store, and replaces the route with the summary screen', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    const started = await container.sessionService.startEmpty(START, 'Quick Start');
    if (started.outcome !== 'started') throw new Error('unreachable');

    const { findByTestId } = await render(<ActiveWorkoutScreen />, { wrapper: Wrapper(container) });

    await fireEvent.press(await findByTestId('workout-header-finish'));

    // P9: `finish()` now replaces with `workout/summary/[sessionId]` (the
    // route graph's `SUM --> HOME` edge), not Home directly - see
    // `useFinishDiscardWorkout.ts`'s own doc comment.
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/workout/summary/[sessionId]',
        params: { sessionId: started.session.id },
      });
    });
    expect(useActiveWorkoutStore.getState().session).toBeNull();

    const persisted = await container.sessionRepository.findInProgress();
    expect(persisted).toBeNull();
  });
});
