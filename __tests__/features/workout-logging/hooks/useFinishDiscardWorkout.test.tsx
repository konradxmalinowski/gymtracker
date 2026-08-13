import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import type { DatabaseContext } from '@/repositories/contracts/database';
import { useFinishDiscardWorkout } from '@/features/workout-logging/hooks/useFinishDiscardWorkout';
import { sessionSummaryKeys } from '@/features/workout-logging/hooks/useSessionHistory';
import { ContainerProvider, createContainer, type AppContainer } from '@/services/container';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
}));

const START = Date.UTC(2026, 7, 6, 18, 0, 0);

async function insertExercise(db: DatabaseContext, id = 'ex-1'): Promise<string> {
  await db.run(
    `INSERT INTO exercise (id, source, name_en, name_search, tracking_type, created_at, updated_at)
     VALUES (?, 'catalog', 'Bench Press', 'bench press', 'weight_reps', ?, ?)`,
    [id, START, START],
  );
  return id;
}

async function setup() {
  const db = createTestDatabase();
  const container = createContainer(db);
  await insertExercise(db);

  const started = await container.sessionService.startEmpty(START);
  if (started.outcome !== 'started') {
    throw new Error('unreachable - fresh test database');
  }
  const sessionExercise = await container.sessionService.addExercise(started.session.id, 'ex-1');
  const workoutSet = await container.sessionService.appendSet(sessionExercise.id, {
    weightKg: 100,
    reps: 5,
  });
  await container.sessionService.completeSet(workoutSet.id, { weightKg: 100, reps: 5 });

  const snapshot = await container.sessionService.findInProgress();
  useActiveWorkoutStore.getState().setSession(snapshot!.session);
  useActiveWorkoutStore.getState().markHydrated();

  return { container, sessionId: started.session.id };
}

function wrapper(container: AppContainer, queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ContainerProvider container={container}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ContainerProvider>
    );
  };
}

afterEach(() => {
  useActiveWorkoutStore.getState().clear();
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('useFinishDiscardWorkout - finish()', () => {
  it('seeds sessionSummaryKeys.detail with the real SessionSummary (including newPRs) before navigating to the summary route', async () => {
    const { container, sessionId } = await setup();
    // `gcTime: 0` (this codebase's usual test-QueryClient default, chosen
    // for fast teardown between tests) is deliberately NOT used here: this
    // test reads back a `setQueryData` write with no `useQuery` observer
    // attached to that key, and TanStack Query garbage-collects an
    // unobserved query almost immediately when `gcTime` is `0` - which
    // silently erased the seeded value before the assertion below could read
    // it back. The real app's `QueryClient` (`app/_layout.tsx`) already uses
    // a real 30-minute `gcTime`, so this only corrects the test's own
    // fixture, not a production bug - `WorkoutSummaryScreen`'s `useQuery`
    // becomes the observer keeping the seeded entry alive in the real app,
    // well within either window.
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 60_000 },
        mutations: { retry: false, gcTime: 0 },
      },
    });

    const { result } = await renderHook(() => useFinishDiscardWorkout(), {
      wrapper: wrapper(container, queryClient),
    });

    await act(async () => {
      await result.current.finish(sessionId);
    });

    const seeded = queryClient.getQueryData(sessionSummaryKeys.detail(sessionId));
    expect(seeded).toMatchObject({
      sessionId,
      totalSets: 1,
      totalReps: 5,
      totalVolumeKg: 500,
    });
    // A fresh exercise's first-ever completed set beats every record type
    // it's eligible for (ADR-0015 Decision 3) - `newPRs` should be non-empty
    // real data, not the `[]` placeholder a cold-cache `getSession()`
    // fallback would produce.
    expect((seeded as { newPRs: unknown[] }).newPRs.length).toBeGreaterThan(0);

    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/workout/summary/[sessionId]',
      params: { sessionId },
    });

    queryClient.clear();
    queryClient.unmount();
  });
});

describe('useFinishDiscardWorkout - discard()', () => {
  it('still navigates to Home, not the summary route', async () => {
    const { container, sessionId } = await setup();
    // `gcTime: 0` (this codebase's usual test-QueryClient default, chosen
    // for fast teardown between tests) is deliberately NOT used here: this
    // test reads back a `setQueryData` write with no `useQuery` observer
    // attached to that key, and TanStack Query garbage-collects an
    // unobserved query almost immediately when `gcTime` is `0` - which
    // silently erased the seeded value before the assertion below could read
    // it back. The real app's `QueryClient` (`app/_layout.tsx`) already uses
    // a real 30-minute `gcTime`, so this only corrects the test's own
    // fixture, not a production bug - `WorkoutSummaryScreen`'s `useQuery`
    // becomes the observer keeping the seeded entry alive in the real app,
    // well within either window.
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 60_000 },
        mutations: { retry: false, gcTime: 0 },
      },
    });

    const { result } = await renderHook(() => useFinishDiscardWorkout(), {
      wrapper: wrapper(container, queryClient),
    });

    await act(async () => {
      await result.current.discard(sessionId);
    });

    expect(router.replace).toHaveBeenCalledWith('/');
    expect(queryClient.getQueryData(sessionSummaryKeys.detail(sessionId))).toBeUndefined();

    queryClient.clear();
    queryClient.unmount();
  });
});
