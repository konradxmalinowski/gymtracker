import { generatePerfFixture } from '../../scripts/generate-perf-fixture';
import { createTestDatabase } from '@/database/node/createTestDatabase';
import type { NodeSqlExecutor } from '@/database/node/NodeSqlExecutor';
import {
  seedCatalog,
  type CatalogExerciseEntry,
  type CatalogFile,
} from '@/database/seed/catalogSeeder';
import { seedLookupTables } from '@/database/seed/lookupSeeder';
import { SqliteCalendarRepository } from '@/features/calendar/repository/SqliteCalendarRepository';
import { SqliteExerciseRepository } from '@/features/exercise-library/repository/SqliteExerciseRepository';
import { SqliteStatisticsRepository } from '@/features/statistics/repository/SqliteStatisticsRepository';
import { SqliteSettingsRepository } from '@/repositories/settings';
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

  describe('history list pagination (P9)', () => {
    /**
     * `WorkoutSessionRepository.listHistory`'s own SQL
     * (`SqliteWorkoutSessionRepository.ts`), reproduced here verbatim as raw
     * SQL against `db` directly rather than through the repository - this
     * suite measures SQL cost, not repository-call overhead (see this file's
     * own top doc comment). `ix_session_started` backs the `ORDER BY
     * started_at DESC`, and every fixture session is `status = 'completed'`
     * with `deleted_at IS NULL`, so this exercises the exact index-backed
     * range scan `WorkoutHistoryListScreen`'s first page runs against a real
     * 2,500-session history. `50` matches `useSessionHistoryList`'s own
     * `HISTORY_PAGE_SIZE`, not `buildLimitOffset`'s default of 20.
     */
    it('loads the first history-list page under budget for 2,500 completed sessions', async () => {
      const pageSize = 50;

      const startedAt = Date.now();
      const rows = await db.select<{ id: string; started_at: number }>(
        `SELECT * FROM workout_session
         WHERE status = 'completed' AND deleted_at IS NULL
         ORDER BY started_at DESC
         LIMIT ? OFFSET ?`,
        [pageSize, 0],
      );
      const elapsedMs = Date.now() - startedAt;

      console.log(`History list pagination (first page of ${pageSize}): ${elapsedMs}ms`);
      expect(rows.length).toBe(pageSize);
      expect(elapsedMs).toBeLessThan(50);
    });

    it('loads a deep page (offset 2,400) under the same budget - no linear degradation with offset', async () => {
      const pageSize = 50;

      const startedAt = Date.now();
      const rows = await db.select<{ id: string; started_at: number }>(
        `SELECT * FROM workout_session
         WHERE status = 'completed' AND deleted_at IS NULL
         ORDER BY started_at DESC
         LIMIT ? OFFSET ?`,
        [pageSize, 2400],
      );
      const elapsedMs = Date.now() - startedAt;

      console.log(`History list pagination (offset 2400): ${elapsedMs}ms (${rows.length} rows)`);
      expect(elapsedMs).toBeLessThan(50);
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

  describe('statistics repository (P11)', () => {
    /**
     * ADR-0014 / `docs/ROADMAP.md`'s P11 acceptance line: "one year of volume
     * aggregation completes within the benchmark bound on the 75,000-set
     * fixture." Through the real `SqliteStatisticsRepository` (a real
     * `SqliteSettingsRepository` for `settings`, same `db` the rest of this
     * suite already shares) rather than raw SQL, since - unlike the other
     * cases in this file, which predate this repository - this is exactly the
     * production call path a real Statistics-tab load takes. Budget matches
     * the existing "one-year volume aggregation" case above (150ms): both
     * scan the same `v_working_set` read model over the same one-year range.
     */
    it('aggregates muscle-group volume over one year under budget', async () => {
      const oneYearAgoMs = Date.now() - 365 * 24 * 60 * 60 * 1000;
      const localDateFrom = new Date(oneYearAgoMs).toISOString().slice(0, 10);
      const localDateTo = new Date().toISOString().slice(0, 10);
      const settings = new SqliteSettingsRepository(db, new FixedClock(Date.now()));
      const repo = new SqliteStatisticsRepository({ db, settings });

      const startedAt = Date.now();
      const rows = await repo.muscleGroupVolume(localDateFrom, localDateTo);
      const elapsedMs = Date.now() - startedAt;

      console.log(
        `Muscle-group volume aggregation (1 year): ${elapsedMs}ms (${rows.length} body parts)`,
      );
      expect(elapsedMs).toBeLessThan(150);
    });

    it('reduces one exercise’s progression over one year under budget', async () => {
      const exerciseId = exerciseIds[0]!;
      const oneYearAgoMs = Date.now() - 365 * 24 * 60 * 60 * 1000;
      const localDateFrom = new Date(oneYearAgoMs).toISOString().slice(0, 10);
      const localDateTo = new Date().toISOString().slice(0, 10);
      const settings = new SqliteSettingsRepository(db, new FixedClock(Date.now()));
      const repo = new SqliteStatisticsRepository({ db, settings });

      const startedAt = Date.now();
      const points = await repo.exerciseProgression(
        exerciseId,
        localDateFrom,
        localDateTo,
        'week',
        'e1rm',
      );
      const elapsedMs = Date.now() - startedAt;

      console.log(
        `Exercise progression aggregation (1 year, e1rm): ${elapsedMs}ms (${points.length} buckets)`,
      );
      expect(elapsedMs).toBeLessThan(150);
    });
  });

  describe('calendar repository (P12)', () => {
    /**
     * `docs/ROADMAP.md`'s P12 acceptance line: "navigating twelve months is
     * smooth (no jank, no unbounded query growth)" - treated as a
     * benchmark-backed NFR per `plans/2026-08-19-p12-calendar.md`'s own NFR
     * section, the same way P11 turned its own "one year of volume
     * aggregation" acceptance line into a real assertion above. Through the
     * real `SqliteCalendarRepository` (a real production call path,
     * `useCalendarYear`'s own composition), not raw SQL - same `db` this
     * whole suite shares. Budget matches every other one-year-range case in
     * this file (150ms): `yearOverview` scans the same `v_session_summary`/
     * `v_working_set` read model over the same one-year span.
     */
    it('aggregates one year of trained days under budget', async () => {
      const repo = new SqliteCalendarRepository({ db });
      const year = new Date().getFullYear();

      const startedAt = Date.now();
      const rows = await repo.yearOverview(year);
      const elapsedMs = Date.now() - startedAt;

      console.log(
        `Calendar yearOverview aggregation (1 year): ${elapsedMs}ms (${rows.length} days)`,
      );
      expect(elapsedMs).toBeLessThan(150);
    });
  });
});
