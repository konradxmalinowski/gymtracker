import { createTestDatabase } from '@/database/node/createTestDatabase';
import { SqliteWorkoutSessionRepository } from '@/features/workout-logging/repository/SqliteWorkoutSessionRepository';
import {
  DropSegmentSetTypeError,
  DropSetParentInvalidError,
  SessionAlreadyInProgressError,
  SessionNotInProgressError,
  SupersetSpansMultipleSessionsError,
} from '@/features/workout-logging/repository/errors';
import { RepositoryNotFoundError } from '@/repositories/base';
import type { DatabaseContext } from '@/repositories/contracts/database';
import { FixedClock } from '@/services/clock';
import { Uuid7IdGenerator } from '@/services/id';

const START = Date.UTC(2026, 7, 6, 18, 0, 0);
/** Matches `timer.defaultRestSeconds`'s own settings default - stands in for the value `WorkoutSessionService` would read and pass down in real usage. */
const DEFAULT_REST_SECONDS = 90;

function setup() {
  const db = createTestDatabase();
  const clock = new FixedClock(START);
  const idGenerator = new Uuid7IdGenerator(clock);
  const repo = new SqliteWorkoutSessionRepository({ db, clock, idGenerator });
  return { db, clock, idGenerator, repo };
}

/** Exercises are only ever referenced by this feature, never owned by it - inserted directly, the same way `SqlitePlanRepository.test.ts` does. */
async function insertExercise(
  db: DatabaseContext,
  id: string,
  nameEn = 'Bench Press',
  namePl: string | null = null,
): Promise<string> {
  await db.run(
    `INSERT INTO exercise (id, source, name_en, name_pl, name_search, tracking_type, created_at, updated_at)
     VALUES (?, 'catalog', ?, ?, ?, 'weight_reps', ?, ?)`,
    [id, nameEn, namePl, nameEn.toLowerCase(), START, START],
  );
  return id;
}

interface PlanDayFixture {
  planId: string;
  planDayId: string;
  exerciseIds: string[];
}

async function insertPlanDay(db: DatabaseContext, exerciseIds: string[]): Promise<PlanDayFixture> {
  await db.run(
    `INSERT INTO plan (id, name, is_active, sort_order, created_at, updated_at)
     VALUES ('plan-1', 'Push Pull Legs', 1, 0, ?, ?)`,
    [START, START],
  );
  await db.run(
    `INSERT INTO plan_day (id, plan_id, name, sort_order, created_at, updated_at)
     VALUES ('day-1', 'plan-1', 'Push A', 0, ?, ?)`,
    [START, START],
  );
  for (let index = 0; index < exerciseIds.length; index += 1) {
    await db.run(
      `INSERT INTO plan_day_exercise (id, plan_day_id, exercise_id, sort_order, rest_seconds,
                                      superset_group, note, created_at, updated_at)
       VALUES (?, 'day-1', ?, ?, ?, ?, ?, ?, ?)`,
      [
        `pde-${index}`,
        exerciseIds[index]!,
        index,
        90 + index,
        index < 2 ? 1 : null,
        index === 0 ? 'Slow eccentric' : null,
        START,
        START,
      ],
    );
  }
  return { planId: 'plan-1', planDayId: 'day-1', exerciseIds };
}

