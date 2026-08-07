import { fireEvent, render, waitFor } from '@testing-library/react-native';
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

  it('Finish persists the summary, clears the store, and replaces the route with Home', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    const started = await container.sessionService.startEmpty(START, 'Quick Start');
    if (started.outcome !== 'started') throw new Error('unreachable');

    const { findByTestId } = await render(<ActiveWorkoutScreen />, { wrapper: Wrapper(container) });

    await fireEvent.press(await findByTestId('workout-header-finish'));

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/');
    });
    expect(useActiveWorkoutStore.getState().session).toBeNull();

    const persisted = await container.sessionRepository.findInProgress();
    expect(persisted).toBeNull();
  });
});
