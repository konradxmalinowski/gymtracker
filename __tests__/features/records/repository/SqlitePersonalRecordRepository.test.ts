import * as fc from 'fast-check';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import { SqlitePersonalRecordRepository } from '@/features/records/repository/SqlitePersonalRecordRepository';
import type { RecordCandidateSet } from '@/features/records/repository/PersonalRecordRepository';
import type { DatabaseContext } from '@/repositories/contracts/database';
import { SqliteSettingsRepository } from '@/repositories/settings';
import { FixedClock } from '@/services/clock';
import { Uuid7IdGenerator } from '@/services/id';
import {
  insertExercise,
  insertWorkoutSession,
  insertSessionExercise,
  insertWorkoutSet,
} from '../../../database/helpers/fixtures';

const START = Date.UTC(2026, 7, 6, 18, 0, 0);

function setup() {
  const db = createTestDatabase();
  const clock = new FixedClock(START);
  const idGenerator = new Uuid7IdGenerator(clock);
  const settings = new SqliteSettingsRepository(db, clock);
  const repo = new SqlitePersonalRecordRepository({ db, clock, idGenerator, settings });
  return { db, clock, idGenerator, settings, repo };
}

type CandidateSetType = 'normal' | 'failure' | 'warmup' | 'drop' | 'assisted' | 'partial';

/**
 * `personal_record.workout_set_id`/`session_id` are real foreign keys
 * (`ON DELETE SET NULL`) and every test database runs with
 * `PRAGMA foreign_keys = ON` (`database/node/createTestDatabase.ts`) - a
 * candidate referencing an id with no matching `workout_set`/`workout_session`
 * row would fail the insert, not silently succeed. This helper inserts the
 * real rows a candidate must reference, mirroring what `completeSet` always
 * has in hand in production, and returns the ready-to-evaluate
 * `RecordCandidateSet`. Defaults to a `status: 'completed'` session -
 * `rebuild()` only walks completed sessions (see
 * `SqlitePersonalRecordRepository.rebuild()`'s own doc comment), so tests
 * that exercise both the incremental and the rebuild path need their fixture
 * data to actually be visible to both.
 */
async function insertCandidateSet(
  db: DatabaseContext,
  exerciseId: string,
  overrides: Partial<{
    sessionId: string;
    setType: CandidateSetType;
    weightKg: number | null;
    reps: number | null;
    performedAt: number;
    sessionStatus: 'completed' | 'in_progress' | 'discarded';
  }> = {},
): Promise<RecordCandidateSet> {
  const performedAt = overrides.performedAt ?? START;
  const sessionId =
    overrides.sessionId ??
    (await insertWorkoutSession(db, {
      now: performedAt,
      status: overrides.sessionStatus ?? 'completed',
    }));
  const sessionExerciseId = await insertSessionExercise(db, sessionId, exerciseId, {
    now: performedAt,
  });
  const setType = overrides.setType ?? 'normal';
  const weightKg = overrides.weightKg === undefined ? 100 : overrides.weightKg;
  const reps = overrides.reps === undefined ? 5 : overrides.reps;
  const setId = await insertWorkoutSet(db, sessionExerciseId, sessionId, exerciseId, {
    setType,
    weightKg,
    reps,
    performedAt,
    now: performedAt,
  });

  return {
    setType,
    weightKg,
    reps,
    durationSeconds: null,
    distanceM: null,
    workoutSetId: setId,
    sessionId,
    achievedAt: performedAt,
  };
}

interface ComparableRecordRow {
  exercise_id: string;
  record_type: string;
  rep_bucket: number | null;
  value: number;
  weight_kg: number | null;
  reps: number | null;
  workout_set_id: string | null;
  session_id: string | null;
  achieved_at: number;
  previous_value: number | null;
  is_current: number;
}

/** Every column except `id`/`created_at`/`updated_at` - what the equivalence test compares, since the two paths never share an `id` for the same logical row and a frozen clock can coincidentally tie `created_at`/`updated_at` without that meaning anything. */
async function readComparableRecords(db: DatabaseContext): Promise<ComparableRecordRow[]> {
  return db.select<ComparableRecordRow>(
    `SELECT exercise_id, record_type, rep_bucket, value, weight_kg, reps, workout_set_id,
            session_id, achieved_at, previous_value, is_current
     FROM personal_record
     ORDER BY exercise_id, record_type, IFNULL(rep_bucket, -1), achieved_at, workout_set_id`,
  );
}