describe('SqliteWorkoutSessionRepository - starting a workout (ADR-0005)', () => {
  it('startEmpty writes a committed in_progress row plus its active_session_state row', async () => {
    const { db, repo } = setup();

    const session = await repo.startEmpty(START);

    expect(session.status).toBe('in_progress');
    expect(session.title).toBe('Quick Start');
    expect(session.planId).toBeNull();
    expect(session.exercises).toEqual([]);
    expect(session.startedAt).toBe(START);
    expect(session.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const stateRow = await db.selectOne<{ session_id: string }>(
      'SELECT session_id FROM active_session_state WHERE session_id = ?',
      [session.id],
    );
    expect(stateRow).not.toBeNull();
    expect(session.activeState.timerDeadlineAt).toBeNull();
  });

  it('startEmpty accepts a caller-supplied title', async () => {
    const { repo } = setup();
    const session = await repo.startEmpty(START, 'Evening session');
    expect(session.title).toBe('Evening session');
  });

  it('startFromPlanDay copies the day exercises with their order, superset groups and rest overrides', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1', 'Bench Press', 'Wyciskanie leżąc');
    await insertExercise(db, 'ex-2', 'Incline Press');
    await insertExercise(db, 'ex-3', 'Triceps Pushdown');
    const fixture = await insertPlanDay(db, ['ex-1', 'ex-2', 'ex-3']);

    const session = await repo.startFromPlanDay(fixture.planDayId, START, DEFAULT_REST_SECONDS);

    expect(session.planId).toBe('plan-1');
    expect(session.planDayId).toBe('day-1');
    expect(session.planNameSnapshot).toBe('Push Pull Legs');
    expect(session.planDayNameSnapshot).toBe('Push A');
    expect(session.title).toBe('Push A');
    expect(session.exercises.map((e) => e.exerciseId)).toEqual(['ex-1', 'ex-2', 'ex-3']);
    expect(session.exercises.map((e) => e.sortOrder)).toEqual([0, 1, 2]);
    expect(session.exercises.map((e) => e.supersetGroup)).toEqual([1, 1, null]);
    expect(session.exercises.map((e) => e.restSecondsOverride)).toEqual([90, 91, 92]);
    expect(session.exercises[0]!.note).toBe('Slow eccentric');
    // FR-04's display formatting is frozen into the snapshot at start time.
    expect(session.exercises[0]!.exerciseNameSnapshot).toBe('Bench Press (Wyciskanie leżąc)');
    expect(session.exercises[0]!.exercise.id).toBe('ex-1');
    expect(session.exercises[0]!.sets).toEqual([]);
  });

  it('startFromPlanDay throws RepositoryNotFoundError for a missing or deleted plan day', async () => {
    const { repo } = setup();
    await expect(repo.startFromPlanDay('nope', START, DEFAULT_REST_SECONDS)).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
  });

  it('rejects a second start with SessionAlreadyInProgressError naming the existing session, and writes nothing', async () => {
    const { db, repo } = setup();
    const first = await repo.startEmpty(START);

    const error = await repo.startEmpty(START + 1000).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SessionAlreadyInProgressError);
    expect((error as SessionAlreadyInProgressError).existingSessionId).toBe(first.id);

    const sessions = await db.select<{ id: string }>('SELECT id FROM workout_session');
    expect(sessions.map((s) => s.id)).toEqual([first.id]);
    const states = await db.select<{ session_id: string }>(
      'SELECT session_id FROM active_session_state',
    );
    expect(states).toHaveLength(1);
  });

  it('reports a soft-deleted in-progress row as the blocker, since the partial unique index ignores deleted_at', async () => {
    const { db, repo } = setup();
    const first = await repo.startEmpty(START);
    await db.run('UPDATE workout_session SET deleted_at = ? WHERE id = ?', [START, first.id]);

    expect(await repo.findInProgress()).toBeNull();
    const error = await repo.startEmpty(START + 1000).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SessionAlreadyInProgressError);
    expect((error as SessionAlreadyInProgressError).existingSessionId).toBe(first.id);
  });

  it('findInProgress returns null when nothing is running, and ignores completed sessions', async () => {
    const { repo } = setup();
    expect(await repo.findInProgress()).toBeNull();

    const session = await repo.startEmpty(START);
    await repo.finish(session.id, START + 60_000);

    expect(await repo.findInProgress()).toBeNull();
  });
});

describe('SqliteWorkoutSessionRepository - exercises', () => {
  it('addExercise appends by default and inserts at an index when asked, shifting the rest', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1', 'Bench Press');
    await insertExercise(db, 'ex-2', 'Row');
    await insertExercise(db, 'ex-3', 'Curl');
    const session = await repo.startEmpty(START);

    await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);
    await repo.addExercise(session.id, 'ex-2', DEFAULT_REST_SECONDS);
    const inserted = await repo.addExercise(session.id, 'ex-3', DEFAULT_REST_SECONDS, 0);

    expect(inserted.sortOrder).toBe(0);
    const reloaded = await repo.findInProgress();
    expect(reloaded!.exercises.map((e) => e.exerciseId)).toEqual(['ex-3', 'ex-1', 'ex-2']);
    expect(reloaded!.exercises.map((e) => e.sortOrder)).toEqual([0, 1, 2]);
  });

  it('addExercise throws for an unknown exercise and for a session that is not in progress', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1');
    const session = await repo.startEmpty(START);

    await expect(
      repo.addExercise(session.id, 'missing', DEFAULT_REST_SECONDS),
    ).rejects.toBeInstanceOf(RepositoryNotFoundError);

    await repo.finish(session.id, START + 1000);
    await expect(repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS)).rejects.toBeInstanceOf(
      SessionNotInProgressError,
    );
  });

  it('reorderExercises rewrites sort_order in the given order', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1');
    await insertExercise(db, 'ex-2', 'Row');
    const session = await repo.startEmpty(START);
    const a = await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);
    const b = await repo.addExercise(session.id, 'ex-2', DEFAULT_REST_SECONDS);

    await repo.reorderExercises(session.id, [b.id, a.id]);

    const reloaded = await repo.findInProgress();
    expect(reloaded!.exercises.map((e) => e.id)).toEqual([b.id, a.id]);
  });

  it('setSupersetGroup writes the group, and refuses ids spanning two sessions', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1');
    await insertExercise(db, 'ex-2', 'Row');
    const first = await repo.startEmpty(START);
    const a = await repo.addExercise(first.id, 'ex-1', DEFAULT_REST_SECONDS);
    const b = await repo.addExercise(first.id, 'ex-2', DEFAULT_REST_SECONDS);

    await repo.setSupersetGroup([a.id, b.id], 1);
    let reloaded = await repo.findInProgress();
    expect(reloaded!.exercises.map((e) => e.supersetGroup)).toEqual([1, 1]);

    await repo.setSupersetGroup([a.id], null);
    reloaded = await repo.findInProgress();
    expect(reloaded!.exercises.map((e) => e.supersetGroup)).toEqual([null, 1]);

    await repo.finish(first.id, START + 1000);
    const second = await repo.startEmpty(START + 2000);
    const c = await repo.addExercise(second.id, 'ex-1', DEFAULT_REST_SECONDS);

    await expect(repo.setSupersetGroup([a.id, c.id], 2)).rejects.toBeInstanceOf(
      SupersetSpansMultipleSessionsError,
    );
  });
});

