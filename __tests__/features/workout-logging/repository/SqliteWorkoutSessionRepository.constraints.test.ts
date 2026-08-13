import { createTestDatabase } from '@/database/node/createTestDatabase';
import { SqliteWorkoutSessionRepository } from '@/features/workout-logging/repository/SqliteWorkoutSessionRepository';
import { SupersetSpansMultipleSessionsError } from '@/features/workout-logging/repository/errors';
import { SqlitePersonalRecordRepository } from '@/features/records/repository/SqlitePersonalRecordRepository';
import { RepositoryNotFoundError } from '@/repositories/base';
import type { DatabaseContext } from '@/repositories/contracts/database';
import { SqliteSettingsRepository } from '@/repositories/settings';
import { FixedClock } from '@/services/clock';
import { Uuid7IdGenerator } from '@/services/id';

const START = Date.UTC(2026, 7, 6, 18, 0, 0);
/** Matches `timer.defaultRestSeconds`'s own settings default - stands in for the value `WorkoutSessionService` would read and pass down in real usage. */
const DEFAULT_REST_SECONDS = 90;

function setup() {
  const db = createTestDatabase();
  const clock = new FixedClock(START);
  const idGenerator = new Uuid7IdGenerator(clock);
  const settings = new SqliteSettingsRepository(db, clock);
  const personalRecordRepository = new SqlitePersonalRecordRepository({
    db,
    clock,
    idGenerator,
    settings,
  });
  const repo = new SqliteWorkoutSessionRepository({
    db,
    clock,
    idGenerator,
    personalRecordRepository,
  });
  return { db, clock, idGenerator, repo };
}

async function insertExercise(db: DatabaseContext, id: string, nameEn = 'Bench Press') {
  await db.run(
    `INSERT INTO exercise (id, source, name_en, name_search, tracking_type, created_at, updated_at)
     VALUES (?, 'catalog', ?, ?, 'weight_reps', ?, ?)`,
    [id, nameEn, nameEn.toLowerCase(), START, START],
  );
}

async function deletedAt(db: DatabaseContext, setId: string): Promise<number | null> {
  const row = await db.selectOne<{ deleted_at: number | null }>(
    'SELECT deleted_at FROM workout_set WHERE id = ?',
    [setId],
  );
  return row!.deleted_at;
}

/**
 * The parent/segment cascade asserted on the raw `deleted_at` columns rather than
 * only through `findInProgress()`. The aggregate view proves a row is *hidden*;
 * these prove it is hidden for the right reason and, more importantly, that
 * `restoreSet`'s `WHERE parent_set_id = ? AND deleted_at = ?` match really does
 * keep a separately-deleted segment deleted - the same independence
 * `removeExercise`/`restoreExercise` document, which until now was only tested on
 * the exercise side.
 */
