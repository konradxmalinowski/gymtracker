import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import type { DatabaseContext } from '@/repositories/contracts/database';
import {
  sessionHistoryKeys,
  sessionSummaryKeys,
  useDeleteSession,
  useHistoricalSessionMutations,
  useSessionDetail,
  useSessionHistoryList,
  useSessionSummary,
} from '@/features/workout-logging/hooks/useSessionHistory';
import type { SessionSummary } from '@/features/workout-logging';
import { ContainerProvider, createContainer, type AppContainer } from '@/services/container';

const START = Date.UTC(2026, 7, 6, 18, 0, 0);

async function insertExercise(db: DatabaseContext, id = 'ex-1'): Promise<string> {
  await db.run(
    `INSERT INTO exercise (id, source, name_en, name_search, tracking_type, created_at, updated_at)
     VALUES (?, 'catalog', 'Bench Press', 'bench press', 'weight_reps', ?, ?)`,
    [id, START, START],
  );
  return id;
}

/**
 * A real finished session with one completed set - `getSession()` only ever
 * returns `completed` sessions, so every read hook here needs one to exist.
 * Assumes `insertExercise(db, 'ex-1')` has already run against the same
 * container's database.
 */
async function finishASession(container: AppContainer, startedAt = START) {
  const started = await container.sessionService.startEmpty(startedAt);
  if (started.outcome !== 'started') {
    throw new Error('unreachable - fresh test database');
  }
  const sessionExercise = await container.sessionService.addExercise(started.session.id, 'ex-1');
  const workoutSet = await container.sessionService.appendSet(sessionExercise.id, {
    weightKg: 60,
    reps: 8,
  });
  await container.sessionService.completeSet(workoutSet.id, { weightKg: 60, reps: 8 });
  await container.sessionService.finish(started.session.id, startedAt + 60_000);
  return started.session.id;
}

function makeWrapper(container: AppContainer, queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ContainerProvider container={container}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ContainerProvider>
    );
  };
}

function newQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
}

describe('useSessionSummary', () => {
  it('reads a cache-seeded SessionSummary with no extra getSession() call (the warm path useFinishDiscardWorkout relies on)', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const sessionId = await finishASession(container);
    const getSessionSpy = jest.spyOn(container.sessionService, 'getSession');

    const queryClient = newQueryClient();
    const seeded: SessionSummary = {
      sessionId,
      title: 'Quick Start',
      startedAt: START,
      finishedAt: START + 60_000,
      localDate: '2026-08-06',
      durationSeconds: 60,
      totalVolumeKg: 480,
      totalSets: 1,
      totalReps: 8,
      estimatedKcal: null,
      newPRs: [],
    };
    queryClient.setQueryData(sessionSummaryKeys.detail(sessionId), seeded);

    const { result } = await renderHook(
      () => useSessionSummary(container.sessionService, queryClient, sessionId),
      { wrapper: makeWrapper(container, queryClient) },
    );

    await waitFor(() => expect(result.current.data).toEqual(seeded));
    expect(getSessionSpy).not.toHaveBeenCalled();

    queryClient.clear();
    queryClient.unmount();
  });

  it('falls back to getSession() with an empty newPRs array when the cache is cold', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const sessionId = await finishASession(container);

    const queryClient = newQueryClient();
    const { result } = await renderHook(
      () => useSessionSummary(container.sessionService, queryClient, sessionId),
      { wrapper: makeWrapper(container, queryClient) },
    );

    await waitFor(() => expect(result.current.data).not.toBeUndefined());
    expect(result.current.data?.sessionId).toBe(sessionId);
    expect(result.current.data?.totalSets).toBe(1);
    expect(result.current.data?.newPRs).toEqual([]);

    queryClient.clear();
    queryClient.unmount();
  });
});

