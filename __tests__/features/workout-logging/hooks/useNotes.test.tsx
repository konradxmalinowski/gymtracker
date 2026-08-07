import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import type { DatabaseContext } from '@/repositories/contracts/database';
import { useSetExerciseNote, useSetSessionNotes } from '@/features/workout-logging/hooks/useNotes';
import { ContainerProvider, createContainer, type AppContainer } from '@/services/container';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { useToastStore } from '@/stores/toastStore';

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
    throw new Error('unreachable - no prior session exists in a fresh test database');
  }
  const sessionExercise = await container.sessionService.addExercise(started.session.id, 'ex-1');

  const snapshot = await container.sessionService.findInProgress();
  useActiveWorkoutStore.getState().setSession(snapshot!.session);
  useActiveWorkoutStore.getState().markHydrated();

  return { container, sessionId: started.session.id, sessionExerciseId: sessionExercise.id };
}

function wrapper(container: AppContainer) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <ContainerProvider container={container}>{children}</ContainerProvider>;
  };
}

afterEach(() => {
  useActiveWorkoutStore.getState().clear();
  useToastStore.setState({ current: null });
  jest.restoreAllMocks();
});

describe('useSetExerciseNote', () => {
  it('await-then-commit: persists first, then reflects the note back through the store (not the optimistic-first hot-path shape)', async () => {
    const { container, sessionExerciseId } = await setup();
    const { result } = await renderHook(() => useSetExerciseNote(), {
      wrapper: wrapper(container),
    });

    await act(async () => {
      await result.current(sessionExerciseId, 'Go slow on the eccentric');
    });

    expect(useActiveWorkoutStore.getState().session?.exercises[0]?.note).toBe(
      'Go slow on the eccentric',
    );

    const persisted = await container.sessionRepository.findInProgress();
    expect(persisted?.exercises[0]?.note).toBe('Go slow on the eccentric');
  });

  it('clears the note with null', async () => {
    const { container, sessionExerciseId } = await setup();
    const { result } = await renderHook(() => useSetExerciseNote(), {
      wrapper: wrapper(container),
    });

    await act(async () => {
      await result.current(sessionExerciseId, 'temporary');
    });
    await act(async () => {
      await result.current(sessionExerciseId, null);
    });

    expect(useActiveWorkoutStore.getState().session?.exercises[0]?.note).toBeNull();
  });

  it('reconciles from the database and shows a toast when the write fails', async () => {
    const { container, sessionExerciseId } = await setup();
    jest
      .spyOn(container.sessionService, 'setExerciseNote')
      .mockRejectedValueOnce(new Error('boom'));
    const { result } = await renderHook(() => useSetExerciseNote(), {
      wrapper: wrapper(container),
    });

    await act(async () => {
      await result.current(sessionExerciseId, 'this write fails');
    });

    await waitFor(() => {
      expect(useToastStore.getState().current).not.toBeNull();
    });
    // The mocked write never committed - the store reconciles back to null,
    // not the value the failed call attempted to set.
    expect(useActiveWorkoutStore.getState().session?.exercises[0]?.note).toBeNull();
  });
});

describe('useSetSessionNotes', () => {
  it('await-then-commit: persists first, then reflects the workout-level note back through the store', async () => {
    const { container, sessionId } = await setup();
    const { result } = await renderHook(() => useSetSessionNotes(), {
      wrapper: wrapper(container),
    });

    await act(async () => {
      await result.current(sessionId, 'Deload week');
    });

    expect(useActiveWorkoutStore.getState().session?.notes).toBe('Deload week');

    const persisted = await container.sessionRepository.findInProgress();
    expect(persisted?.notes).toBe('Deload week');
  });

  it('works after the session is no longer in progress (not gated on status, per the service contract) and does not error', async () => {
    const { container, sessionId } = await setup();
    await container.sessionService.finish(sessionId);

    const { result } = await renderHook(() => useSetSessionNotes(), {
      wrapper: wrapper(container),
    });

    // `setSessionNotes` deliberately isn't restricted to in-progress
    // sessions on the service side (see the hook's own file header), and
    // this hook doesn't gate on status either - the write must resolve
    // without throwing and without surfacing a toast, exactly as it would
    // for a still-in-progress session. `WorkoutSessionRepository` has no
    // "read a finished session back" method yet (that's P9 scope), so this
    // can't assert the persisted row directly - only that the call
    // succeeded silently.
    await act(async () => {
      await result.current(sessionId, 'Great session overall');
    });

    expect(useToastStore.getState().current).toBeNull();
  });
});
