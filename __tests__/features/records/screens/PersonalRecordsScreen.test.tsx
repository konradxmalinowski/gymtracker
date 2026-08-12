import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import { PersonalRecordsScreen } from '@/features/records/screens/PersonalRecordsScreen';
import type { DatabaseContext } from '@/repositories/contracts/database';
import { ContainerProvider, createContainer, type AppContainer } from '@/services/container';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
}));

jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

const START = Date.UTC(2026, 7, 11, 12, 0, 0);

let activeQueryClient: QueryClient | undefined;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient?.unmount();
  activeQueryClient = undefined;
});

async function insertExercise(db: DatabaseContext, id: string, nameEn: string) {
  await db.run(
    `INSERT INTO exercise (id, source, name_en, name_search, tracking_type, created_at, updated_at)
     VALUES (?, 'catalog', ?, ?, 'weight_reps', ?, ?)`,
    [id, nameEn, nameEn.toLowerCase(), START, START],
  );
}

/** Completes one real working set for `exerciseId`, exercising the full completeSet -> evaluateAndUpsert path (the same real, no-mocks path `SqlitePersonalRecordRepository.test.ts` uses) so this screen renders genuine PR rows, not fixtures. */
async function logAWorkingSet(
  container: AppContainer,
  exerciseId: string,
  weightKg: number,
  reps: number,
) {
  const started = await container.sessionService.startEmpty(START);
  if (started.outcome !== 'started') {
    throw new Error('unreachable in a fresh test database');
  }
  const sessionExercise = await container.sessionService.addExercise(
    started.session.id,
    exerciseId,
  );
  const workoutSet = await container.sessionService.appendSet(sessionExercise.id, {
    weightKg,
    reps,
  });
  await container.sessionService.completeSet(workoutSet.id, { weightKg, reps });
  await container.sessionService.finish(started.session.id, START + 60_000);
}

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

  return render(<PersonalRecordsScreen />, { wrapper: Wrapper });
}

describe('PersonalRecordsScreen', () => {
  it('shows a genuine empty state for a user with no personal records yet', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);

    const { findByTestId } = await renderScreen(container);

    expect(await findByTestId('personal-records-empty-state')).toBeTruthy();
  });

  it('lists a real personal record earned by completing a working set', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db, 'ex-1', 'Bench Press');
    await logAWorkingSet(container, 'ex-1', 100, 5);

    const { findByTestId, findAllByText, findByText } = await renderScreen(container);

    await findByTestId('personal-records-list');
    // A single working set earns several record types at once (max weight,
    // max reps, weight-at-5-reps, max set volume, e1RM) - each gets its own
    // row, all sharing the same exercise name, so this asserts "at least
    // one", not "exactly one".
    expect((await findAllByText('Bench Press')).length).toBeGreaterThan(0);
    expect(await findByText('Max weight')).toBeTruthy();
    expect((await findAllByText('100 kg')).length).toBeGreaterThan(0);
  });
});
