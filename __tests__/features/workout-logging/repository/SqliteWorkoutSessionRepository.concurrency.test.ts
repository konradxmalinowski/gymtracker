import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDatabase } from '@/database/node/createTestDatabase';
import { createNodeDatabase, NodeSqlExecutor } from '@/database/node/NodeSqlExecutor';
import { parseSqlStatements } from '@/database/migrations/parseSql';
import { SqliteWorkoutSessionRepository } from '@/features/workout-logging/repository/SqliteWorkoutSessionRepository';
import {
  SessionAlreadyInProgressError,
  SessionNotInProgressError,
} from '@/features/workout-logging/repository/errors';
import { RepositoryNotFoundError } from '@/repositories/base';
import type { DatabaseContext } from '@/repositories/contracts/database';
import { FixedClock } from '@/services/clock';
import { Uuid7IdGenerator } from '@/services/id';

const START = Date.UTC(2026, 7, 6, 18, 0, 0);
const SCHEMA_PATH = join(__dirname, '..', '..', '..', '..', 'database', 'schema.sql');

function setup() {
  const db = createTestDatabase();
  const clock = new FixedClock(START);
  const idGenerator = new Uuid7IdGenerator(clock);
  const repo = new SqliteWorkoutSessionRepository({ db, clock, idGenerator });
  return { db, clock, idGenerator, repo };
}

async function insertExercise(db: DatabaseContext, id: string, nameEn = 'Bench Press') {
  await db.run(
    `INSERT INTO exercise (id, source, name_en, name_search, tracking_type, created_at, updated_at)
     VALUES (?, 'catalog', ?, ?, 'weight_reps', ?, ?)`,
    [id, nameEn, nameEn.toLowerCase(), START, START],
  );
}

async function insertPlanDay(db: DatabaseContext, exerciseIds: string[]): Promise<string> {
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
      `INSERT INTO plan_day_exercise (id, plan_day_id, exercise_id, sort_order, created_at, updated_at)
       VALUES (?, 'day-1', ?, ?, ?, ?)`,
      [`pde-${index}`, exerciseIds[index]!, index, START, START],
    );
  }
  return 'day-1';
}

function settledNames(results: PromiseSettledResult<unknown>[]): string[] {
  return results.map((result) =>
    result.status === 'fulfilled' ? 'fulfilled' : (result.reason as object).constructor.name,
  );
}

/**
 * Counts every row the start path can write, so a rejected start can be asserted
 * to have left *nothing* rather than only "no `workout_session` row". An orphaned
 * `session_exercise` pointing at a session that no longer exists, or a stray
 * `active_session_state`, would both pass a session-count-only assertion.
 */
async function countStartRows(db: DatabaseContext) {
  const [sessions, exercises, states] = await Promise.all([
    db.select<{ id: string }>('SELECT id FROM workout_session'),
    db.select<{ id: string; session_id: string }>('SELECT id, session_id FROM session_exercise'),
    db.select<{ session_id: string }>('SELECT session_id FROM active_session_state'),
  ]);
  return { sessions, exercises, states };
}

/**
 * The `ux_session_single_in_progress` partial unique index is enforced at two
 * layers: `assertNoSessionInProgress`'s pre-check, and `insertSession`'s
 * `isUniqueConstraintError` catch. A *sequential* second start only ever reaches
 * the pre-check, so these overlapping starts are what covers the catch - the
 * layer whose stated job is "a raw SQLite constraint message can never escape to
 * the service layer if two starts ever interleave".
 *
 * Scope note on what this harness does and does not model: `NodeSqlExecutor` and
 * `ExpoSqlExecutor` share the same nested-transaction contract (a `transaction()`
 * entered while one is already open joins it rather than opening a second), so
 * these overlapping calls exercise the interleaved check-then-insert ordering
 * faithfully. What they cannot model is expo-sqlite's `withExclusiveTransactionAsync`
 * queueing on a device. Both executors resolve the *first* caller as the winner
 * deterministically, which is why these assertions are stable rather than flaky.
 */