describe('SqliteWorkoutSessionRepository - drop-set cascade independence (ADR-0006)', () => {
  async function withChain() {
    const context = setup();
    await insertExercise(context.db, 'ex-1');
    const session = await context.repo.startEmpty(START);
    const exercise = await context.repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);
    const parent = await context.repo.appendSet(exercise.id, { weightKg: 100, reps: 8 });
    const first = await context.repo.addDropSet(parent.id, { weightKg: 80, reps: 6 });
    context.clock.advance(1000);
    const second = await context.repo.addDropSet(parent.id, { weightKg: 60, reps: 4 });
    return { ...context, session, exercise, parent, first, second };
  }

  it('deleting the parent stamps every segment with the same deleted_at', async () => {
    const { db, repo, clock, parent, first, second } = await withChain();

    clock.advance(1000);
    await repo.deleteSet(parent.id);

    const stamp = await deletedAt(db, parent.id);
    expect(stamp).toBe(START + 2000);
    expect(await deletedAt(db, first.id)).toBe(stamp);
    expect(await deletedAt(db, second.id)).toBe(stamp);
  });

  it('deleting a single segment leaves the parent and its sibling segments alone', async () => {
    const { db, repo, clock, parent, first, second } = await withChain();

    clock.advance(1000);
    await repo.deleteSet(first.id);

    expect(await deletedAt(db, first.id)).toBe(START + 2000);
    expect(await deletedAt(db, parent.id)).toBeNull();
    expect(await deletedAt(db, second.id)).toBeNull();

    const sets = (await repo.findInProgress())!.exercises[0]!.sets;
    expect(sets.map((s) => s.id)).toEqual([parent.id, second.id]);
  });

  it('restoring a parent does not resurrect a segment the user had deleted separately first', async () => {
    const { db, repo, clock, parent, first, second } = await withChain();

    clock.advance(1000);
    await repo.deleteSet(first.id);
    clock.advance(1000);
    await repo.deleteSet(parent.id);
    clock.advance(1000);
    await repo.restoreSet(parent.id);

    expect(await deletedAt(db, parent.id)).toBeNull();
    expect(await deletedAt(db, second.id)).toBeNull();
    // Deleted at START+2000, while the cascade stamped START+3000 - it is not the
    // cascade's to give back.
    expect(await deletedAt(db, first.id)).toBe(START + 2000);

    const sets = (await repo.findInProgress())!.exercises[0]!.sets;
    expect(sets.map((s) => s.id)).toEqual([parent.id, second.id]);
  });

  it('removeExercise cascades through parents and segments alike, and restoreExercise returns both', async () => {
    const { db, repo, clock, exercise, parent, first, second } = await withChain();

    clock.advance(1000);
    await repo.removeExercise(exercise.id);
    expect(await deletedAt(db, parent.id)).toBe(START + 2000);
    expect(await deletedAt(db, first.id)).toBe(START + 2000);

    clock.advance(1000);
    await repo.restoreExercise(exercise.id);

    const sets = (await repo.findInProgress())!.exercises[0]!.sets;
    expect(sets.map((s) => s.id)).toEqual([parent.id, first.id, second.id]);
  });
});

/**
 * ROADMAP P6 Definition of Done: "Repository methods introduced in the phase have
 * integration tests, including their constraint violations and rollback paths."
 * The happy paths and the four named domain errors are covered by the main suite;
 * these are the methods whose failure branch had no test at all.
 */
