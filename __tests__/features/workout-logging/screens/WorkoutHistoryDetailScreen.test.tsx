import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import { AccessibilityInfo } from 'react-native';
import type { ReactNode } from 'react';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import type { DatabaseContext } from '@/repositories/contracts/database';
import { WorkoutHistoryDetailScreen } from '@/features/workout-logging/screens/WorkoutHistoryDetailScreen';
import { ContainerProvider, createContainer, type AppContainer } from '@/services/container';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
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

async function finishASession(container: AppContainer) {
  const started = await container.sessionService.startEmpty(START, 'Push Day');
  if (started.outcome !== 'started') {
    throw new Error('unreachable - fresh test database');
  }
  const sessionExercise = await container.sessionService.addExercise(started.session.id, 'ex-1');
  const workoutSet = await container.sessionService.appendSet(sessionExercise.id, {
    weightKg: 60,
    reps: 8,
  });
  await container.sessionService.completeSet(workoutSet.id, { weightKg: 60, reps: 8 });
  await container.sessionService.finish(started.session.id, START + 60_000);
  return { sessionId: started.session.id, sessionExerciseId: sessionExercise.id };
}

async function finishASessionWithTwoExercises(container: AppContainer) {
  const started = await container.sessionService.startEmpty(START, 'Push Day');
  if (started.outcome !== 'started') {
    throw new Error('unreachable - fresh test database');
  }
  const firstExercise = await container.sessionService.addExercise(started.session.id, 'ex-1');
  const secondExercise = await container.sessionService.addExercise(started.session.id, 'ex-2');
  await container.sessionService.finish(started.session.id, START + 60_000);
  return {
    sessionId: started.session.id,
    firstExerciseId: firstExercise.id,
    secondExerciseId: secondExercise.id,
  };
}

let activeQueryClient: QueryClient | undefined;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient?.unmount();
  activeQueryClient = undefined;
  jest.clearAllMocks();
});

async function renderScreen(container: AppContainer, sessionId: string) {
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

  return render(<WorkoutHistoryDetailScreen sessionId={sessionId} />, { wrapper: Wrapper });
}

describe('WorkoutHistoryDetailScreen', () => {
  it('renders totals and a read-only set line by default (no edit controls)', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const { sessionId, sessionExerciseId } = await finishASession(container);

    const { findByTestId, findByText, queryByTestId } = await renderScreen(container, sessionId);

    await findByTestId('workout-history-detail-screen');
    expect(await findByText('60 kg x 8')).toBeTruthy();
    expect(queryByTestId(`workout-history-exercise-card-${sessionExerciseId}`)).toBeNull();
  });

  it('shows a not-found message when the session does not exist', async () => {
    const container = createContainer(createTestDatabase());

    const { findByText } = await renderScreen(container, 'does-not-exist');

    expect(await findByText('This workout could not be found.')).toBeTruthy();
  });

  it('the edit toggle switches into edit mode, rendering the editable SessionExerciseCard', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const { sessionId, sessionExerciseId } = await finishASession(container);

    const { findByTestId } = await renderScreen(container, sessionId);
    await fireEvent.press(await findByTestId('workout-history-detail-edit-toggle'));

    expect(await findByTestId(`workout-history-exercise-card-${sessionExerciseId}`)).toBeTruthy();
  });

  it('saves a notes edit on blur via updateHistoricalSession', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const { sessionId } = await finishASession(container);

    const { findByTestId } = await renderScreen(container, sessionId);
    await fireEvent.press(await findByTestId('workout-history-detail-edit-toggle'));

    const notesField = await findByTestId('workout-history-detail-notes-field');
    await fireEvent.changeText(notesField, 'Felt strong today');
    await fireEvent(notesField, 'blur');

    await waitFor(async () => {
      const session = await container.sessionService.getSession(sessionId);
      expect(session?.notes).toBe('Felt strong today');
    });
  });

  it('removing an exercise in edit mode persists the removal (with an undo toast available)', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const { sessionId, sessionExerciseId } = await finishASession(container);

    const { findByTestId } = await renderScreen(container, sessionId);
    await fireEvent.press(await findByTestId('workout-history-detail-edit-toggle'));

    const cardTestId = `workout-history-exercise-card-${sessionExerciseId}`;
    await fireEvent.press(await findByTestId(`${cardTestId}-header-remove`));

    await waitFor(async () => {
      const session = await container.sessionService.getSession(sessionId);
      expect(session?.exercises).toHaveLength(0);
    });
  });

  it('moving an exercise down in edit mode persists the new order via reorderExercises', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db, 'ex-1');
    await insertExercise(db, 'ex-2');
    const { sessionId, firstExerciseId, secondExerciseId } =
      await finishASessionWithTwoExercises(container);

    const { findByTestId } = await renderScreen(container, sessionId);
    await fireEvent.press(await findByTestId('workout-history-detail-edit-toggle'));

    const firstCardTestId = `workout-history-exercise-card-${firstExerciseId}`;
    await fireEvent.press(await findByTestId(`${firstCardTestId}-header-move-down`));

    await waitFor(async () => {
      const session = await container.sessionService.getSession(sessionId);
      expect(session?.exercises.map((exercise) => exercise.id)).toEqual([
        secondExerciseId,
        firstExerciseId,
      ]);
    });
  });

  it('deletes the workout after confirmation and navigates back', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const { sessionId } = await finishASession(container);

    const { findByTestId, findByText } = await renderScreen(container, sessionId);
    await fireEvent.press(await findByTestId('workout-history-detail-delete-button'));

    // Confirmation is required - the delete has not run yet.
    expect(await container.sessionService.getSession(sessionId)).not.toBeNull();

    await fireEvent.press(await findByText('Delete'));

    await waitFor(async () => {
      expect(await container.sessionService.getSession(sessionId)).toBeNull();
    });
    expect(router.back).toHaveBeenCalled();
  });

  it('announces "Loading" for screen readers while the session is still pending (A11Y-P9-002 regression)', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const { sessionId } = await finishASession(container);

    const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

    const { findByTestId } = await renderScreen(container, sessionId);
    await findByTestId('workout-history-detail-screen');

    expect(announceSpy).toHaveBeenCalledWith('Loading');
  });

  it('announces entering and leaving edit mode (A11Y-P9-003 regression)', async () => {
    // Regression test for A11Y-P9-003: toggling edit mode restructures every
    // exercise card with no signal beyond the toggle button's own label
    // change. See reports/accessibility-2026-08-13-p9.md for the original
    // finding.
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const { sessionId } = await finishASession(container);

    const { findByTestId } = await renderScreen(container, sessionId);
    const toggle = await findByTestId('workout-history-detail-edit-toggle');

    const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

    await fireEvent.press(toggle);
    expect(announceSpy).toHaveBeenLastCalledWith(
      'Edit mode on - you can now change sets, exercises and notes',
    );

    await fireEvent.press(toggle);
    expect(announceSpy).toHaveBeenLastCalledWith('Edit mode off');
  });
});