describe('useSessionDetail', () => {
  it('returns the full SessionAggregate for a completed session', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const sessionId = await finishASession(container);

    const queryClient = newQueryClient();
    const { result } = await renderHook(
      () => useSessionDetail(container.sessionService, sessionId),
      {
        wrapper: makeWrapper(container, queryClient),
      },
    );

    await waitFor(() => expect(result.current.data).not.toBeUndefined());
    expect(result.current.data?.exercises).toHaveLength(1);
    expect(result.current.data?.exercises[0]?.sets).toHaveLength(1);

    queryClient.clear();
    queryClient.unmount();
  });

  it('is disabled (no query) while sessionId is undefined', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    const getSessionSpy = jest.spyOn(container.sessionService, 'getSession');

    const queryClient = newQueryClient();
    const { result } = await renderHook(
      () => useSessionDetail(container.sessionService, undefined),
      { wrapper: makeWrapper(container, queryClient) },
    );

    expect(result.current.isPending).toBe(true);
    expect(getSessionSpy).not.toHaveBeenCalled();

    queryClient.clear();
    queryClient.unmount();
  });
});

describe('useSessionHistoryList', () => {
  it('paginates via fetchNextPage rather than loading every session at once', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    // Three finished sessions, most recent last.
    await finishASession(container, START);
    await finishASession(container, START + 3_600_000);
    await finishASession(container, START + 7_200_000);

    const listHistorySpy = jest.spyOn(container.sessionService, 'listHistory');
    const queryClient = newQueryClient();
    const { result } = await renderHook(() => useSessionHistoryList(container.sessionService), {
      wrapper: makeWrapper(container, queryClient),
    });

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(result.current.data?.pages[0]).toHaveLength(3);
    expect(listHistorySpy).toHaveBeenCalledWith({ limit: 50, offset: 0 });
    // Fewer rows than the page size - no next page to fetch.
    expect(result.current.hasNextPage).toBe(false);

    queryClient.clear();
    queryClient.unmount();
  });
});

describe('useHistoricalSessionMutations', () => {
  it('updateSet against a completed session persists and recomputes totals', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const sessionId = await finishASession(container);
    const before = await container.sessionService.getSession(sessionId);
    const setId = before!.exercises[0]!.sets[0]!.id;

    const queryClient = newQueryClient();
    const { result } = await renderHook(
      () => useHistoricalSessionMutations(container.sessionService, queryClient, sessionId),
      { wrapper: makeWrapper(container, queryClient) },
    );

    await result.current.updateSet(setId, { weightKg: 100 });

    const after = await container.sessionService.getSession(sessionId);
    expect(after?.exercises[0]?.sets[0]?.weightKg).toBe(100);
    // Volume recomputed server-side: 1 set x 8 reps x 100kg = 800.
    expect(after?.totalVolumeKg).toBe(800);

    queryClient.clear();
    queryClient.unmount();
  });

  it('updateNotes writes session-level notes via updateHistoricalSession', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const sessionId = await finishASession(container);

    const queryClient = newQueryClient();
    const { result } = await renderHook(
      () => useHistoricalSessionMutations(container.sessionService, queryClient, sessionId),
      { wrapper: makeWrapper(container, queryClient) },
    );

    await result.current.updateNotes('Felt strong today');

    const after = await container.sessionService.getSession(sessionId);
    expect(after?.notes).toBe('Felt strong today');

    queryClient.clear();
    queryClient.unmount();
  });
});

describe('useDeleteSession', () => {
  it('hard-deletes the session and invalidates the history list/detail query keys', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const sessionId = await finishASession(container);

    const queryClient = newQueryClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(
      () => useDeleteSession(container.sessionService, queryClient, sessionId),
      { wrapper: makeWrapper(container, queryClient) },
    );

    const success = await result.current.deleteSession();

    expect(success).toBe(true);
    await waitFor(async () => {
      expect(await container.sessionService.getSession(sessionId)).toBeNull();
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: sessionHistoryKeys.detail(sessionId),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sessionHistoryKeys.list() });

    queryClient.clear();
    queryClient.unmount();
  });
});
