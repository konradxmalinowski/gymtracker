/**
 * Performance regression guard fixture generator - ADR-0014 part 1, "Performance
 * regression guard": "A committed script (not a binary) generates a fixture
 * database with 2,500 sessions and 75,000 sets."
 *
 * Raw batched SQL directly against `SqlExecutor`/`DatabaseContext`
 * (ARCHITECTURE.md section 8.2), not through a repository layer - none exists yet
 * in this phase, and per this phase's own instructions this generator must not
 * wait for one. Every write goes through `db.transaction()` in large batches for
 * insert speed at this row count (`NodeSqlExecutor`'s prepared-statement cache
 * does the rest).
 *
 * Primary consumer: the CI benchmark suite (a later step in this same phase, per
 * `plans/2026-08-05-p2-persistence-foundation.md` step 4) calls
 * `generatePerfFixture()` against a `NodeSqlExecutor` built by
 * `database/node/createTestDatabase.ts`, then times queries against the result.
 * Runnable standalone too - see `main()` below - for a developer who wants to
 * eyeball generation time locally without going through Jest.
 */
import { generateUuidV7 } from '@/database/ids/uuidv7';
import { seedLookupTables } from '@/database/seed/lookupSeeder';
import type { DatabaseContext, SqlExecutor } from '@/repositories/contracts/database';

export interface PerfFixtureOptions {
  /** Number of `workout_session` rows to generate. */
  sessionCount?: number;
  /** Number of `session_exercise` rows per session. */
  exercisesPerSession?: number;
  /** Number of `workout_set` rows per session_exercise. */
  setsPerExercise?: number;
  /** Size of the synthetic `exercise` pool sessions draw from. */
  exercisePoolSize?: number;
  /** Seed for the deterministic PRNG - same seed always produces the same fixture. */
  randomSeed?: number;
}

export interface PerfFixtureStats {
  sessionCount: number;
  sessionExerciseCount: number;
  setCount: number;
  exerciseIds: readonly string[];
  generationMs: number;
}

/** 2,500 sessions x 5 exercises x 6 sets = 75,000 sets - ADR-0014's stated target. */
const DEFAULT_OPTIONS: Required<PerfFixtureOptions> = {
  sessionCount: 2500,
  exercisesPerSession: 5,
  setsPerExercise: 6,
  exercisePoolSize: 40,
  randomSeed: 42,
};

/** Small deterministic PRNG (mulberry32) - no external dependency, reproducible fixtures. */
function createRandom(seed: number): () => number {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;

/**
 * Populates a schema-ready `DatabaseContext` with a synthetic training history.
 * Assumes `database/schema.sql` has already been applied (e.g. via
 * `createTestDatabase()`) - this function only inserts rows.
 */
export async function generatePerfFixture(
  db: DatabaseContext,
  options: PerfFixtureOptions = {},
): Promise<PerfFixtureStats> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const random = createRandom(opts.randomSeed);
  const startedGeneratingAt = Date.now();
  const nowMs = Date.now();

  await seedLookupTables(db);

  const exerciseIds: string[] = [];
  await db.transaction(async (tx: SqlExecutor) => {
    for (let i = 0; i < opts.exercisePoolSize; i += 1) {
      const id = generateUuidV7(nowMs);
      exerciseIds.push(id);
      await tx.run(
        `INSERT INTO exercise (id, source, name_en, name_search, created_at, updated_at)
         VALUES (?, 'custom', ?, ?, ?, ?)`,
        [id, `Fixture Exercise ${i}`, `fixture exercise ${i}`, nowMs, nowMs],
      );
    }
  });

  let sessionExerciseCount = 0;
  let setCount = 0;

  await db.transaction(async (tx: SqlExecutor) => {
    for (let s = 0; s < opts.sessionCount; s += 1) {
      const sessionId = generateUuidV7(nowMs);
      const startedAt = nowMs - Math.floor(random() * TEN_YEARS_MS);
      const durationSeconds = 2400 + Math.floor(random() * 2400);
      const finishedAt = startedAt + durationSeconds * 1000;
      const localDate = new Date(startedAt).toISOString().slice(0, 10);

      await tx.run(
        `INSERT INTO workout_session (
           id, title, status, started_at, finished_at, local_date, tz_offset_minutes,
           duration_seconds, created_at, updated_at
         ) VALUES (?, ?, 'completed', ?, ?, ?, 0, ?, ?, ?)`,
        [
          sessionId,
          `Fixture Session ${s}`,
          startedAt,
          finishedAt,
          localDate,
          durationSeconds,
          startedAt,
          finishedAt,
        ],
      );

      for (let e = 0; e < opts.exercisesPerSession; e += 1) {
        const sessionExerciseId = generateUuidV7(nowMs);
        const exerciseIndex = Math.floor(random() * exerciseIds.length);
        const exerciseId = exerciseIds[exerciseIndex] as string;

        await tx.run(
          `INSERT INTO session_exercise (
             id, session_id, exercise_id, exercise_name_snapshot, sort_order, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [sessionExerciseId, sessionId, exerciseId, 'Fixture Exercise', e, startedAt, startedAt],
        );
        sessionExerciseCount += 1;

        for (let setIndex = 0; setIndex < opts.setsPerExercise; setIndex += 1) {
          const setId = generateUuidV7(nowMs);
          const performedAt = startedAt + setIndex * 60_000;
          const weightKg = 20 + Math.floor(random() * 80);
          const reps = 5 + Math.floor(random() * 8);

          await tx.run(
            `INSERT INTO workout_set (
               id, session_exercise_id, session_id, exercise_id, set_index, weight_kg, reps,
               is_completed, completed_at, performed_at, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
            [
              setId,
              sessionExerciseId,
              sessionId,
              exerciseId,
              setIndex + 1,
              weightKg,
              reps,
              performedAt,
              performedAt,
              performedAt,
              performedAt,
            ],
          );
          setCount += 1;
        }
      }
    }
  });

  return {
    sessionCount: opts.sessionCount,
    sessionExerciseCount,
    setCount,
    exerciseIds,
    generationMs: Date.now() - startedGeneratingAt,
  };
}

/** Standalone CLI entry point - not wired into package.json (see this phase's report). */
export async function main(): Promise<void> {
  const { createTestDatabase } = await import('@/database/node/createTestDatabase');
  const db = createTestDatabase();
  const stats = await generatePerfFixture(db);
  console.log(
    `Generated ${stats.sessionCount} sessions / ${stats.sessionExerciseCount} session-exercises / ` +
      `${stats.setCount} sets in ${stats.generationMs}ms`,
  );
}

if (typeof require !== 'undefined' && require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