describe('SqliteWorkoutSessionRepository - rest duration resolution (P7)', () => {
  async function insertExerciseUserData(
    db: DatabaseContext,
    exerciseId: string,
    defaultRestSeconds: number | null,
  ): Promise<void> {
    await db.run(
      `INSERT INTO exercise_user_data (exercise_id, default_rest_seconds, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
      [exerciseId, defaultRestSeconds, START, START],
    );
  }

  async function insertPlanDayWithNullRest(
    db: DatabaseContext,
    exerciseId: string,
  ): Promise<string> {
    await db.run(
      `INSERT INTO plan (id, name, is_active, sort_order, created_at, updated_at)
       VALUES ('plan-1', 'Push Pull Legs', 1, 0, ?, ?)`,
      [START, START],
    );
    await db.run(
      `INSERT INTO plan_day (id, plan_id, name, sort_order, created_at, updated_at)
       VALUES ('day-1', 'plan-1', 'Push A', 0, ?, ?)`,
      [START, START],
    );
    await db.run(
      `INSERT INTO plan_day_exercise (id, plan_day_id, exercise_id, sort_order, rest_seconds, created_at, updated_at)
       VALUES ('pde-0', 'day-1', ?, 0, NULL, ?, ?)`,
      [exerciseId, START, START],
    );
    return 'day-1';
  }

  it("startFromPlanDay prefers the exercise-level default over the plan day's own rest_seconds", async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1');
    await insertExerciseUserData(db, 'ex-1', 45);
    const fixture = await insertPlanDay(db, ['ex-1']);

    const session = await repo.startFromPlanDay(fixture.planDayId, START, DEFAULT_REST_SECONDS);

    expect(session.exercises[0]!.restSecondsOverride).toBe(45);
  });

  it('startFromPlanDay falls back to the global default when neither the exercise nor the plan day set one', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1');
    const planDayId = await insertPlanDayWithNullRest(db, 'ex-1');

    const session = await repo.startFromPlanDay(planDayId, START, DEFAULT_REST_SECONDS);

    expect(session.exercises[0]!.restSecondsOverride).toBe(DEFAULT_REST_SECONDS);
  });

  it('addExercise uses the exercise-level default when set', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1');
    await insertExerciseUserData(db, 'ex-1', 45);
    const session = await repo.startEmpty(START);

    const exercise = await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);

    expect(exercise.restSecondsOverride).toBe(45);
  });

  it('addExercise falls back to the global default when the exercise has no override (no plan day tier applies)', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1');
    const session = await repo.startEmpty(START);

    const exercise = await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);

    expect(exercise.restSecondsOverride).toBe(DEFAULT_REST_SECONDS);
  });
});

describe('SqliteWorkoutSessionRepository - appendSet pre-fill (FR-11)', () => {
  it('falls back to empty defaults when the exercise has never been performed', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1');
    const session = await repo.startEmpty(START);
    const exercise = await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);

    const set = await repo.appendSet(exercise.id, {});

    expect(set).toMatchObject({
      setIndex: 1,
      setType: 'normal',
      weightKg: null,
      reps: null,
      parentSetId: null,
      isCompleted: false,
    });
  });

  it('pre-fills from the previous set in this session, including its set type', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1');
    const session = await repo.startEmpty(START);
    const exercise = await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);

    const first = await repo.appendSet(exercise.id, { setType: 'warmup', weightKg: 40, reps: 12 });
    const second = await repo.appendSet(exercise.id, {});

    expect(second).toMatchObject({ setIndex: 2, setType: 'warmup', weightKg: 40, reps: 12 });
    expect(second.id).not.toBe(first.id);
  });

  it('pre-fills from the last completed working set of a previous completed session, resetting the type to normal', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1');

    const previous = await repo.startEmpty(START);
    const previousExercise = await repo.addExercise(previous.id, 'ex-1', DEFAULT_REST_SECONDS);
    const warmup = await repo.appendSet(previousExercise.id, {
      setType: 'warmup',
      weightKg: 40,
      reps: 12,
    });
    const working = await repo.appendSet(previousExercise.id, {
      setType: 'failure',
      weightKg: 102.5,
      reps: 6,
    });
    await repo.completeSet(warmup.id, {});
    await repo.completeSet(working.id, {});
    await repo.finish(previous.id, START + 3_600_000);

    const today = await repo.startEmpty(START + 86_400_000);
    const todayExercise = await repo.addExercise(today.id, 'ex-1', DEFAULT_REST_SECONDS);
    const set = await repo.appendSet(todayExercise.id, {});

    expect(set).toMatchObject({ setType: 'normal', weightKg: 102.5, reps: 6 });
  });

  it('ignores a previous session that was discarded, or whose sets were never completed', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1');

    const discarded = await repo.startEmpty(START);
    const discardedExercise = await repo.addExercise(discarded.id, 'ex-1', DEFAULT_REST_SECONDS);
    const set = await repo.appendSet(discardedExercise.id, { weightKg: 200, reps: 1 });
    await repo.completeSet(set.id, {});
    await repo.discard(discarded.id);

    const today = await repo.startEmpty(START + 86_400_000);
    const todayExercise = await repo.addExercise(today.id, 'ex-1', DEFAULT_REST_SECONDS);

    expect(await repo.appendSet(todayExercise.id, {})).toMatchObject({
      weightKg: null,
      reps: null,
    });
  });

  it('lets the seed override the pre-fill, including overriding back to null', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1');
    const session = await repo.startEmpty(START);
    const exercise = await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);
    await repo.appendSet(exercise.id, { weightKg: 100, reps: 5 });

    const overridden = await repo.appendSet(exercise.id, { weightKg: 105, reps: null, rpe: 8 });

    expect(overridden).toMatchObject({ weightKg: 105, reps: null, rpe: 8 });
  });
});

describe('SqliteWorkoutSessionRepository - drop sets (ADR-0006)', () => {
  async function withParentSet() {
    const { db, repo, clock } = setup();
    await insertExercise(db, 'ex-1');
    const session = await repo.startEmpty(START);
    const exercise = await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);
    const parentSet = await repo.appendSet(exercise.id, { weightKg: 100, reps: 8 });
    return { db, repo, clock, session, exercise, parentSet };
  }

  it('shares the parent set_index, points at the parent and is typed drop', async () => {
    const { repo, parentSet } = await withParentSet();

    const dropSet = await repo.addDropSet(parentSet.id, {});

    expect(dropSet).toMatchObject({
      setIndex: parentSet.setIndex,
      setType: 'drop',
      parentSetId: parentSet.id,
      weightKg: 100,
      reps: 8,
    });
  });

  it('does not advance set_index for the next real set', async () => {
    const { repo, exercise, parentSet } = await withParentSet();
    await repo.addDropSet(parentSet.id, { weightKg: 80, reps: 6 });

    const next = await repo.appendSet(exercise.id, {});

    expect(next.setIndex).toBe(2);
    // The pre-fill comes from the parent working set, not from the drop segment.
    expect(next).toMatchObject({ setType: 'normal', weightKg: 100, reps: 8 });
  });

  it('pre-fills a second drop from the tail of the chain', async () => {
    const { repo, parentSet, clock } = await withParentSet();
    await repo.addDropSet(parentSet.id, { weightKg: 80, reps: 6 });
    clock.advance(1000);

    const second = await repo.addDropSet(parentSet.id, {});

    expect(second).toMatchObject({ weightKg: 80, reps: 6, setType: 'drop' });
  });

  it('refuses to hang a drop off another drop', async () => {
    const { repo, parentSet } = await withParentSet();
    const dropSet = await repo.addDropSet(parentSet.id, {});

    await expect(repo.addDropSet(dropSet.id, {})).rejects.toBeInstanceOf(DropSetParentInvalidError);
  });

  it('refuses to change a drop segment away from set_type drop', async () => {
    const { repo, parentSet } = await withParentSet();
    const dropSet = await repo.addDropSet(parentSet.id, {});

    await expect(repo.updateSet(dropSet.id, { setType: 'normal' })).rejects.toBeInstanceOf(
      DropSegmentSetTypeError,
    );
    await expect(repo.updateSet(dropSet.id, { weightKg: 70 })).resolves.toMatchObject({
      weightKg: 70,
    });
  });

  it('orders each drop segment directly under its parent when the aggregate is loaded', async () => {
    const { repo, exercise, parentSet } = await withParentSet();
    const second = await repo.appendSet(exercise.id, {});
    const dropSet = await repo.addDropSet(parentSet.id, {});

    const reloaded = await repo.findInProgress();

    expect(reloaded!.exercises[0]!.sets.map((s) => s.id)).toEqual([
      parentSet.id,
      dropSet.id,
      second.id,
    ]);
  });
});

describe('SqliteWorkoutSessionRepository - completing sets', () => {
  it('marks the set completed, re-anchors performed_at and returns an empty newPRs (P8 owns records)', async () => {
    const { db, repo, clock } = setup();
    await insertExercise(db, 'ex-1');
    const session = await repo.startEmpty(START);
    const exercise = await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);
    const set = await repo.appendSet(exercise.id, { weightKg: 100, reps: 5 });
    clock.advance(30_000);

    const result = await repo.completeSet(set.id, { reps: 6, rpe: 9 });

    expect(result.newPRs).toEqual([]);
    expect(result.set).toMatchObject({
      isCompleted: true,
      reps: 6,
      rpe: 9,
      weightKg: 100,
      completedAt: START + 30_000,
      performedAt: START + 30_000,
    });
  });

  it('completes a pre-filled row with no values at all (the two-tap path)', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1');
    const session = await repo.startEmpty(START);
    const exercise = await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);
    const set = await repo.appendSet(exercise.id, { weightKg: 60, reps: 10 });

    const result = await repo.completeSet(set.id, {});

    expect(result.set).toMatchObject({ isCompleted: true, weightKg: 60, reps: 10 });
  });

  it('uncompleteSet clears completion but keeps the values entered', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1');
    const session = await repo.startEmpty(START);
    const exercise = await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);
    const set = await repo.appendSet(exercise.id, { weightKg: 100, reps: 5 });
    await repo.completeSet(set.id, {});

    const reverted = await repo.uncompleteSet(set.id);

    expect(reverted).toMatchObject({
      isCompleted: false,
      completedAt: null,
      weightKg: 100,
      reps: 5,
    });
  });

  it('touches active_session_state on every mutation so it never drifts from the session', async () => {
    const { db, repo, clock } = setup();
    await insertExercise(db, 'ex-1');
    const session = await repo.startEmpty(START);
    const before = await db.selectOne<{ updated_at: number }>(
      'SELECT updated_at FROM active_session_state WHERE session_id = ?',
      [session.id],
    );

    clock.advance(5000);
    const exercise = await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);
    clock.advance(5000);
    const set = await repo.appendSet(exercise.id, {});
    clock.advance(5000);
    await repo.completeSet(set.id, { reps: 5, weightKg: 60 });

    const after = await db.selectOne<{ updated_at: number }>(
      'SELECT updated_at FROM active_session_state WHERE session_id = ?',
      [session.id],
    );
    expect(after!.updated_at).toBe(START + 15_000);
    expect(after!.updated_at).toBeGreaterThan(before!.updated_at);
  });
});

describe('SqliteWorkoutSessionRepository - independent soft-delete lifecycles', () => {
  it('deleteSet/restoreSet restores the set with its original id', async () => {
    const { db, repo, clock } = setup();
    await insertExercise(db, 'ex-1');
    const session = await repo.startEmpty(START);
    const exercise = await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);
    const set = await repo.appendSet(exercise.id, { weightKg: 100, reps: 5 });

    clock.advance(1000);
    await repo.deleteSet(set.id);
    expect((await repo.findInProgress())!.exercises[0]!.sets).toEqual([]);

    clock.advance(1000);
    await repo.restoreSet(set.id);
    const restored = (await repo.findInProgress())!.exercises[0]!.sets;
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ id: set.id, weightKg: 100, reps: 5 });
  });

  it('deleting a parent set takes its drop segments with it, and restoring brings them back', async () => {
    const { db, repo, clock } = setup();
    await insertExercise(db, 'ex-1');
    const session = await repo.startEmpty(START);
    const exercise = await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);
    const parentSet = await repo.appendSet(exercise.id, { weightKg: 100, reps: 8 });
    const dropSet = await repo.addDropSet(parentSet.id, { weightKg: 80, reps: 6 });

    clock.advance(1000);
    await repo.deleteSet(parentSet.id);
    expect((await repo.findInProgress())!.exercises[0]!.sets).toEqual([]);

    clock.advance(1000);
    await repo.restoreSet(parentSet.id);
    expect((await repo.findInProgress())!.exercises[0]!.sets.map((s) => s.id)).toEqual([
      parentSet.id,
      dropSet.id,
    ]);
  });

  it('removeExercise hides the exercise and its sets; restoreExercise brings back exactly those', async () => {
    const { db, repo, clock } = setup();
    await insertExercise(db, 'ex-1');
    const session = await repo.startEmpty(START);
    const exercise = await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);
    const kept = await repo.appendSet(exercise.id, { weightKg: 100, reps: 5 });
    const deletedSeparately = await repo.appendSet(exercise.id, { weightKg: 100, reps: 5 });

    clock.advance(1000);
    await repo.deleteSet(deletedSeparately.id);

    clock.advance(1000);
    await repo.removeExercise(exercise.id);
    expect((await repo.findInProgress())!.exercises).toEqual([]);

    clock.advance(1000);
    await repo.restoreExercise(exercise.id);
    const reloaded = await repo.findInProgress();
    expect(reloaded!.exercises).toHaveLength(1);
    // The set the user deleted individually stays deleted - the two lifecycles are independent.
    expect(reloaded!.exercises[0]!.sets.map((s) => s.id)).toEqual([kept.id]);
  });

  it('soft-deleting is idempotent and a never-existing id still throws', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1');
    const session = await repo.startEmpty(START);
    const exercise = await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);
    const set = await repo.appendSet(exercise.id, {});

    await repo.deleteSet(set.id);
    await expect(repo.deleteSet(set.id)).resolves.toBeUndefined();
    await expect(repo.deleteSet('nope')).rejects.toBeInstanceOf(RepositoryNotFoundError);
    await expect(repo.restoreExercise('nope')).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });
});

describe('SqliteWorkoutSessionRepository - notes (FR-16)', () => {
  async function readSessionNotes(db: DatabaseContext, sessionId: string): Promise<string | null> {
    const row = await db.selectOne<{ notes: string | null }>(
      'SELECT notes FROM workout_session WHERE id = ?',
      [sessionId],
    );
    return row!.notes;
  }

  it('setExerciseNote writes, overwrites and clears the note, re-stamping the active state', async () => {
    const { db, repo, clock } = setup();
    await insertExercise(db, 'ex-1');
    const session = await repo.startEmpty(START);
    const exercise = await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);
    const stampBefore = (await repo.findInProgress())!.activeState.updatedAt;

    clock.advance(1000);
    await repo.setExerciseNote(exercise.id, 'Elbows tucked');
    let reloaded = await repo.findInProgress();
    expect(reloaded!.exercises[0]!.note).toBe('Elbows tucked');
    expect(reloaded!.activeState.updatedAt).toBeGreaterThan(stampBefore);

    await repo.setExerciseNote(exercise.id, 'Elbows flared, felt worse');
    reloaded = await repo.findInProgress();
    expect(reloaded!.exercises[0]!.note).toBe('Elbows flared, felt worse');

    await repo.setExerciseNote(exercise.id, null);
    reloaded = await repo.findInProgress();
    expect(reloaded!.exercises[0]!.note).toBeNull();
  });

  it('setExerciseNote clears a note copied from the plan day without touching the plan', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1');
    const fixture = await insertPlanDay(db, ['ex-1']);
    const session = await repo.startFromPlanDay(fixture.planDayId, START, DEFAULT_REST_SECONDS);
    expect(session.exercises[0]!.note).toBe('Slow eccentric');

    await repo.setExerciseNote(session.exercises[0]!.id, null);

    expect((await repo.findInProgress())!.exercises[0]!.note).toBeNull();
    const planRow = await db.selectOne<{ note: string | null }>(
      'SELECT note FROM plan_day_exercise WHERE id = ?',
      ['pde-0'],
    );
    expect(planRow!.note).toBe('Slow eccentric');
  });

  it('setExerciseNote throws for an unknown or removed session_exercise', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1');
    const session = await repo.startEmpty(START);
    const exercise = await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);

    await expect(repo.setExerciseNote('nope', 'x')).rejects.toBeInstanceOf(RepositoryNotFoundError);

    await repo.removeExercise(exercise.id);
    await expect(repo.setExerciseNote(exercise.id, 'x')).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
  });

  it('setSessionNotes writes and clears workout_session.notes', async () => {
    const { repo } = setup();
    const session = await repo.startEmpty(START);
    expect(session.notes).toBeNull();

    await repo.setSessionNotes(session.id, 'Low energy, cut it short');
    expect((await repo.findInProgress())!.notes).toBe('Low energy, cut it short');

    await repo.setSessionNotes(session.id, null);
    expect((await repo.findInProgress())!.notes).toBeNull();
  });

  it('setSessionNotes is allowed after the session is finished or discarded', async () => {
    const { db, repo } = setup();
    const finished = await repo.startEmpty(START);
    await repo.finish(finished.id, START + 1000);

    await repo.setSessionNotes(finished.id, 'Written on the summary screen');
    expect(await readSessionNotes(db, finished.id)).toBe('Written on the summary screen');

    const discarded = await repo.startEmpty(START + 2000);
    await repo.discard(discarded.id);

    await repo.setSessionNotes(discarded.id, 'Why I binned it');
    expect(await readSessionNotes(db, discarded.id)).toBe('Why I binned it');
  });

  it('setSessionNotes throws for an unknown or soft-deleted session', async () => {
    const { db, repo } = setup();
    const session = await repo.startEmpty(START);

    await expect(repo.setSessionNotes('nope', 'x')).rejects.toBeInstanceOf(RepositoryNotFoundError);

    await db.run('UPDATE workout_session SET deleted_at = ? WHERE id = ?', [START + 1, session.id]);
    await expect(repo.setSessionNotes(session.id, 'x')).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
  });
});

describe('SqliteWorkoutSessionRepository - active state', () => {
  it('saveActiveState upserts focus and scroll offset without touching the timer columns', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1');
    const session = await repo.startEmpty(START);
    const exercise = await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);

    await repo.saveActiveState({ sessionId: session.id, focusedSessionExerciseId: exercise.id });
    await repo.saveActiveState({ sessionId: session.id, scrollOffset: 420.5 });

    const state = (await repo.findInProgress())!.activeState;
    expect(state).toMatchObject({
      sessionId: session.id,
      focusedSessionExerciseId: exercise.id,
      scrollOffset: 420.5,
      timerDeadlineAt: null,
      timerTotalSeconds: null,
      timerNotificationId: null,
    });
  });

  // P7 (`plans/2026-08-08-p7-rest-timer.md`, pass 3): `saveActiveState`'s
  // timer columns and `setExerciseRestOverride` are this pass's own
  // extension of the P6/pass-2 `ActiveStatePatch`/repository contract - see
  // this pass's report for why that extension landed here rather than in
  // pass 2.
  it('saveActiveState upserts the timer columns independently of focus/scroll', async () => {
    const { repo } = setup();
    const session = await repo.startEmpty(START);

    await repo.saveActiveState({
      sessionId: session.id,
      timerDeadlineAt: START + 90_000,
      timerTotalSeconds: 90,
      timerNotificationId: 'notif-1',
    });

    expect((await repo.findInProgress())!.activeState).toMatchObject({
      timerDeadlineAt: START + 90_000,
      timerTotalSeconds: 90,
      timerNotificationId: 'notif-1',
    });

    // Clearing is a real write too (`undefined` vs `null` matters - only
    // fields actually present on the patch are touched, per the method's
    // own contract; explicit `null` clears).
    await repo.saveActiveState({
      sessionId: session.id,
      timerDeadlineAt: null,
      timerTotalSeconds: null,
      timerNotificationId: null,
    });

    expect((await repo.findInProgress())!.activeState).toMatchObject({
      timerDeadlineAt: null,
      timerTotalSeconds: null,
      timerNotificationId: null,
    });
  });

  it('setExerciseRestOverride writes rest_seconds_override and re-stamps the active state', async () => {
    const { db, repo, clock } = setup();
    await insertExercise(db, 'ex-1');
    const session = await repo.startEmpty(START);
    const exercise = await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);
    const stampBefore = (await repo.findInProgress())!.activeState.updatedAt;

    clock.advance(1000);
    await repo.setExerciseRestOverride(exercise.id, 120);

    const reloaded = await repo.findInProgress();
    expect(reloaded!.exercises[0]!.restSecondsOverride).toBe(120);
    expect(reloaded!.activeState.updatedAt).toBeGreaterThan(stampBefore);
  });

  it('setExerciseRestOverride throws for an unknown or removed session_exercise', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1');
    const session = await repo.startEmpty(START);
    const exercise = await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);

    await expect(repo.setExerciseRestOverride('nope', 60)).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );

    await repo.removeExercise(exercise.id);
    await expect(repo.setExerciseRestOverride(exercise.id, 60)).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
  });
});

describe('SqliteWorkoutSessionRepository - finishing and discarding', () => {
  it('finish denormalizes the totals, clears the active state and refuses a second call', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1');
    const session = await repo.startEmpty(START);
    const exercise = await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);
    const warmup = await repo.appendSet(exercise.id, { setType: 'warmup', weightKg: 40, reps: 10 });
    const working = await repo.appendSet(exercise.id, {
      setType: 'normal',
      weightKg: 100,
      reps: 5,
    });
    const dropSet = await repo.addDropSet(working.id, { weightKg: 80, reps: 4 });
    const unfinished = await repo.appendSet(exercise.id, { weightKg: 100, reps: 5 });
    await repo.completeSet(warmup.id, {});
    await repo.completeSet(working.id, {});
    await repo.completeSet(dropSet.id, {});
    void unfinished;

    const summary = await repo.finish(session.id, START + 45 * 60_000);

    expect(summary).toMatchObject({
      sessionId: session.id,
      durationSeconds: 45 * 60,
      // 100x5 + 80x4; the warm-up contributes nothing.
      totalVolumeKg: 820,
      // The warm-up and the drop segment do not count as sets (ADR-0006).
      totalSets: 1,
      totalReps: 19,
    });

    const row = await db.selectOne<{
      status: string;
      finished_at: number;
      duration_seconds: number;
      total_volume_kg: number;
      total_sets: number;
      total_reps: number;
    }>('SELECT * FROM workout_session WHERE id = ?', [session.id]);
    expect(row).toMatchObject({
      status: 'completed',
      finished_at: START + 45 * 60_000,
      duration_seconds: 45 * 60,
      total_volume_kg: 820,
      total_sets: 1,
      total_reps: 19,
    });

    const state = await db.selectOne('SELECT * FROM active_session_state WHERE session_id = ?', [
      session.id,
    ]);
    expect(state).toBeNull();

    await expect(repo.finish(session.id, START + 50 * 60_000)).rejects.toBeInstanceOf(
      SessionNotInProgressError,
    );
  });

  it('finish totals equal what v_session_summary computes for volume and reps', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1');
    const session = await repo.startEmpty(START);
    const exercise = await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);
    for (const values of [
      { setType: 'warmup' as const, weightKg: 40, reps: 12 },
      { setType: 'normal' as const, weightKg: 100, reps: 5 },
      { setType: 'assisted' as const, weightKg: 20, reps: 8 },
      { setType: 'failure' as const, weightKg: 95, reps: 3 },
    ]) {
      const set = await repo.appendSet(exercise.id, values);
      await repo.completeSet(set.id, {});
    }

    const summary = await repo.finish(session.id, START + 60_000);
    const view = await db.selectOne<{ total_volume_kg: number; total_reps: number }>(
      'SELECT total_volume_kg, total_reps FROM v_session_summary WHERE id = ?',
      [session.id],
    );

    expect(summary.totalVolumeKg).toBe(view!.total_volume_kg);
    expect(summary.totalReps).toBe(view!.total_reps);
  });

  it('finish ignores the sets of an exercise the user removed mid-workout', async () => {
    const { db, repo, clock } = setup();
    await insertExercise(db, 'ex-1');
    await insertExercise(db, 'ex-2', 'Row');
    const session = await repo.startEmpty(START);
    const kept = await repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);
    const removed = await repo.addExercise(session.id, 'ex-2', DEFAULT_REST_SECONDS);
    const keptSet = await repo.appendSet(kept.id, { weightKg: 100, reps: 5 });
    const removedSet = await repo.appendSet(removed.id, { weightKg: 50, reps: 10 });
    await repo.completeSet(keptSet.id, {});
    await repo.completeSet(removedSet.id, {});
    clock.advance(1000);
    await repo.removeExercise(removed.id);

    const summary = await repo.finish(session.id, START + 60_000);

    expect(summary.totalVolumeKg).toBe(500);
    expect(summary.totalSets).toBe(1);
  });

  it('discard leaves the row recoverable rather than deleting it, and frees the single-in-progress slot', async () => {
    const { db, repo } = setup();
    const session = await repo.startEmpty(START);

    await repo.discard(session.id);

    const row = await db.selectOne<{ status: string; deleted_at: number | null }>(
      'SELECT status, deleted_at FROM workout_session WHERE id = ?',
      [session.id],
    );
    expect(row).toMatchObject({ status: 'discarded', deleted_at: null });
    expect(await repo.findInProgress()).toBeNull();
    await expect(repo.discard(session.id)).rejects.toBeInstanceOf(SessionNotInProgressError);

    await expect(repo.startEmpty(START + 1000)).resolves.toMatchObject({ status: 'in_progress' });
  });
});

describe('SqliteWorkoutSessionRepository - crash recovery (FR-19 / ADR-0005)', () => {
  it('a fresh repository over the same database rebuilds the whole aggregate after several completed sets', async () => {
    const { db, clock, idGenerator, repo } = setup();
    await insertExercise(db, 'ex-1', 'Bench Press');
    await insertExercise(db, 'ex-2', 'Row');
    const fixture = await insertPlanDay(db, ['ex-1', 'ex-2']);

    const session = await repo.startFromPlanDay(fixture.planDayId, START, DEFAULT_REST_SECONDS);
    const [benchPress, row] = session.exercises;

    const logged: { id: string; weightKg: number; reps: number }[] = [];
    for (const values of [
      { weightKg: 60, reps: 10 },
      { weightKg: 80, reps: 8 },
      { weightKg: 100, reps: 5 },
    ]) {
      clock.advance(60_000);
      const set = await repo.appendSet(benchPress!.id, values);
      await repo.completeSet(set.id, {});
      logged.push({ id: set.id, ...values });
    }
    clock.advance(60_000);
    const rowSet = await repo.appendSet(row!.id, { weightKg: 70, reps: 12 });
    await repo.completeSet(rowSet.id, {});
    await repo.saveActiveState({ sessionId: session.id, focusedSessionExerciseId: row!.id });

    // The process dies here. Nothing is flushed, closed or serialized - every
    // write above was its own committed transaction (ADR-0005 mechanism 1).
    const recovered = await new SqliteWorkoutSessionRepository({
      db,
      clock,
      idGenerator,
    }).findInProgress();

    expect(recovered).not.toBeNull();
    expect(recovered!.id).toBe(session.id);
    expect(recovered!.status).toBe('in_progress');
    expect(recovered!.startedAt).toBe(START);
    expect(recovered!.planDayNameSnapshot).toBe('Push A');
    expect(recovered!.exercises).toHaveLength(2);

    const recoveredSets = recovered!.exercises[0]!.sets;
    expect(recoveredSets).toHaveLength(3);
    expect(recoveredSets.map((s) => ({ id: s.id, weightKg: s.weightKg, reps: s.reps }))).toEqual(
      logged,
    );
    expect(recoveredSets.every((s) => s.isCompleted)).toBe(true);
    expect(recoveredSets.map((s) => s.setIndex)).toEqual([1, 2, 3]);
    expect(recovered!.exercises[1]!.sets.map((s) => s.id)).toContain(rowSet.id);
    expect(recovered!.activeState.focusedSessionExerciseId).toBe(row!.id);
  });
});
