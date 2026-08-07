import type {
  ActiveSessionAggregate,
  SessionExercise,
  WorkoutSet,
} from '@/features/workout-logging';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';

function makeExerciseListItem(id: string) {
  return {
    id,
    source: 'catalog' as const,
    catalogSlug: 'bench-press',
    nameEn: 'Bench Press',
    namePl: null,
    displayNameOverride: null,
    level: null,
    equipmentSlug: null,
    bodyPart: null,
    trackingType: 'weight_reps' as const,
    primaryImage: null,
    isFavorite: false,
  };
}

function makeSet(overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: 'set-1',
    sessionExerciseId: 'se-1',
    sessionId: 'session-1',
    exerciseId: 'ex-1',
    setIndex: 1,
    setType: 'normal',
    parentSetId: null,
    weightKg: 60,
    reps: 8,
    durationSeconds: null,
    distanceM: null,
    rpe: null,
    isCompleted: false,
    completedAt: null,
    performedAt: 1000,
    note: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeExercise(overrides: Partial<SessionExercise> = {}): SessionExercise {
  return {
    id: 'se-1',
    sessionId: 'session-1',
    exerciseId: 'ex-1',
    exerciseNameSnapshot: 'Bench Press',
    sortOrder: 0,
    supersetGroup: null,
    restSecondsOverride: null,
    note: null,
    createdAt: 1000,
    updatedAt: 1000,
    exercise: makeExerciseListItem('ex-1'),
    sets: [makeSet()],
    ...overrides,
  };
}

function makeSession(overrides: Partial<ActiveSessionAggregate> = {}): ActiveSessionAggregate {
  return {
    id: 'session-1',
    planId: null,
    planDayId: null,
    planNameSnapshot: null,
    planDayNameSnapshot: null,
    title: 'Quick Start',
    status: 'in_progress',
    startedAt: 1000,
    localDate: '2026-08-07',
    tzOffsetMinutes: 0,
    pausedMs: 0,
    notes: null,
    createdAt: 1000,
    updatedAt: 1000,
    exercises: [makeExercise()],
    activeState: {
      sessionId: 'session-1',
      focusedSessionExerciseId: null,
      timerDeadlineAt: null,
      timerTotalSeconds: null,
      timerNotificationId: null,
      pausedAt: null,
      scrollOffset: null,
      updatedAt: 1000,
    },
    ...overrides,
  };
}

afterEach(() => {
  useActiveWorkoutStore.getState().clear();
});

describe('activeWorkoutStore', () => {
  it('starts empty and hydrates via setSession/markHydrated', () => {
    expect(useActiveWorkoutStore.getState().session).toBeNull();
    expect(useActiveWorkoutStore.getState().isHydrated).toBe(false);

    const session = makeSession();
    useActiveWorkoutStore.getState().setSession(session);
    useActiveWorkoutStore.getState().markHydrated();

    expect(useActiveWorkoutStore.getState().session).toEqual(session);
    expect(useActiveWorkoutStore.getState().isHydrated).toBe(true);
  });

  it('clear() resets to the initial state (ADR-0008 rule 4)', () => {
    useActiveWorkoutStore.getState().setSession(makeSession());
    useActiveWorkoutStore.getState().markHydrated();
    useActiveWorkoutStore.getState().setFocusedSetId('set-1');

    useActiveWorkoutStore.getState().clear();

    expect(useActiveWorkoutStore.getState()).toMatchObject({
      session: null,
      isHydrated: false,
      focusedSetId: null,
      pendingWrites: 0,
    });
  });

  it('setSession is a full replace, not a merge - reconciliation from the database overwrites local state entirely', () => {
    useActiveWorkoutStore.getState().setSession(makeSession());
    useActiveWorkoutStore.getState().patchSet('set-1', { weightKg: 999 });
    expect(useActiveWorkoutStore.getState().session?.exercises[0]?.sets[0]?.weightKg).toBe(999);

    const canonical = makeSession();
    useActiveWorkoutStore.getState().setSession(canonical);
    expect(useActiveWorkoutStore.getState().session).toEqual(canonical);
  });

  it('patchSet shallow-merges onto the matching set across any exercise, leaving others untouched', () => {
    const session = makeSession({
      exercises: [
        makeExercise({ id: 'se-1', sets: [makeSet({ id: 'set-1', weightKg: 60 })] }),
        makeExercise({
          id: 'se-2',
          sortOrder: 1,
          sets: [makeSet({ id: 'set-2', sessionExerciseId: 'se-2', weightKg: 80 })],
        }),
      ],
    });
    useActiveWorkoutStore.getState().setSession(session);

    useActiveWorkoutStore.getState().patchSet('set-2', { weightKg: 82.5, isCompleted: true });

    const exercises = useActiveWorkoutStore.getState().session?.exercises ?? [];
    expect(exercises[0]?.sets[0]).toMatchObject({ id: 'set-1', weightKg: 60 });
    expect(exercises[1]?.sets[0]).toMatchObject({ id: 'set-2', weightKg: 82.5, isCompleted: true });
  });

  it('upsertSet inserts a new set into its owning exercise (located by sessionExerciseId) or replaces an existing one by id', () => {
    useActiveWorkoutStore.getState().setSession(makeSession());

    const appended = makeSet({ id: 'set-2', setIndex: 2 });
    useActiveWorkoutStore.getState().upsertSet(appended);
    expect(useActiveWorkoutStore.getState().session?.exercises[0]?.sets).toHaveLength(2);

    const replaced = makeSet({ id: 'set-2', setIndex: 2, weightKg: 100 });
    useActiveWorkoutStore.getState().upsertSet(replaced);
    const sets = useActiveWorkoutStore.getState().session?.exercises[0]?.sets ?? [];
    expect(sets).toHaveLength(2);
    expect(sets.find((set) => set.id === 'set-2')).toMatchObject({ weightKg: 100 });
  });

  it('removeSetLocally filters the set out of whichever exercise holds it', () => {
    useActiveWorkoutStore.getState().setSession(makeSession());
    useActiveWorkoutStore.getState().removeSetLocally('set-1');
    expect(useActiveWorkoutStore.getState().session?.exercises[0]?.sets).toHaveLength(0);
  });

  it('upsertExercise inserts a new exercise or replaces an existing one by id (undo-restore uses the same path)', () => {
    useActiveWorkoutStore.getState().setSession(makeSession());

    const removed = useActiveWorkoutStore.getState().session!.exercises[0]!;
    useActiveWorkoutStore.getState().removeExerciseLocally(removed.id);
    expect(useActiveWorkoutStore.getState().session?.exercises).toHaveLength(0);

    useActiveWorkoutStore.getState().upsertExercise(removed);
    expect(useActiveWorkoutStore.getState().session?.exercises).toEqual([removed]);
  });

  it('reorderExercisesLocally reorders in place without dropping any exercise not named in the list', () => {
    const session = makeSession({
      exercises: [
        makeExercise({ id: 'se-1' }),
        makeExercise({ id: 'se-2', sortOrder: 1 }),
        makeExercise({ id: 'se-3', sortOrder: 2 }),
      ],
    });
    useActiveWorkoutStore.getState().setSession(session);

    useActiveWorkoutStore.getState().reorderExercisesLocally(['se-3', 'se-1', 'se-2']);

    expect(useActiveWorkoutStore.getState().session?.exercises.map((e) => e.id)).toEqual([
      'se-3',
      'se-1',
      'se-2',
    ]);
  });

  it('patchExercise shallow-merges onto the named exercise, leaving others untouched (FR-16 exercise note)', () => {
    const session = makeSession({
      exercises: [
        makeExercise({ id: 'se-1', note: null }),
        makeExercise({ id: 'se-2', sortOrder: 1, note: null }),
      ],
    });
    useActiveWorkoutStore.getState().setSession(session);

    useActiveWorkoutStore.getState().patchExercise('se-2', { note: 'Elbows in' });

    const exercises = useActiveWorkoutStore.getState().session?.exercises ?? [];
    expect(exercises[0]).toMatchObject({ id: 'se-1', note: null });
    expect(exercises[1]).toMatchObject({ id: 'se-2', note: 'Elbows in' });
  });

  it('setSessionNotes replaces the root aggregate note (FR-16 workout note)', () => {
    useActiveWorkoutStore.getState().setSession(makeSession({ notes: null }));

    useActiveWorkoutStore.getState().setSessionNotes('Felt strong today');
    expect(useActiveWorkoutStore.getState().session?.notes).toBe('Felt strong today');

    useActiveWorkoutStore.getState().setSessionNotes(null);
    expect(useActiveWorkoutStore.getState().session?.notes).toBeNull();
  });

  it('setSupersetGroupLocally writes the group only onto the named exercises', () => {
    const session = makeSession({
      exercises: [makeExercise({ id: 'se-1' }), makeExercise({ id: 'se-2', sortOrder: 1 })],
    });
    useActiveWorkoutStore.getState().setSession(session);

    useActiveWorkoutStore.getState().setSupersetGroupLocally(['se-1', 'se-2'], 1);
    expect(useActiveWorkoutStore.getState().session?.exercises.map((e) => e.supersetGroup)).toEqual(
      [1, 1],
    );

    useActiveWorkoutStore.getState().setSupersetGroupLocally(['se-1'], null);
    expect(useActiveWorkoutStore.getState().session?.exercises.map((e) => e.supersetGroup)).toEqual(
      [null, 1],
    );
  });

  it('every mutator is a safe no-op when there is no active session', () => {
    expect(useActiveWorkoutStore.getState().session).toBeNull();
    useActiveWorkoutStore.getState().patchSet('missing', { weightKg: 1 });
    useActiveWorkoutStore.getState().removeSetLocally('missing');
    useActiveWorkoutStore.getState().upsertExercise(makeExercise());
    useActiveWorkoutStore.getState().patchExercise('missing', { note: 'x' });
    useActiveWorkoutStore.getState().setSessionNotes('x');
    expect(useActiveWorkoutStore.getState().session).toBeNull();
  });

  it('beginWrite/endWrite track a non-negative pending-write counter', () => {
    useActiveWorkoutStore.getState().beginWrite();
    useActiveWorkoutStore.getState().beginWrite();
    expect(useActiveWorkoutStore.getState().pendingWrites).toBe(2);

    useActiveWorkoutStore.getState().endWrite();
    useActiveWorkoutStore.getState().endWrite();
    useActiveWorkoutStore.getState().endWrite();
    expect(useActiveWorkoutStore.getState().pendingWrites).toBe(0);
  });
});
