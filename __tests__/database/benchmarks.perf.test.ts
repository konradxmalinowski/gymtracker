import { generatePerfFixture } from '../../scripts/generate-perf-fixture';
import { createTestDatabase } from '@/database/node/createTestDatabase';
import type { NodeSqlExecutor } from '@/database/node/NodeSqlExecutor';
import {
  seedCatalog,
  type CatalogExerciseEntry,
  type CatalogFile,
} from '@/database/seed/catalogSeeder';
import { seedLookupTables } from '@/database/seed/lookupSeeder';
import { SqliteExerciseRepository } from '@/features/exercise-library/repository/SqliteExerciseRepository';
import { FixedClock } from '@/services/clock';
import { Uuid7IdGenerator } from '@/services/id';

/**
 * CI performance regression guard - ADR-0014's "Performance regression guard"
 * section: "A committed script generates a fixture database with 2,500 sessions
 * and 75,000 sets. A benchmark suite asserts upper bounds on exercise search,
 * previous-performance lookup, session detail load, one-year volume aggregation
 * and the JSON export. These run on `NodeSqlExecutor` in CI, measuring SQL cost -
 * the part that scales with the user's history - rather than render cost."
 *
 * Of those five cases, only the ones P2 actually ships a queryable surface for get
 * a real, currently-passing assertion here - schema tables/indexes/views from
 * `database/schema.sql`, exercised with raw SQL exactly like
 * `scripts/generate-perf-fixture.ts` itself does (no repository layer involved,
 * per ADR-0014: this suite measures SQL cost, not repository-call overhead):
 *
 * - previous-performance lookup: `ix_set_exercise_time` exists precisely for this
 *   ("Hot path: previous performance and per-exercise progression charts.").
 * - session detail load: `ix_session_exercise_sess` / `ix_set_session` exist
 *   precisely for this ("Hot path: rendering the active workout and any session
 *   detail.").
 * - one-year volume aggregation: `v_working_set` (7.10) is the read model this
 *   aggregates over.
 *
 * The other two depend on a repository/service that does not exist until a later
 * roadmap phase - explicitly `test.skip`'d with a comment naming that phase, per
 * this step's own scope, rather than silently omitted or faked with a placeholder
 * assertion:
 *
 * - exercise search needs `ExerciseRepository`'s FTS5 query - lands in P4
 *   (exercise-library).
 * - JSON export needs the export service - lands in P9 (data-transfer).
 *
 * Budgets carry wide headroom over the measured baseline (the same shape as
 * `catalogSeeder.perf.test.ts`'s ~13x margin) since CI runners are slower and
 * noisier than a dev machine - the goal is catching a real regression (a missing
 * index, an accidental full table scan), not flagging ordinary variance. Every
 * case logs its measured time so the roadmap's "reports baseline numbers"
 * acceptance line is satisfied by the suite's own output, not by a separate
 * bookkeeping test.
 */