describe('SqliteWorkoutSessionRepository - overlapping starts (ux_session_single_in_progress)', () => {
  it('startEmpty against startEmpty: one wins, the loser is rejected and writes nothing', async () => {
    const { db, repo } = setup();

    const results = await Promise.allSettled([repo.startEmpty(START), repo.startEmpty(START)]);

    expect(settledNames(results)).toEqual(['fulfilled', 'SessionAlreadyInProgressError']);
    const winner = results[0] as PromiseFulfilledResult<{ id: string }>;
    const rejection = results[1] as PromiseRejectedResult;
    expect((rejection.reason as SessionAlreadyInProgressError).existingSessionId).toBe(
      winner.value.id,
    );

    const rows = await countStartRows(db);
    expect(rows.sessions.map((s) => s.id)).toEqual([winner.value.id]);
    expect(rows.states.map((s) => s.session_id)).toEqual([winner.value.id]);
    expect(rows.exercises).toEqual([]);
  });

  it('startFromPlanDay against startFromPlanDay: the loser leaves no orphaned session_exercise rows', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1');
    await insertExercise(db, 'ex-2', 'Row');
    const planDayId = await insertPlanDay(db, ['ex-1', 'ex-2']);

    const results = await Promise.allSettled([
      repo.startFromPlanDay(planDayId, START),
      repo.startFromPlanDay(planDayId, START),
    ]);

    expect(settledNames(results)).toEqual(['fulfilled', 'SessionAlreadyInProgressError']);
    const winner = (results[0] as PromiseFulfilledResult<{ id: string }>).value;

    const rows = await countStartRows(db);
    expect(rows.sessions.map((s) => s.id)).toEqual([winner.id]);
    expect(rows.states.map((s) => s.session_id)).toEqual([winner.id]);
    // Two exercises, both belonging to the winner - the rejected attempt copied none.
    expect(rows.exercises).toHaveLength(2);
    expect(rows.exercises.every((e) => e.session_id === winner.id)).toBe(true);
  });

  it('a plan-day start blocked by an existing session copies no exercises before rejecting', async () => {
    const { db, repo } = setup();
    await insertExercise(db, 'ex-1');
    await insertExercise(db, 'ex-2', 'Row');
    const planDayId = await insertPlanDay(db, ['ex-1', 'ex-2']);
    const existing = await repo.startEmpty(START);

    const error = await repo.startFromPlanDay(planDayId, START + 1000).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SessionAlreadyInProgressError);
    expect((error as SessionAlreadyInProgressError).existingSessionId).toBe(existing.id);
    const rows = await countStartRows(db);
    expect(rows.sessions.map((s) => s.id)).toEqual([existing.id]);
    expect(rows.exercises).toEqual([]);
    expect(rows.states.map((s) => s.session_id)).toEqual([existing.id]);
  });
});

/**
 * The "two tabs" case, in the only form a per-mutation-commit model can actually
 * produce it: one mutation commits, and the next one - dispatched from a screen
 * whose Zustand store still holds the pre-delete row - arrives afterwards. The
 * property that matters is that the late mutation fails cleanly rather than
 * resurrecting or half-writing a row that is already gone, which is what
 * `updateRowIn`'s `WHERE id = ? AND deleted_at IS NULL` guard buys.
 */
