import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import type { DatabaseContext } from '@/repositories/contracts/database';
import {
  useCompleteSet,
  useDeleteSet,
  useUpdateSet,
} from '@/features/workout-logging/hooks/useSetMutations';
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
  const workoutSet = await container.sessionService.appendSet(sessionExercise.id, {
    weightKg: 60,
    reps: 8,
  });

  const snapshot = await container.sessionService.findInProgress();
  useActiveWorkoutStore.getState().setSession(snapshot!.session);
  useActiveWorkoutStore.getState().markHydrated();

  return { container, workoutSet };
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

describe('useCompleteSet', () => {
  it('marks the set completed in the store synchronously (ARCHITECTURE.md section 5.1) and persists it', async () => {
    const { container, workoutSet } = await setup();
    const { result } = await renderHook(() => useCompleteSet(), { wrapper: wrapper(container) });

    result.current(workoutSet);

    // Synchronous optimistic update - no `waitFor` needed for the store half.
    const patched = useActiveWorkoutStore.getState().session?.exercises[0]?.sets[0];
    expect(patched?.isCompleted).toBe(true);

    await waitFor(async () => {
      const persisted = await container.sessionRepository.findInProgress();
      expect(persisted?.exercises[0]?.sets[0]?.isCompleted).toBe(true);
    });
  });

  it('reconciles the store from the database and shows a toast when the write fails (ADR-0008 rule 3)', async () => {
    const { container, workoutSet } = await setup();
    jest.spyOn(container.sessionService, 'completeSet').mockRejectedValueOnce(new Error('boom'));
    const { result } = await renderHook(() => useCompleteSet(), { wrapper: wrapper(container) });

    result.current(workoutSet);

    await waitFor(() => {
      expect(useToastStore.getState().current).not.toBeNull();
    });

    // Reconciled from the database - the mocked write never committed, so
    // the set is back to incomplete, matching what SQLite actually holds.
    const reconciled = useActiveWorkoutStore.getState().session?.exercises[0]?.sets[0];
    expect(reconciled?.isCompleted).toBe(false);
  });

  it('P8: writes newly-earned PRs to activeWorkoutStore.latestPR once the write settles', async () => {
    const { container, workoutSet } = await setup();
    const { result } = await renderHook(() => useCompleteSet(), { wrapper: wrapper(container) });

    // A fresh exercise's first-ever completed set trivially beats every
    // record type it's eligible for (ADR-0015 Decision 3) - the hot path
    // itself never sets `latestPR` (it's not part of the synchronous patch),
    // only the async continuation once `completeSet()` resolves.
    expect(useActiveWorkoutStore.getState().latestPR).toBeNull();

    result.current(workoutSet, { weightKg: 60, reps: 8 });

    await waitFor(() => {
      expect(useActiveWorkoutStore.getState().latestPR).not.toBeNull();
    });

    const latestPR = useActiveWorkoutStore.getState().latestPR;
    expect(latestPR?.setId).toBe(workoutSet.id);
    expect(latestPR?.records.length).toBeGreaterThan(0);
  });

  it('P8: does not touch latestPR when the completed set beats nothing new', async () => {
    const { container, workoutSet } = await setup();
    const completeSet = useCompleteSet;
    const { result: first } = await renderHook(() => completeSet(), {
      wrapper: wrapper(container),
    });
    first.current(workoutSet, { weightKg: 60, reps: 8 });
    await waitFor(() => {
      expect(useActiveWorkoutStore.getState().latestPR).not.toBeNull();
    });
    useActiveWorkoutStore.getState().clearLatestPR();

    // A second, lighter set for the same exercise beats nothing.
    const secondSet = await container.sessionService.appendSet(workoutSet.sessionExerciseId, {
      weightKg: 40,
      reps: 8,
    });
    const { result: second } = await renderHook(() => completeSet(), {
      wrapper: wrapper(container),
    });
    second.current(secondSet, { weightKg: 40, reps: 8 });

    await waitFor(async () => {
      const persisted = await container.sessionRepository.findInProgress();
      expect(persisted?.exercises[0]?.sets.find((s) => s.id === secondSet.id)?.isCompleted).toBe(
        true,
      );
    });
    expect(useActiveWorkoutStore.getState().latestPR).toBeNull();
  });
});

describe('useUpdateSet', () => {
  it('optimistically patches the store and persists the canonical row on success', async () => {
    const { container, workoutSet } = await setup();
    const { result } = await renderHook(() => useUpdateSet(), { wrapper: wrapper(container) });

    result.current(workoutSet.id, { weightKg: 82.5 });

    expect(useActiveWorkoutStore.getState().session?.exercises[0]?.sets[0]?.weightKg).toBe(82.5);

    await waitFor(async () => {
      const persisted = await container.sessionRepository.findInProgress();
      expect(persisted?.exercises[0]?.sets[0]?.weightKg).toBe(82.5);
    });
  });
});

describe('useDeleteSet', () => {
  it('removes the set optimistically and offers an undo that restores the same id', async () => {
    const { container, workoutSet } = await setup();
    const { result } = await renderHook(() => useDeleteSet(), { wrapper: wrapper(container) });

    result.current(workoutSet);

    expect(useActiveWorkoutStore.getState().session?.exercises[0]?.sets).toHaveLength(0);

    await waitFor(async () => {
      const persisted = await container.sessionRepository.findInProgress();
      expect(persisted?.exercises[0]?.sets).toHaveLength(0);
    });

    const toast = useToastStore.getState().current;
    expect(toast?.onAction).toBeDefined();
    toast?.onAction?.();

    expect(useActiveWorkoutStore.getState().session?.exercises[0]?.sets[0]?.id).toBe(workoutSet.id);

    await waitFor(async () => {
      const persisted = await container.sessionRepository.findInProgress();
      expect(persisted?.exercises[0]?.sets.map((set) => set.id)).toEqual([workoutSet.id]);
    });
  });
});