describe('CI performance regression guard (ADR-0014)', () => {
  let db: NodeSqlExecutor;
  let exerciseIds: readonly string[];

  beforeAll(async () => {
    db = createTestDatabase();
    const stats = await generatePerfFixture(db);
    exerciseIds = stats.exerciseIds;
    console.log(
      `Fixture: ${stats.sessionCount} sessions / ${stats.sessionExerciseCount} session-exercises / ` +
        `${stats.setCount} sets generated in ${stats.generationMs}ms`,
    );
  }, 60_000);

  describe('previous-performance lookup', () => {
    it('finds the most recent completed set for an exercise under budget', async () => {
      const exerciseId = exerciseIds[0]!;

      const startedAt = Date.now();
      const row = await db.selectOne<{ id: string; performed_at: number }>(
        `SELECT id, performed_at FROM workout_set
         WHERE exercise_id = ? AND deleted_at IS NULL AND is_completed = 1
         ORDER BY performed_at DESC
         LIMIT 1`,
        [exerciseId],
      );
      const elapsedMs = Date.now() - startedAt;

      console.log(`Previous-performance lookup: ${elapsedMs}ms`);
      expect(row).not.toBeNull();
      expect(elapsedMs).toBeLessThan(50);
    });
  });

  describe('session detail load', () => {
    it('loads one session with its exercises and sets under budget', async () => {
      const sessionRow = await db.selectOne<{ id: string }>(
        'SELECT id FROM workout_session LIMIT 1',
      );
      const sessionId = sessionRow!.id;

      const startedAt = Date.now();
      const exercises = await db.select(
        'SELECT * FROM session_exercise WHERE session_id = ? ORDER BY sort_order',
        [sessionId],
      );
      const sets = await db.select(
        'SELECT * FROM workout_set WHERE session_id = ? ORDER BY set_index',
        [sessionId],
      );
      const elapsedMs = Date.now() - startedAt;

      console.log(
        `Session detail load: ${elapsedMs}ms (${exercises.length} exercises, ${sets.length} sets)`,
      );
      expect(exercises.length).toBeGreaterThan(0);
      expect(sets.length).toBeGreaterThan(0);
      expect(elapsedMs).toBeLessThan(50);
    });
  });

  describe('one-year volume aggregation', () => {
    it('aggregates v_working_set volume by day over one year under budget', async () => {
      const oneYearAgoMs = Date.now() - 365 * 24 * 60 * 60 * 1000;
      const localDateCutoff = new Date(oneYearAgoMs).toISOString().slice(0, 10);

      const startedAt = Date.now();
      const rows = await db.select<{ local_date: string; volume_kg: number }>(
        `SELECT local_date, SUM(volume_kg) AS volume_kg
         FROM v_working_set
         WHERE local_date >= ?
         GROUP BY local_date
         ORDER BY local_date`,
        [localDateCutoff],
      );
      const elapsedMs = Date.now() - startedAt;

      console.log(`One-year volume aggregation: ${elapsedMs}ms (${rows.length} days)`);
      expect(elapsedMs).toBeLessThan(150);
    });
  });

  describe('exercise search', () => {
    /** ~900 rows, matching NFR-03's stated budget scope - via `seedCatalog()` (the real seeder path), not hand-rolled raw SQL. */
    function buildSyntheticCatalog(count: number): CatalogFile {
      const equipmentSlugs = ['barbell', 'dumbbell', 'machine', 'cable', 'body only'];
      const muscleSlugs = [
        'chest',
        'shoulders',
        'triceps',
        'biceps',
        'quadriceps',
        'hamstrings',
        'lats',
      ];
      const exercises: CatalogExerciseEntry[] = [];
      for (let i = 0; i < count; i += 1) {
        const nameEn = i === 0 ? 'Bench Press' : `Fixture Exercise ${i}`;
        exercises.push({
          catalogSlug: `fixture-exercise-${i}`,
          nameEn,
          nameSearch: nameEn.toLowerCase(),
          equipmentSlug: equipmentSlugs[i % equipmentSlugs.length]!,
          bodyPart: 'upper',
          trackingType: 'weight_reps',
          muscles: [{ slug: muscleSlugs[i % muscleSlugs.length]!, role: 'primary' }],
        });
      }
      return { catalogVersion: '1', exercises };
    }

    it('finds matches via FTS5 text search under budget for ~900 exercises (NFR-03, ADR-0003)', async () => {
      const exerciseDb = createTestDatabase();
      await seedLookupTables(exerciseDb);
      await seedCatalog(exerciseDb, buildSyntheticCatalog(900));

      const repo = new SqliteExerciseRepository({
        db: exerciseDb,
        clock: new FixedClock(Date.now()),
        idGenerator: new Uuid7IdGenerator(),
      });

      const startedAt = Date.now();
      const results = await repo.search({ text: 'bench' });
      const elapsedMs = Date.now() - startedAt;

      console.log(`Exercise search: ${elapsedMs}ms (${results.length} results)`);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.nameEn).toBe('Bench Press');
      expect(elapsedMs).toBeLessThan(50);
    });
  });

  describe('JSON export', () => {
    // No export service/repository exists yet - lands in P9 (data-transfer
    // feature). The shape of a full-history export (which tables, what format)
    // is a P9 design decision, not something P2's schema alone determines.
    test.skip('full-history JSON export stays under budget - lands in P9 (data-transfer feature)', () => {
      // Intentionally empty - see comment above.
    });
  });
});
