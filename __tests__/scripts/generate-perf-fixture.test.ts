import { generatePerfFixture } from '../../scripts/generate-perf-fixture';
import { createTestDatabase } from '@/database/node/createTestDatabase';
import type { NodeSqlExecutor } from '@/database/node/NodeSqlExecutor';

/**
 * ADR-0014's "performance regression guard": a committed script generates a
 * fixture database with 2,500 sessions and 75,000 sets, for the CI benchmark
 * suite (a later step in this phase, per `plans/2026-08-05-p2-persistence-
 * foundation.md`) to run timed queries against. This test proves the generator
 * itself produces exactly that shape and finishes in a reasonable time - the
 * benchmark suite that consumes it is out of this step's scope.
 */
describe('generatePerfFixture', () => {
  it('generates exactly 2,500 sessions and 75,000 sets by default', async () => {
    const db = createTestDatabase();
    const stats = await generatePerfFixture(db);

    expect(stats.sessionCount).toBe(2500);
    expect(stats.setCount).toBe(75_000);

    const sessionRows = await db.selectOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM workout_session',
    );
    const setRows = await db.selectOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM workout_set',
    );
    expect(sessionRows?.count).toBe(2500);
    expect(setRows?.count).toBe(75_000);

    console.log(`Generated perf fixture in ${stats.generationMs}ms`);
  }, 30_000);

  it('produces a deterministic fixture for a given seed', async () => {
    const dbA = createTestDatabase();
    const dbB = createTestDatabase();

    const statsA = await generatePerfFixture(dbA, {
      sessionCount: 20,
      exercisesPerSession: 2,
      setsPerExercise: 2,
      randomSeed: 7,
    });
    const statsB = await generatePerfFixture(dbB, {
      sessionCount: 20,
      exercisesPerSession: 2,
      setsPerExercise: 2,
      randomSeed: 7,
    });

    // Row ids embed the real wall-clock (UUIDv7), so two separate runs never sort
    // identically by id - compare the generated multiset of values instead, which
    // is what "deterministic for a given seed" actually claims here.
    const weightsA = (await dbA.select<{ weight_kg: number }>('SELECT weight_kg FROM workout_set'))
      .map((r) => r.weight_kg)
      .sort();
    const weightsB = (await dbB.select<{ weight_kg: number }>('SELECT weight_kg FROM workout_set'))
      .map((r) => r.weight_kg)
      .sort();

    expect(statsA.setCount).toBe(statsB.setCount);
    expect(weightsA).toEqual(weightsB);
  });

  it('respects custom row-count options', async () => {
    const db: NodeSqlExecutor = createTestDatabase();
    const stats = await generatePerfFixture(db, {
      sessionCount: 10,
      exercisesPerSession: 3,
      setsPerExercise: 4,
    });

    expect(stats.sessionCount).toBe(10);
    expect(stats.sessionExerciseCount).toBe(30);
    expect(stats.setCount).toBe(120);
  });

  it('every generated row satisfies the schema constraints it inserts against (no silent failures)', async () => {
    const db = createTestDatabase();
    await generatePerfFixture(db, { sessionCount: 5, exercisesPerSession: 2, setsPerExercise: 3 });

    const integrity = await db.select<{ integrity_check: string }>('PRAGMA integrity_check');
    expect(integrity).toEqual([{ integrity_check: 'ok' }]);
  });
});