describe('SqliteWorkoutSessionRepository - constraint violations and rollback paths', () => {
  async function withTwoExercises() {
    const context = setup();
    await insertExercise(context.db, 'ex-1');
    await insertExercise(context.db, 'ex-2', 'Row');
    const session = await context.repo.startEmpty(START);
    const first = await context.repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);
    const second = await context.repo.addExercise(session.id, 'ex-2', DEFAULT_REST_SECONDS);
    return { ...context, session, first, second };
  }

  it('reorderExercises rolls back every sort_order it already wrote when a later id is unknown', async () => {
    const { db, repo, session, first, second } = await withTwoExercises();

    await expect(
      repo.reorderExercises(session.id, [second.id, first.id, 'ghost']),
    ).rejects.toBeInstanceOf(RepositoryNotFoundError);

    // The first two UPDATEs in the loop succeeded before the third threw; the
    // transaction must have undone them rather than leaving a half-applied order.
    const rows = await db.select<{ id: string; sort_order: number }>(
      'SELECT id, sort_order FROM session_exercise ORDER BY sort_order ASC',
    );
    expect(rows).toEqual([
      { id: first.id, sort_order: 0 },
      { id: second.id, sort_order: 1 },
    ]);
  });

  it('reorderExercises refuses an id belonging to another session, and one that is soft-deleted', async () => {
    const { repo, clock, session, first, second } = await withTwoExercises();

    await repo.finish(session.id, START + 1000);
    const other = await repo.startEmpty(START + 2000);
    const foreign = await repo.addExercise(other.id, 'ex-1', DEFAULT_REST_SECONDS);

    await expect(repo.reorderExercises(other.id, [foreign.id, first.id])).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );

    clock.advance(1000);
    await repo.removeExercise(foreign.id);
    await expect(repo.reorderExercises(other.id, [foreign.id])).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
    void second;
  });

  it('setSupersetGroup names the missing id, writes nothing, and no-ops on an empty list', async () => {
    const { db, repo, first, second } = await withTwoExercises();

    const error = await repo.setSupersetGroup([first.id, 'ghost'], 3).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RepositoryNotFoundError);
    expect((error as RepositoryNotFoundError).message).toContain('ghost');

    const groups = await db.select<{ superset_group: number | null }>(
      'SELECT superset_group FROM session_exercise ORDER BY sort_order ASC',
    );
    expect(groups.map((g) => g.superset_group)).toEqual([null, null]);

    await expect(repo.setSupersetGroup([], 3)).resolves.toBeUndefined();
    void second;
  });

  it('setSupersetGroup refuses a soft-deleted member, and refuses ids spanning sessions', async () => {
    const { repo, clock, first, second } = await withTwoExercises();

    clock.advance(1000);
    await repo.removeExercise(second.id);

    await expect(repo.setSupersetGroup([first.id, second.id], 1)).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
  });

  it('appendSet and addDropSet reject unknown and soft-deleted parents', async () => {
    const { repo, clock, first } = await withTwoExercises();
    const parent = await repo.appendSet(first.id, { weightKg: 100, reps: 5 });

    await expect(repo.appendSet('ghost', {})).rejects.toBeInstanceOf(RepositoryNotFoundError);
    await expect(repo.addDropSet('ghost', {})).rejects.toBeInstanceOf(RepositoryNotFoundError);

    clock.advance(1000);
    await repo.deleteSet(parent.id);
    await expect(repo.addDropSet(parent.id, {})).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it('updateSet, completeSet, uncompleteSet, deleteSet and restoreSet all reject an unknown id', async () => {
    const { repo } = await withTwoExercises();

    await expect(repo.updateSet('ghost', { reps: 5 })).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
    await expect(repo.completeSet('ghost', {})).rejects.toBeInstanceOf(RepositoryNotFoundError);
    await expect(repo.uncompleteSet('ghost')).rejects.toBeInstanceOf(RepositoryNotFoundError);
    await expect(repo.restoreSet('ghost')).rejects.toBeInstanceOf(RepositoryNotFoundError);
    await expect(repo.removeExercise('ghost')).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it('finish and discard reject a session id that does not exist', async () => {
    const { repo } = await withTwoExercises();

    await expect(repo.finish('ghost', START + 1000)).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
    await expect(repo.discard('ghost')).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it('finish and discard reject a soft-deleted session', async () => {
    const { db, repo, session } = await withTwoExercises();
    await db.run('UPDATE workout_session SET deleted_at = ? WHERE id = ?', [START + 1, session.id]);

    await expect(repo.finish(session.id, START + 1000)).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
    await expect(repo.discard(session.id)).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it('saveActiveState is held to the active_session_state foreign key rather than silently orphaning a row', async () => {
    const { db, repo } = await withTwoExercises();

    const error = await repo
      .saveActiveState({ sessionId: 'ghost', scrollOffset: 10 })
      .catch((e: unknown) => String(e));

    // A raw SQLite constraint error, not a domain error - see the audit note on
    // this method. What matters here is that no orphan row is created.
    expect(error).toMatch(/FOREIGN KEY constraint failed/i);
    const rows = await db.select<{ session_id: string }>(
      "SELECT session_id FROM active_session_state WHERE session_id = 'ghost'",
    );
    expect(rows).toEqual([]);
  });

  it('setSupersetGroup still refuses ids spanning two sessions after one of them finished', async () => {
    const { repo, session, first } = await withTwoExercises();
    await repo.finish(session.id, START + 1000);
    const other = await repo.startEmpty(START + 2000);
    const foreign = await repo.addExercise(other.id, 'ex-1', DEFAULT_REST_SECONDS);

    await expect(repo.setSupersetGroup([first.id, foreign.id], 1)).rejects.toBeInstanceOf(
      SupersetSpansMultipleSessionsError,
    );
  });
});

/**
 * Every method on `WorkoutSessionRepository` takes a trailing `tx?` so a caller
 * can compose a larger transaction, mirroring `SqlitePlanRepository` and
 * `SqliteExerciseRepository` - each of which has exactly this describe block.
 * P6 had none, which left both the composition path and the "the caller's
 * transaction rolls back and takes every joined mutation with it" rollback path
 * untested for all 19 methods, including the two (`setExerciseNote`,
 * `setSessionNotes`) added in a follow-up pass after the main repository.
 */
describe('SqliteWorkoutSessionRepository - transaction composition', () => {
  async function withSession() {
    const context = setup();
    await insertExercise(context.db, 'ex-1');
    await insertExercise(context.db, 'ex-2', 'Row');
    const session = await context.repo.startEmpty(START);
    const exercise = await context.repo.addExercise(session.id, 'ex-1', DEFAULT_REST_SECONDS);
    return { ...context, session, exercise };
  }

  it('commits a whole multi-method workout mutation as one caller-managed transaction', async () => {
    const { db, repo, session, exercise } = await withSession();

    await db.transaction(async (tx) => {
      const set = await repo.appendSet(exercise.id, { weightKg: 100, reps: 5 }, tx);
      await repo.completeSet(set.id, { rpe: 8 }, tx);
      await repo.addDropSet(set.id, { weightKg: 80, reps: 5 }, tx);
      const second = await repo.addExercise(
        session.id,
        'ex-2',
        DEFAULT_REST_SECONDS,
        undefined,
        tx,
      );
      await repo.setSupersetGroup([exercise.id, second.id], 2, tx);
      await repo.setExerciseNote(exercise.id, 'Paused reps', tx);
      await repo.setSessionNotes(session.id, 'Good session', tx);
      await repo.saveActiveState({ sessionId: session.id, scrollOffset: 12 }, tx);
    });

    const reloaded = (await repo.findInProgress())!;
    expect(reloaded.notes).toBe('Good session');
    expect(reloaded.exercises.map((e) => e.supersetGroup)).toEqual([2, 2]);
    expect(reloaded.exercises[0]!.note).toBe('Paused reps');
    expect(reloaded.exercises[0]!.sets).toHaveLength(2);
    expect(reloaded.activeState.scrollOffset).toBe(12);
  });

  it('rolls every joined mutation back when the caller-managed transaction throws', async () => {
    const { db, repo, session, exercise } = await withSession();
    const existing = await repo.appendSet(exercise.id, { weightKg: 60, reps: 10 });

    await expect(
      db.transaction(async (tx) => {
        await repo.appendSet(exercise.id, { weightKg: 100, reps: 5 }, tx);
        await repo.setExerciseNote(exercise.id, 'Should not survive', tx);
        await repo.setSessionNotes(session.id, 'Should not survive either', tx);
        await repo.deleteSet(existing.id, tx);
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    const reloaded = (await repo.findInProgress())!;
    expect(reloaded.notes).toBeNull();
    expect(reloaded.exercises[0]!.note).toBeNull();
    expect(reloaded.exercises[0]!.sets.map((s) => s.id)).toEqual([existing.id]);
  });

  it('rolls a joined finish back, leaving the session in progress with its active state intact', async () => {
    const { db, repo, session, exercise } = await withSession();
    const set = await repo.appendSet(exercise.id, { weightKg: 100, reps: 5 });
    await repo.completeSet(set.id, {});

    await expect(
      db.transaction(async (tx) => {
        await repo.finish(session.id, START + 60_000, tx);
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    const row = await db.selectOne<{ status: string; total_volume_kg: number | null }>(
      'SELECT status, total_volume_kg FROM workout_session WHERE id = ?',
      [session.id],
    );
    expect(row).toMatchObject({ status: 'in_progress', total_volume_kg: null });
    // `finish` deletes active_session_state; the rollback has to bring it back or
    // the session becomes unrecoverable by findInProgress's aggregate load.
    const recovered = await repo.findInProgress();
    expect(recovered).not.toBeNull();
    expect(recovered!.activeState.sessionId).toBe(session.id);
  });

  it('rolls a joined start back, freeing the single-in-progress slot again', async () => {
    const { db, repo } = setup();

    await expect(
      db.transaction(async (tx) => {
        await repo.startEmpty(START, 'Rolled back workout', tx);
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    expect(await repo.findInProgress()).toBeNull();
    expect(await db.select('SELECT id FROM workout_session')).toEqual([]);
    await expect(repo.startEmpty(START + 1000)).resolves.toMatchObject({ status: 'in_progress' });
  });
});