/** Deterministic PRNG (mulberry32) - a seeded, reproducible stand-in for `Math.random()` so the equivalence test's "non-trivial synthetic history" is exactly reproducible across runs and CI machines. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SET_TYPE_POOL: readonly CandidateSetType[] = [
  'normal',
  'normal',
  'normal',
  'failure',
  'failure',
  'warmup',
  'assisted',
  'partial',
];

describe('SqlitePersonalRecordRepository.evaluateAndUpsert() - basic ADR-0015 Decision 3 behavior', () => {
  it('a first-ever eligible set trivially becomes the current record for every slot it touches, with previousValue null', async () => {
    const { db, repo } = setup();
    const exerciseId = await insertExercise(db, { id: 'ex-1' });
    const candidate = await insertCandidateSet(db, exerciseId);

    const created = await repo.evaluateAndUpsert(exerciseId, candidate, db);

    // max_weight, max_reps, weight_at_reps(5), max_set_volume, estimated_1rm - every slot a 100kg x 5 normal set touches.
    expect(created.map((r) => r.recordType).sort()).toEqual(
      ['estimated_1rm', 'max_reps', 'max_set_volume', 'max_weight', 'weight_at_reps'].sort(),
    );
    expect(created.every((r) => r.previousValue === null)).toBe(true);
    expect(created.every((r) => r.isCurrent)).toBe(true);
  });

  it('a strictly greater weight supersedes the old current row: old becomes is_current=0, new row carries previousValue', async () => {
    const { db, clock, repo } = setup();
    const exerciseId = await insertExercise(db, { id: 'ex-1' });

    const firstCandidate = await insertCandidateSet(db, exerciseId, {
      weightKg: 100,
      performedAt: START,
    });
    const first = await repo.evaluateAndUpsert(exerciseId, firstCandidate, db);
    const firstMaxWeight = first.find((r) => r.recordType === 'max_weight')!;

    clock.advance(60_000);
    const secondCandidate = await insertCandidateSet(db, exerciseId, {
      weightKg: 105,
      performedAt: START + 60_000,
    });
    const second = await repo.evaluateAndUpsert(exerciseId, secondCandidate, db);
    const secondMaxWeight = second.find((r) => r.recordType === 'max_weight')!;
    expect(secondMaxWeight.previousValue).toBe(100);
    expect(secondMaxWeight.value).toBe(105);

    const oldRow = await db.selectOne<{ is_current: number }>(
      'SELECT is_current FROM personal_record WHERE id = ?',
      [firstMaxWeight.id],
    );
    expect(oldRow).toEqual({ is_current: 0 });

    const history = await repo.listHistory(exerciseId, 'max_weight');
    expect(history.map((r) => r.value)).toEqual([105, 100]);
  });

  it('a tie does not beat the existing record (strict-greater-only tie-break) - no new row is written', async () => {
    const { db, repo } = setup();
    const exerciseId = await insertExercise(db, { id: 'ex-1' });

    const firstCandidate = await insertCandidateSet(db, exerciseId, { performedAt: START });
    await repo.evaluateAndUpsert(exerciseId, firstCandidate, db);

    const tieCandidate = await insertCandidateSet(db, exerciseId, { performedAt: START + 1000 });
    const tie = await repo.evaluateAndUpsert(exerciseId, tieCandidate, db);

    expect(tie).toEqual([]);
    const rows = await db.select('SELECT id FROM personal_record');
    expect(rows).toHaveLength(5); // unchanged from the first call
  });

  it('warmup/assisted/partial sets never create a record, even though the candidate carries real numbers', async () => {
    const { db, repo } = setup();
    const exerciseId = await insertExercise(db, { id: 'ex-1' });

    for (const setType of ['warmup', 'assisted', 'partial'] as const) {
      const candidate = await insertCandidateSet(db, exerciseId, { setType, performedAt: START });
      const created = await repo.evaluateAndUpsert(exerciseId, candidate, db);
      expect(created).toEqual([]);
    }
    expect(await repo.listCurrent(exerciseId)).toEqual([]);
  });

  it('ux_pr_current is respected: at most one current row per (exercise_id, record_type, rep_bucket)', async () => {
    const { db, clock, repo } = setup();
    const exerciseId = await insertExercise(db, { id: 'ex-1' });

    for (let i = 0; i < 8; i += 1) {
      clock.advance(60_000);
      const candidate = await insertCandidateSet(db, exerciseId, {
        weightKg: 100 + i,
        performedAt: START + i * 60_000,
      });
      await repo.evaluateAndUpsert(exerciseId, candidate, db);
    }

    const duplicates = await db.select(
      `SELECT exercise_id, record_type, IFNULL(rep_bucket, -1) AS bucket, COUNT(*) AS cnt
       FROM personal_record WHERE is_current = 1
       GROUP BY exercise_id, record_type, bucket HAVING cnt > 1`,
    );
    expect(duplicates).toEqual([]);

    const current = await repo.listCurrent(exerciseId);
    expect(current.length).toBeGreaterThan(0);
    expect(current.every((r) => r.isCurrent)).toBe(true);
  });
});

describe('SqlitePersonalRecordRepository - listCurrent / listRecent / listHistory', () => {
  it('listCurrent scoped to one exercise only returns that exercise', async () => {
    const { db, repo } = setup();
    const exerciseA = await insertExercise(db, { id: 'ex-a' });
    const exerciseB = await insertExercise(db, { id: 'ex-b' });
    await repo.evaluateAndUpsert(
      exerciseA,
      await insertCandidateSet(db, exerciseA, { weightKg: 50 }),
      db,
    );
    await repo.evaluateAndUpsert(
      exerciseB,
      await insertCandidateSet(db, exerciseB, { weightKg: 60 }),
      db,
    );

    const currentA = await repo.listCurrent(exerciseA);
    expect(currentA.every((r) => r.exerciseId === exerciseA)).toBe(true);
    expect(currentA.length).toBeGreaterThan(0);
  });

  it('listRecent orders by achieved_at descending across every exercise and respects the limit', async () => {
    const { db, clock, repo } = setup();
    const exerciseA = await insertExercise(db, { id: 'ex-a' });
    const exerciseB = await insertExercise(db, { id: 'ex-b' });

    const candidateA = await insertCandidateSet(db, exerciseA, {
      weightKg: 50,
      performedAt: START,
    });
    await repo.evaluateAndUpsert(exerciseA, candidateA, db);

    clock.advance(60_000);
    const candidateB = await insertCandidateSet(db, exerciseB, {
      weightKg: 60,
      performedAt: START + 60_000,
    });
    await repo.evaluateAndUpsert(exerciseB, candidateB, db);

    const recent = await repo.listRecent(3);
    expect(recent).toHaveLength(3);
    expect(recent.every((r) => r.exerciseId === exerciseB)).toBe(true);
  });
});

describe('SqlitePersonalRecordRepository.rebuild() - equivalence with incremental evaluation (ADR-0015)', () => {
  it('produces a byte-identical personal_record table to calling evaluateAndUpsert incrementally, in performed_at order, over a non-trivial synthetic history', async () => {
    const { db, clock, idGenerator, settings, repo } = setup();

    const EXERCISE_COUNT = 5;
    const SETS_PER_EXERCISE = 40;
    const rand = mulberry32(0xc0ffee);

    const exerciseIds: string[] = [];
    for (let i = 0; i < EXERCISE_COUNT; i += 1) {
      exerciseIds.push(await insertExercise(db, { id: `ex-${i}`, nameEn: `Exercise ${i}` }));
    }

    // One completed session per exercise per "round" (5 sets/session) - a
    // handful of sessions per exercise, non-trivial but still fast under CI.
    // `rebuild()` only walks completed sessions (its own doc comment), so
    // every synthetic session here is completed - this is what makes the
    // equivalence property meaningful rather than vacuously true.
    const sessionsByExercise = new Map<string, string[]>();
    for (const exerciseId of exerciseIds) {
      const sessionIds: string[] = [];
      for (let s = 0; s < SETS_PER_EXERCISE / 5; s += 1) {
        sessionIds.push(await insertWorkoutSession(db, { now: START, status: 'completed' }));
      }
      sessionsByExercise.set(exerciseId, sessionIds);
    }

    // Globally monotonic performedAt across every exercise interleaved -
    // this is what makes rebuild()'s per-exercise chronological walk
    // reproduce the exact relative order the incremental calls below use,
    // even though rebuild() only ever sees one exercise's subsequence at a
    // time (a monotonic global order is still monotonic once filtered to any
    // subset).
    let performedAt = START;
    const insertedCandidates: { exerciseId: string; candidate: RecordCandidateSet }[] = [];

    for (let round = 0; round < SETS_PER_EXERCISE / 5; round += 1) {
      for (const exerciseId of exerciseIds) {
        const sessionId = sessionsByExercise.get(exerciseId)![round]!;
        for (let setIndex = 0; setIndex < 5; setIndex += 1) {
          performedAt += 1000;
          const setType = SET_TYPE_POOL[Math.floor(rand() * SET_TYPE_POOL.length)]!;
          const weightKg = Math.round((20 + rand() * 130) / 2.5) * 2.5;
          const reps = 1 + Math.floor(rand() * 12);
          const candidate = await insertCandidateSet(db, exerciseId, {
            sessionId,
            setType,
            weightKg,
            reps,
            performedAt,
          });
          insertedCandidates.push({ exerciseId, candidate });
        }
      }
    }

    // Path 1: incremental evaluation, in the exact order the sets were
    // "completed" (insertion order == performedAt order by construction).
    for (const { exerciseId, candidate } of insertedCandidates) {
      await repo.evaluateAndUpsert(exerciseId, candidate, db);
    }
    const incrementalResult = await readComparableRecords(db);
    expect(incrementalResult.length).toBeGreaterThan(0);

    // Path 2: wipe and fully rebuild from workout_set alone, using a fresh
    // repository instance (same db, same settings - rebuild must not depend
    // on any in-memory state the first repo instance accumulated).
    const rebuildRepo = new SqlitePersonalRecordRepository({ db, clock, idGenerator, settings });
    await rebuildRepo.rebuild();
    const rebuiltResult = await readComparableRecords(db);

    expect(rebuiltResult).toEqual(incrementalResult);
  });

  /**
   * The fixed-fixture test above is a single, deterministic, "non-trivial
   * synthetic history" - real, but only one draw from a huge space of
   * possible histories. ADR-0015 frames the incremental/rebuild equivalence
   * as the cache's entire justification, so this property-based version
   * exists to stress corner cases a single fixed seed only hits by luck (or
   * doesn't hit at all): a rep-bucket record tied then genuinely beaten
   * later, a `weight_at_reps` bucket never hit by any set, an exercise whose
   * *entire* history is ineligible (`warmup`/`drop`/`assisted`/`partial`)
   * sets - zero eligible sets ever - and several sessions per exercise whose
   * `achieved_at`/`previous_value` chain has to stay correctly ordered.
   * `numRuns` is kept modest (histories are already small, 0-12 sets across
   * up to 3 exercises) since each run pays for a real `:memory:` schema
   * application plus real transactional writes, not because the property
   * itself is expensive to check.
   */
  it('produces an identical personal_record table to incremental evaluation for randomized, per-exercise mixed-eligibility histories (property-based)', async () => {
    const setTypeArb = fc.constantFrom<CandidateSetType>(
      'normal',
      'failure',
      'warmup',
      'drop',
      'assisted',
      'partial',
    );
    // A small, overlapping weight domain (rather than a wide continuous
    // range) makes a tie - "beaten later by a strictly greater value", per
    // this repository's documented tie-break rule - a routine generated
    // outcome rather than a rare coincidence.
    const weightArb = fc.constantFrom(20, 25, 30, 35, 40, 45, 50);
    // 1-12 spans every WEIGHT_AT_REPS_BUCKETS value (1,2,3,5,8,10,12) and
    // every non-bucket value in between (4,6,7,9,11), so both "sets a
    // weight_at_reps record" and "never touches that record type" show up
    // without a dedicated branch in the generator.
    const repsArb = fc.integer({ min: 1, max: 12 });
    const setArb = fc.record({ setType: setTypeArb, weightKg: weightArb, reps: repsArb });
    // A 0-length history is deliberate: an exercise whose entire generated
    // history happens to be ineligible sets (or no sets at all) - zero
    // eligible sets ever - must equivalence-match too (both paths produce an
    // empty slice of the table), not just the eligible-heavy case the fixed
    // fixture above already covers.
    const exerciseHistoryArb = fc.array(setArb, { maxLength: 12 });
    const historiesArb = fc.array(exerciseHistoryArb, { minLength: 1, maxLength: 3 });

    await fc.assert(
      fc.asyncProperty(historiesArb, async (exerciseHistories) => {
        const { db, clock, idGenerator, settings, repo } = setup();
        // Only used to spread a given exercise's sets across its own
        // sessions - never affects the compared values themselves, so no
        // seed-reproducibility concern beyond what fast-check's own seeding
        // already provides for the arbitrary.
        const rand = mulberry32(0xf00d);
        let performedAt = START;
        const insertedCandidates: { exerciseId: string; candidate: RecordCandidateSet }[] = [];

        for (let exIndex = 0; exIndex < exerciseHistories.length; exIndex += 1) {
          const history = exerciseHistories[exIndex]!;
          const exerciseId = await insertExercise(db, {
            id: `ex-${exIndex}`,
            nameEn: `Exercise ${exIndex}`,
          });
          // Several sessions per exercise once there is enough history to
          // spread around - "interleaved sessions" from this one exercise's
          // own point of view, exercising the achieved_at/previous_value
          // chain across session boundaries.
          const sessionCount = Math.min(3, Math.max(1, Math.ceil(history.length / 4)));
          const sessionIds: string[] = [];
          for (let s = 0; s < sessionCount; s += 1) {
            sessionIds.push(await insertWorkoutSession(db, { now: START, status: 'completed' }));
          }

          for (const generatedSet of history) {
            performedAt += 1000;
            const sessionId = sessionIds[Math.floor(rand() * sessionIds.length)]!;
            const candidate = await insertCandidateSet(db, exerciseId, {
              sessionId,
              setType: generatedSet.setType,
              weightKg: generatedSet.weightKg,
              reps: generatedSet.reps,
              performedAt,
            });
            insertedCandidates.push({ exerciseId, candidate });
          }
        }

        // Path 1: incremental evaluation, in insertion (== performed_at)
        // order.
        for (const { exerciseId, candidate } of insertedCandidates) {
          await repo.evaluateAndUpsert(exerciseId, candidate, db);
        }
        const incrementalResult = await readComparableRecords(db);

        // Path 2: wipe-free full rebuild from workout_set alone, via a fresh
        // repository instance over the same db - same reasoning as the fixed
        // fixture test above.
        const rebuildRepo = new SqlitePersonalRecordRepository({
          db,
          clock,
          idGenerator,
          settings,
        });
        await rebuildRepo.rebuild();
        const rebuiltResult = await readComparableRecords(db);

        expect(rebuiltResult).toEqual(incrementalResult);
      }),
      { numRuns: 15 },
    );
  });

  it('scoping rebuild() to specific exerciseIds leaves other exercises untouched', async () => {
    const { db, repo } = setup();
    const exerciseA = await insertExercise(db, { id: 'ex-a' });
    const exerciseB = await insertExercise(db, { id: 'ex-b' });
    await insertCandidateSet(db, exerciseA, { weightKg: 100, reps: 5, performedAt: START });
    await insertCandidateSet(db, exerciseB, { weightKg: 60, reps: 8, performedAt: START });

    await repo.rebuild([exerciseA]);

    const currentA = await repo.listCurrent(exerciseA);
    const currentB = await repo.listCurrent(exerciseB);
    expect(currentA.length).toBeGreaterThan(0);
    expect(currentB).toEqual([]);
  });

  it('a default (no exerciseIds) rebuild clears stale records for an exercise whose only eligible set was soft-deleted', async () => {
    const { db, repo } = setup();
    const exerciseId = await insertExercise(db, { id: 'ex-1' });
    const candidate = await insertCandidateSet(db, exerciseId, {
      weightKg: 100,
      reps: 5,
      performedAt: START,
    });

    await repo.rebuild([exerciseId]);
    expect((await repo.listCurrent(exerciseId)).length).toBeGreaterThan(0);

    await db.run('UPDATE workout_set SET deleted_at = ? WHERE id = ?', [
      START + 1,
      candidate.workoutSetId,
    ]);

    await repo.rebuild();
    expect(await repo.listCurrent(exerciseId)).toEqual([]);
  });
});
