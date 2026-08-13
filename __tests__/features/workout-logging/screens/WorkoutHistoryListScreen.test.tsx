import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import type { DatabaseContext } from '@/repositories/contracts/database';
import { WorkoutHistoryListScreen } from '@/features/workout-logging/screens/WorkoutHistoryListScreen';
import { ContainerProvider, createContainer, type AppContainer } from '@/services/container';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn(), replace: jest.fn() },
}));

jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

const START = Date.UTC(2026, 7, 6, 18, 0, 0);

async function insertExercise(db: DatabaseContext, id = 'ex-1'): Promise<string> {
  await db.run(
    `INSERT INTO exercise (id, source, name_en, name_search, tracking_type, created_at, updated_at)
     VALUES (?, 'catalog', 'Bench Press', 'bench press', 'weight_reps', ?, ?)`,
    [id, START, START],
  );
  return id;
}

async function finishASession(container: AppContainer, startedAt: number, title: string) {
  const started = await container.sessionService.startEmpty(startedAt, title);
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

let activeQueryClient: QueryClient | undefined;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient?.unmount();
  activeQueryClient = undefined;
  jest.clearAllMocks();
});

async function renderScreen(container: AppContainer) {
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

  return render(<WorkoutHistoryListScreen />, { wrapper: Wrapper });
}

describe('WorkoutHistoryListScreen', () => {
  it('shows a genuine empty state for a user with no finished workouts yet', async () => {
    const container = createContainer(createTestDatabase());

    const { findByTestId } = await renderScreen(container);

    expect(await findByTestId('workout-history-empty-state')).toBeTruthy();
  });

  it('lists finished sessions grouped by month, most recent first', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    await finishASession(container, Date.UTC(2026, 6, 20, 12, 0, 0), 'July Session');
    await finishASession(container, Date.UTC(2026, 7, 5, 12, 0, 0), 'August Session');

    const { findByTestId, findByText } = await renderScreen(container);

    await findByTestId('workout-history-list');
    expect(await findByText('August Session')).toBeTruthy();
    expect(await findByText('July Session')).toBeTruthy();
    expect(await findByText('August 2026')).toBeTruthy();
    expect(await findByText('July 2026')).toBeTruthy();
  });

  it('navigates to the session detail route when a row is pressed', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const sessionId = await finishASession(container, START, 'Push Day');

    const { findByTestId } = await renderScreen(container);
    await fireEvent.press(await findByTestId(`workout-history-row-${sessionId}`));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/history/[sessionId]',
      params: { sessionId },
    });
  });

  it('shows an error state with retry when the history query fails', async () => {
    const container = createContainer(createTestDatabase());
    jest.spyOn(container.sessionService, 'listHistory').mockRejectedValue(new Error('boom'));

    const { findByText } = await renderScreen(container);

    expect(await findByText('Could not load your workout history.')).toBeTruthy();
  });

  it('fetches a second page on end-reached rather than loading everything up front', async () => {
    // A real 50-plus-session fixture would exercise the same path but is
    // expensive to build per-test; `listHistory` itself already has direct
    // repository-level pagination coverage (Pass 2's own tests plus the
    // ADR-0014 benchmark), so this stubs a full first page to exercise only
    // what this screen owns: firing `fetchNextPage` from `onEndReached`
    // exactly when `hasNextPage` says there's more to fetch.
    function fakePage(count: number, offset: number) {
      return Array.from({ length: count }, (_, index) => ({
        id: `session-${offset + index}`,
        title: `Session ${offset + index}`,
        localDate: '2026-08-06',
        startedAt: START,
        finishedAt: START + 60_000,
        durationSeconds: 60,
        totalVolumeKg: 480,
        totalSets: 1,
        totalReps: 8,
        estimatedKcal: null,
        planNameSnapshot: null,
        planDayNameSnapshot: null,
      }));
    }

    const container = createContainer(createTestDatabase());
    const listHistorySpy = jest
      .spyOn(container.sessionService, 'listHistory')
      .mockResolvedValueOnce(fakePage(50, 0))
      .mockResolvedValueOnce(fakePage(5, 50));

    const { findByTestId, findAllByText } = await renderScreen(container);
    const list = await findByTestId('workout-history-list');

    // FlashList's own `onEndReached` can already fire once during initial
    // layout in this synthetic test renderer (no real viewport/scroll
    // metrics to judge "near the end" by), so this doesn't assert an exact
    // call count before firing a second explicit event - only that the
    // second page (`offset: 50`) is genuinely requested through the same
    // `onEndReached` -> `fetchNextPage` wiring, never a bigger unbounded
    // read.
    fireEvent(list, 'endReached');

    await waitFor(() => {
      expect(listHistorySpy).toHaveBeenCalledWith({ limit: 50, offset: 50 });
    });
    expect(listHistorySpy).not.toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));

    // Both fake pages share the same `localDate` ('2026-08-06'), so the
    // month header the first page already rendered must not be duplicated
    // once the second, later-fetched page's sessions are grouped in -
    // `groupSessionHistoryByMonth` runs over `data.pages.flat()` on every
    // render (see that function's own doc comment), not per page, which is
    // exactly what this proves through the real screen/FlashList, not just
    // the pure grouping function in isolation.
    await waitFor(async () => {
      expect(await findAllByText('August 2026')).toHaveLength(1);
    });
  });
});