describe('SqliteWorkoutSessionRepository - mutations arriving after the row is gone', () => {
  async function withSet() {
    const context = setup();
    await insertExercise(context.db, 'ex-1');
    const session = await context.repo.startEmpty(START);
    const exercise = await context.repo.addExercise(session.id, 'ex-1');
    const set = await context.repo.appendSet(exercise.id, { weightKg: 100, reps: 5 });
    return { ...context, session, exercise, set };
  }

  it('completeSet on a set another writer already deleted throws instead of resurrecting it', async () => {
    const { db, repo, set } = await withSet();
    await repo.deleteSet(set.id);

    await expect(repo.completeSet(set.id, { reps: 8 })).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );

    const row = await db.selectOne<{ is_completed: number; reps: number; deleted_at: number }>(
      'SELECT is_completed, reps, deleted_at FROM workout_set WHERE id = ?',
      [set.id],
    );
    expect(row).toMatchObject({ is_completed: 0, reps: 5 });
    expect(row!.deleted_at).not.toBeNull();
  });

  it('updateSet and uncompleteSet on a deleted set throw rather than writing through', async () => {
    const { repo, set } = await withSet();
    await repo.completeSet(set.id, {});
    await repo.deleteSet(set.id);

    await expect(repo.updateSet(set.id, { weightKg: 999 })).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
    await expect(repo.uncompleteSet(set.id)).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it('appendSet and addDropSet against an exercise another writer removed throw', async () => {
    const { repo, exercise, set } = await withSet();
    await repo.removeExercise(exercise.id);

    await expect(repo.appendSet(exercise.id, {})).rejects.toBeInstanceOf(RepositoryNotFoundError);
    // removeExercise cascades to the sets, so the parent for a drop is gone too.
    await expect(repo.addDropSet(set.id, {})).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it('finish and discard on a session the other writer already closed throw SessionNotInProgressError', async () => {
    const { repo, session } = await withSet();
    await repo.discard(session.id);

    await expect(repo.finish(session.id, START + 60_000)).rejects.toBeInstanceOf(
      SessionNotInProgressError,
    );
    await expect(repo.discard(session.id)).rejects.toBeInstanceOf(SessionNotInProgressError);
  });
});

/**
 * FR-19 / ADR-0005's E2E flow 4, as close as a Node harness gets to it: the
 * existing `crash recovery` test reuses the same live `NodeSqlExecutor` (same
 * connection, same prepared-statement cache, and a `:memory:` database that
 * cannot outlive its connection at all), so it proves the aggregate re-reads
 * correctly but not that anything reached disk. These run against a file-backed
 * database and *close the connection* before reopening a brand-new executor and
 * repository over the same file - a real "the process died" boundary, and the
 * only place where `synchronous = FULL`'s per-commit durability is what the
 * assertion actually rests on.
 */
describe('SqliteWorkoutSessionRepository - crash recovery across a real connection restart (FR-19)', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'gymtracker-crash-'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function openFileDatabase(fresh: boolean): NodeSqlExecutor {
    const raw = createNodeDatabase(join(directory, 'workout.db'));
    raw.exec('PRAGMA foreign_keys = ON');
    if (fresh) {
      for (const statement of parseSqlStatements(readFileSync(SCHEMA_PATH, 'utf8'))) {
        raw.exec(statement);
      }
    }
    return new NodeSqlExecutor(raw);
  }

  it('rebuilds every field the workout screen hydrates from, including active_session_state', async () => {
    const clock = new FixedClock(START);
    const idGenerator = new Uuid7IdGenerator(clock);

    const beforeCrash = openFileDatabase(true);
    const repo = new SqliteWorkoutSessionRepository({ db: beforeCrash, clock, idGenerator });
    await insertExercise(beforeCrash, 'ex-1', 'Bench Press');
    await insertExercise(beforeCrash, 'ex-2', 'Row');
    await insertExercise(beforeCrash, 'ex-3', 'Curl');
    const planDayId = await insertPlanDay(beforeCrash, ['ex-1', 'ex-2', 'ex-3']);

    const session = await repo.startFromPlanDay(planDayId, START);
    const [bench, row, curl] = session.exercises;

    clock.advance(60_000);
    const workingSet = await repo.appendSet(bench!.id, { weightKg: 100, reps: 5 });
    await repo.completeSet(workingSet.id, {});
    const dropSegment = await repo.addDropSet(workingSet.id, { weightKg: 80, reps: 6 });
    await repo.completeSet(dropSegment.id, {});
    // Deliberately left incomplete: a set the user was mid-entry on when the
    // process died must come back with its typed values, not as an empty row.
    const inFlight = await repo.appendSet(bench!.id, { weightKg: 105, reps: null });

    await repo.setExerciseNote(bench!.id, 'Elbows tucked');
    await repo.setSessionNotes(session.id, 'Felt strong');
    await repo.setSupersetGroup([bench!.id, row!.id], 7);
    await repo.removeExercise(curl!.id);
    await repo.saveActiveState({
      sessionId: session.id,
      focusedSessionExerciseId: row!.id,
      scrollOffset: 1284.5,
    });

    // The process dies. Nothing is flushed or closed by the app - `close()` here
    // stands in for the OS reclaiming the process, and every write above was
    // already its own committed transaction (ADR-0005 mechanism 1).
    beforeCrash.close();

    const afterCrash = openFileDatabase(false);
    const recovered = await new SqliteWorkoutSessionRepository({
      db: afterCrash,
      clock,
      idGenerator,
    }).findInProgress();

    expect(recovered).not.toBeNull();
    expect(recovered).toMatchObject({
      id: session.id,
      status: 'in_progress',
      startedAt: START,
      planDayNameSnapshot: 'Push A',
      planNameSnapshot: 'Push Pull Legs',
      notes: 'Felt strong',
      localDate: session.localDate,
    });

    // Every `activeWorkoutStore`-relevant field of active_session_state, not just focus.
    expect(recovered!.activeState).toMatchObject({
      sessionId: session.id,
      focusedSessionExerciseId: row!.id,
      scrollOffset: 1284.5,
      timerDeadlineAt: null,
      timerTotalSeconds: null,
      timerNotificationId: null,
      pausedAt: null,
    });

    // The removed exercise stays removed across the restart.
    expect(recovered!.exercises.map((e) => e.id)).toEqual([bench!.id, row!.id]);
    expect(recovered!.exercises.map((e) => e.supersetGroup)).toEqual([7, 7]);
    expect(recovered!.exercises[0]!.note).toBe('Elbows tucked');
    expect(recovered!.exercises[0]!.exerciseNameSnapshot).toBe('Bench Press');

    const recoveredSets = recovered!.exercises[0]!.sets;
    expect(recoveredSets.map((s) => s.id)).toEqual([workingSet.id, dropSegment.id, inFlight.id]);
    expect(recoveredSets[0]).toMatchObject({ weightKg: 100, reps: 5, isCompleted: true });
    expect(recoveredSets[1]).toMatchObject({
      weightKg: 80,
      reps: 6,
      setType: 'drop',
      parentSetId: workingSet.id,
      setIndex: workingSet.setIndex,
      isCompleted: true,
    });
    expect(recoveredSets[2]).toMatchObject({
      weightKg: 105,
      reps: null,
      isCompleted: false,
      completedAt: null,
    });

    afterCrash.close();
  });

  it('a workout finished before the crash is not offered for recovery afterwards', async () => {
    const clock = new FixedClock(START);
    const idGenerator = new Uuid7IdGenerator(clock);

    const beforeCrash = openFileDatabase(true);
    const repo = new SqliteWorkoutSessionRepository({ db: beforeCrash, clock, idGenerator });
    await insertExercise(beforeCrash, 'ex-1');
    const session = await repo.startEmpty(START);
    const exercise = await repo.addExercise(session.id, 'ex-1');
    const set = await repo.appendSet(exercise.id, { weightKg: 100, reps: 5 });
    await repo.completeSet(set.id, {});
    await repo.finish(session.id, START + 60_000);
    beforeCrash.close();

    const afterCrash = openFileDatabase(false);
    const recovering = new SqliteWorkoutSessionRepository({ db: afterCrash, clock, idGenerator });

    expect(await recovering.findInProgress()).toBeNull();
    // The finished row and its denormalized totals survived the restart intact.
    const persisted = await afterCrash.selectOne<{ status: string; total_volume_kg: number }>(
      'SELECT status, total_volume_kg FROM workout_session WHERE id = ?',
      [session.id],
    );
    expect(persisted).toMatchObject({ status: 'completed', total_volume_kg: 500 });
    expect(await afterCrash.select('SELECT session_id FROM active_session_state')).toEqual([]);

    afterCrash.close();
  });
});
