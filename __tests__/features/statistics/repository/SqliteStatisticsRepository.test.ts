import { createTestDatabase } from '@/database/node/createTestDatabase';
import { SqliteStatisticsRepository } from '@/features/statistics/repository/SqliteStatisticsRepository';
import type { DatabaseContext } from '@/repositories/contracts/database';
import { SqliteSettingsRepository } from '@/repositories/settings';
import { FixedClock } from '@/services/clock';
import {
  insertExercise,
  insertSessionExercise,
  insertWorkoutSession,
  insertWorkoutSet,
} from '../../../database/helpers/fixtures';

const START = Date.UTC(2026, 7, 6, 18, 0, 0);

function setup() {
  const db = createTestDatabase();
  const clock = new FixedClock(START);
  const settings = new SqliteSettingsRepository(db, clock);
  const repo = new SqliteStatisticsRepository({ db, settings });
  return { db, settings, repo };
}

type SetType = 'warmup' | 'normal' | 'drop' | 'failure' | 'assisted' | 'partial';

/**
 * Inserts one completed, non-deleted working set on `localDate` for
 * `exerciseId` - a fresh `workout_session` + `session_exercise` +
 * `workout_set` per call, mirroring `SqlitePersonalRecordRepository.test.ts`'s
 * `insertCandidateSet` precedent. Every knob defaults to "counts toward every
 * aggregate" so a test only has to override what it's actually varying.
 */
async function seedWorkingSet(
  db: DatabaseContext,
  exerciseId: string,
  overrides: {
    localDate: string;
    weightKg?: number | null;
    reps?: number | null;
    setType?: SetType;
    performedAt?: number;
    sessionStatus?: 'completed' | 'in_progress' | 'discarded';
    sessionDeletedAt?: number | null;
    setDeletedAt?: number | null;
  },
): Promise<{ sessionId: string; setId: string }> {
  const sessionId = await insertWorkoutSession(db, {
    status: overrides.sessionStatus ?? 'completed',
    now: START,
    localDate: overrides.localDate,
    deletedAt: overrides.sessionDeletedAt ?? null,
  });
  const sessionExerciseId = await insertSessionExercise(db, sessionId, exerciseId, { now: START });
  const setId = await insertWorkoutSet(db, sessionExerciseId, sessionId, exerciseId, {
    weightKg: overrides.weightKg ?? 50,
    reps: overrides.reps ?? 10,
    setType: overrides.setType ?? 'normal',
    performedAt: overrides.performedAt ?? START,
    now: START,
    deletedAt: overrides.setDeletedAt ?? null,
  });
  return { sessionId, setId };
}

describe('SqliteStatisticsRepository.volumeByPeriod()', () => {
  it('gap-fills every day with 0 when no set falls in it, day bucket', async () => {
    const { db, repo } = setup();
    const exerciseId = await insertExercise(db);
    await seedWorkingSet(db, exerciseId, { localDate: '2026-08-01', weightKg: 50, reps: 10 }); // 500
    await seedWorkingSet(db, exerciseId, { localDate: '2026-08-01', weightKg: 20, reps: 5 }); // 100 -> day total 600
    // 2026-08-02: no data at all.
    await seedWorkingSet(db, exerciseId, { localDate: '2026-08-03', weightKg: 100, reps: 5 }); // 500

    const result = await repo.volumeByPeriod('2026-08-01', '2026-08-03', 'day');

    expect(result).toEqual([
      { bucketStart: '2026-08-01', value: 600 },
      { bucketStart: '2026-08-02', value: 0 },
      { bucketStart: '2026-08-03', value: 500 },
    ]);
  });

  it('excludes a soft-deleted set and a non-completed session, even inside the requested range', async () => {
    const { db, repo } = setup();
    const exerciseId = await insertExercise(db);
    await seedWorkingSet(db, exerciseId, { localDate: '2026-08-04', weightKg: 50, reps: 10 }); // 500, counts
    // Soft-deleted set - must not count despite a real weight/reps.
    await seedWorkingSet(db, exerciseId, {
      localDate: '2026-08-04',
      weightKg: 999,
      reps: 999,
      setDeletedAt: START,
    });
    // In-progress session's set - must not count.
    await seedWorkingSet(db, exerciseId, {
      localDate: '2026-08-04',
      weightKg: 999,
      reps: 999,
      sessionStatus: 'in_progress',
    });
    // Discarded session's set - must not count.
    await seedWorkingSet(db, exerciseId, {
      localDate: '2026-08-04',
      weightKg: 999,
      reps: 999,
      sessionStatus: 'discarded',
    });
    // Soft-deleted (but otherwise completed) session's set - must not count.
    await seedWorkingSet(db, exerciseId, {
      localDate: '2026-08-04',
      weightKg: 999,
      reps: 999,
      sessionDeletedAt: START,
    });

    const result = await repo.volumeByPeriod('2026-08-04', '2026-08-04', 'day');

    expect(result).toEqual([{ bucketStart: '2026-08-04', value: 500 }]);
  });

  it('groups multiple days into the correct Monday-start bucket, week granularity', async () => {
    const { db, repo } = setup();
    const exerciseId = await insertExercise(db);
    // 2026-08-01 is a Saturday - belongs to the ISO week starting 2026-07-27.
    await seedWorkingSet(db, exerciseId, { localDate: '2026-08-01', weightKg: 10, reps: 10 }); // 100
    // 2026-08-04 (Tue) and 2026-08-06 (Thu) both belong to the week starting 2026-08-03.
    await seedWorkingSet(db, exerciseId, { localDate: '2026-08-04', weightKg: 50, reps: 10 }); // 500
    await seedWorkingSet(db, exerciseId, { localDate: '2026-08-06', weightKg: 30, reps: 10 }); // 300
    // 2026-08-10 (Mon) starts its own week.
    await seedWorkingSet(db, exerciseId, { localDate: '2026-08-10', weightKg: 20, reps: 10 }); // 200

    const result = await repo.volumeByPeriod('2026-08-01', '2026-08-10', 'week');

    expect(result).toEqual([
      { bucketStart: '2026-07-27', value: 100 },
      { bucketStart: '2026-08-03', value: 800 },
      { bucketStart: '2026-08-10', value: 200 },
    ]);
  });

  it('groups multiple weeks into the correct 1st-of-month bucket, month granularity', async () => {
    const { db, repo } = setup();
    const exerciseId = await insertExercise(db);
    await seedWorkingSet(db, exerciseId, { localDate: '2026-01-05', weightKg: 10, reps: 10 }); // 100
    await seedWorkingSet(db, exerciseId, { localDate: '2026-01-25', weightKg: 20, reps: 10 }); // 200 -> Jan total 300
    // February: no data at all.
    await seedWorkingSet(db, exerciseId, { localDate: '2026-03-15', weightKg: 5, reps: 10 }); // 50

    const result = await repo.volumeByPeriod('2026-01-01', '2026-03-31', 'month');

    expect(result).toEqual([
      { bucketStart: '2026-01-01', value: 300 },
      { bucketStart: '2026-02-01', value: 0 },
      { bucketStart: '2026-03-01', value: 50 },
    ]);
  });

  it('flows warmup/assisted/partial sets through as 0 volume (v_working_set semantics)', async () => {
    const { db, repo } = setup();
    const exerciseId = await insertExercise(db);
    await seedWorkingSet(db, exerciseId, {
      localDate: '2026-08-01',
      weightKg: 50,
      reps: 10,
      setType: 'normal',
    }); // 500
    await seedWorkingSet(db, exerciseId, {
      localDate: '2026-08-01',
      weightKg: 100,
      reps: 10,
      setType: 'warmup',
    }); // 0
    await seedWorkingSet(db, exerciseId, {
      localDate: '2026-08-01',
      weightKg: 100,
      reps: 10,
      setType: 'assisted',
    }); // 0
    await seedWorkingSet(db, exerciseId, {
      localDate: '2026-08-01',
      weightKg: 100,
      reps: 10,
      setType: 'partial',
    }); // 0

    const result = await repo.volumeByPeriod('2026-08-01', '2026-08-01', 'day');

    expect(result).toEqual([{ bucketStart: '2026-08-01', value: 500 }]);
  });
});

describe('SqliteStatisticsRepository.sessionFrequency()', () => {
  it('counts only completed, non-deleted sessions per bucket, gap-filled to 0', async () => {
    const { db, repo } = setup();
    await insertWorkoutSession(db, { status: 'completed', now: START, localDate: '2026-08-01' });
    await insertWorkoutSession(db, { status: 'completed', now: START, localDate: '2026-08-01' });
    // 2026-08-02: no sessions at all.
    await insertWorkoutSession(db, { status: 'completed', now: START, localDate: '2026-08-03' });
    await insertWorkoutSession(db, { status: 'in_progress', now: START, localDate: '2026-08-03' });
    await insertWorkoutSession(db, { status: 'discarded', now: START, localDate: '2026-08-03' });
    await insertWorkoutSession(db, {
      status: 'completed',
      now: START,
      localDate: '2026-08-03',
      deletedAt: START,
    });

    const result = await repo.sessionFrequency('2026-08-01', '2026-08-03', 'day');

    expect(result).toEqual([
      { bucketStart: '2026-08-01', value: 2 },
      { bucketStart: '2026-08-02', value: 0 },
      { bucketStart: '2026-08-03', value: 1 },
    ]);
  });
});

describe('SqliteStatisticsRepository.durationTrend()', () => {
  it('averages (not sums) duration_seconds per bucket, rounded', async () => {
    const { db, repo } = setup();
    await insertWorkoutSession(db, {
      status: 'completed',
      now: START,
      localDate: '2026-08-01',
      durationSeconds: 1800,
    });
    await insertWorkoutSession(db, {
      status: 'completed',
      now: START,
      localDate: '2026-08-01',
      durationSeconds: 2700,
    });
    // Must not affect the average: not completed / soft-deleted.
    await insertWorkoutSession(db, {
      status: 'in_progress',
      now: START,
      localDate: '2026-08-01',
    });
    await insertWorkoutSession(db, {
      status: 'completed',
      now: START,
      localDate: '2026-08-01',
      durationSeconds: 999_999,
      deletedAt: START,
    });

    const result = await repo.durationTrend('2026-08-01', '2026-08-01', 'day');

    expect(result).toEqual([{ bucketStart: '2026-08-01', value: Math.round((1800 + 2700) / 2) }]);
  });

  it('gap-fills a bucket with no sessions to 0, not null', async () => {
    const { db, repo } = setup();
    await insertWorkoutSession(db, {
      status: 'completed',
      now: START,
      localDate: '2026-08-01',
      durationSeconds: 1200,
    });

    const result = await repo.durationTrend('2026-08-01', '2026-08-02', 'day');

    expect(result).toEqual([
      { bucketStart: '2026-08-01', value: 1200 },
      { bucketStart: '2026-08-02', value: 0 },
    ]);
  });
});

describe('SqliteStatisticsRepository.muscleGroupVolume()', () => {
  it('groups by exercise.body_part directly, buckets a null body_part under "other", orders by volume descending, and omits body parts with no working sets', async () => {
    const { db, repo } = setup();
    const upperA = await insertExercise(db, { bodyPart: 'upper' });
    const upperB = await insertExercise(db, { bodyPart: 'upper' });
    const lower = await insertExercise(db, { bodyPart: 'lower' });
    const custom = await insertExercise(db, { bodyPart: null });
    // No working sets at all for this one - must not appear as a 0-volume row.
    await insertExercise(db, { bodyPart: 'core' });

    await seedWorkingSet(db, upperA, { localDate: '2026-08-01', weightKg: 50, reps: 10 }); // 500
    await seedWorkingSet(db, upperB, { localDate: '2026-08-02', weightKg: 20, reps: 10 }); // 200 -> upper 700
    await seedWorkingSet(db, lower, { localDate: '2026-08-01', weightKg: 30, reps: 10 }); // 300
    await seedWorkingSet(db, custom, { localDate: '2026-08-01', weightKg: 10, reps: 10 }); // 100 -> other

    const result = await repo.muscleGroupVolume('2026-08-01', '2026-08-31');

    expect(result).toEqual([
      { bodyPart: 'upper', volumeKg: 700 },
      { bodyPart: 'lower', volumeKg: 300 },
      { bodyPart: 'other', volumeKg: 100 },
    ]);
  });

  it('excludes a soft-deleted set entirely rather than showing a 0-volume row for its body part', async () => {
    const { db, repo } = setup();
    const arms = await insertExercise(db, { bodyPart: 'arms' });
    await seedWorkingSet(db, arms, {
      localDate: '2026-08-01',
      weightKg: 999,
      reps: 999,
      setDeletedAt: START,
    });

    const result = await repo.muscleGroupVolume('2026-08-01', '2026-08-31');

    expect(result).toEqual([]);
  });
});

describe('SqliteStatisticsRepository.exerciseProgression()', () => {
  it('resolves e1RM via the Epley formula by default', async () => {
    const { db, repo } = setup();
    const exerciseId = await insertExercise(db);
    await seedWorkingSet(db, exerciseId, { localDate: '2026-08-01', weightKg: 100, reps: 5 });

    const result = await repo.exerciseProgression(
      exerciseId,
      '2026-08-01',
      '2026-08-01',
      'day',
      'e1rm',
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.bucketStart).toBe('2026-08-01');
    expect(result[0]!.value).toBeCloseTo(100 * (1 + 5 / 30), 5); // 116.6667
  });

  it('resolves e1RM via the Brzycki formula when oneRm.formula is set explicitly', async () => {
    const { db, repo, settings } = setup();
    await settings.set('oneRm.formula', 'brzycki');
    const exerciseId = await insertExercise(db);
    await seedWorkingSet(db, exerciseId, { localDate: '2026-08-01', weightKg: 100, reps: 5 });

    const result = await repo.exerciseProgression(
      exerciseId,
      '2026-08-01',
      '2026-08-01',
      'day',
      'e1rm',
    );

    expect(result[0]!.value).toBeCloseTo((100 * 36) / 32, 5); // 112.5
  });

  it('top_set takes the max weight among normal/failure sets only, excluding a heavier warmup or assisted set', async () => {
    const { db, repo } = setup();
    const exerciseId = await insertExercise(db);
    await seedWorkingSet(db, exerciseId, {
      localDate: '2026-08-01',
      weightKg: 200,
      reps: 5,
      setType: 'warmup',
    });
    await seedWorkingSet(db, exerciseId, {
      localDate: '2026-08-01',
      weightKg: 150,
      reps: 5,
      setType: 'assisted',
    });
    await seedWorkingSet(db, exerciseId, {
      localDate: '2026-08-01',
      weightKg: 100,
      reps: 5,
      setType: 'normal',
    });

    const result = await repo.exerciseProgression(
      exerciseId,
      '2026-08-01',
      '2026-08-01',
      'day',
      'top_set',
    );

    expect(result[0]!.value).toBe(100);
  });

  it('volume metric sums volume_kg across every set type in the bucket, including a 0-volume warmup', async () => {
    const { db, repo } = setup();
    const exerciseId = await insertExercise(db);
    await seedWorkingSet(db, exerciseId, {
      localDate: '2026-08-01',
      weightKg: 50,
      reps: 10,
      setType: 'normal',
    }); // 500
    await seedWorkingSet(db, exerciseId, {
      localDate: '2026-08-01',
      weightKg: 999,
      reps: 999,
      setType: 'warmup',
    }); // 0
    await seedWorkingSet(db, exerciseId, {
      localDate: '2026-08-01',
      weightKg: 20,
      reps: 10,
      setType: 'failure',
    }); // 200

    const result = await repo.exerciseProgression(
      exerciseId,
      '2026-08-01',
      '2026-08-01',
      'day',
      'volume',
    );

    expect(result[0]!.value).toBe(700);
  });

  it('returns null for top_set/e1rm in a bucket with only ineligible sets, but 0 for volume', async () => {
    const { db, repo } = setup();
    const exerciseId = await insertExercise(db);
    await seedWorkingSet(db, exerciseId, {
      localDate: '2026-08-01',
      weightKg: 999,
      reps: 5,
      setType: 'warmup',
    });

    const topSet = await repo.exerciseProgression(
      exerciseId,
      '2026-08-01',
      '2026-08-01',
      'day',
      'top_set',
    );
    const e1rm = await repo.exerciseProgression(
      exerciseId,
      '2026-08-01',
      '2026-08-01',
      'day',
      'e1rm',
    );
    const volume = await repo.exerciseProgression(
      exerciseId,
      '2026-08-01',
      '2026-08-01',
      'day',
      'volume',
    );

    expect(topSet[0]!.value).toBeNull();
    expect(e1rm[0]!.value).toBeNull();
    expect(volume[0]!.value).toBe(0);
  });

  it('returns null for top_set/e1rm and 0 for volume in a gap bucket with no data at all', async () => {
    const { db, repo } = setup();
    const exerciseId = await insertExercise(db);
    await seedWorkingSet(db, exerciseId, { localDate: '2026-08-01', weightKg: 100, reps: 5 });

    // 2026-08-02 has zero sets for this exercise.
    const topSet = await repo.exerciseProgression(
      exerciseId,
      '2026-08-01',
      '2026-08-02',
      'day',
      'top_set',
    );
    const volume = await repo.exerciseProgression(
      exerciseId,
      '2026-08-01',
      '2026-08-02',
      'day',
      'volume',
    );

    expect(topSet[1]!.value).toBeNull();
    expect(volume[1]!.value).toBe(0);
  });

  it('scopes results to the given exerciseId, ignoring a different exercise in the same date range', async () => {
    const { db, repo } = setup();
    const exerciseA = await insertExercise(db);
    const exerciseB = await insertExercise(db);
    await seedWorkingSet(db, exerciseA, { localDate: '2026-08-01', weightKg: 100, reps: 5 });
    await seedWorkingSet(db, exerciseB, { localDate: '2026-08-01', weightKg: 999, reps: 5 });

    const result = await repo.exerciseProgression(
      exerciseA,
      '2026-08-01',
      '2026-08-01',
      'day',
      'top_set',
    );

    expect(result[0]!.value).toBe(100);
  });

  it('excludes a soft-deleted set from the series', async () => {
    const { db, repo } = setup();
    const exerciseId = await insertExercise(db);
    await seedWorkingSet(db, exerciseId, {
      localDate: '2026-08-01',
      weightKg: 999,
      reps: 5,
      setDeletedAt: START,
    });

    const result = await repo.exerciseProgression(
      exerciseId,
      '2026-08-01',
      '2026-08-01',
      'day',
      'top_set',
    );

    expect(result[0]!.value).toBeNull();
  });
});

describe('SqliteStatisticsRepository.yearlyHeatmap()', () => {
  it('returns every day of a non-leap year (2026), 365 rows, first/last day present', async () => {
    const { repo } = setup();

    const result = await repo.yearlyHeatmap(2026);

    expect(result).toHaveLength(365);
    expect(result[0]!.localDate).toBe('2026-01-01');
    expect(result[result.length - 1]!.localDate).toBe('2026-12-31');
  });

  it('returns every day of a leap year (2024), 366 rows', async () => {
    const { repo } = setup();

    const result = await repo.yearlyHeatmap(2024);

    expect(result).toHaveLength(366);
    expect(result[0]!.localDate).toBe('2024-01-01');
    expect(result[result.length - 1]!.localDate).toBe('2024-12-31');
  });

  it('wires raw SQL rows through computeYearlyHeatmap: untrained days are level 0, and the highest-volume trained day outranks the lowest', async () => {
    const { db, repo } = setup();
    const exerciseId = await insertExercise(db);
    await seedWorkingSet(db, exerciseId, { localDate: '2026-02-01', weightKg: 10, reps: 1 }); // 10
    await seedWorkingSet(db, exerciseId, { localDate: '2026-02-02', weightKg: 20, reps: 1 }); // 20
    await seedWorkingSet(db, exerciseId, { localDate: '2026-02-03', weightKg: 30, reps: 1 }); // 30
    await seedWorkingSet(db, exerciseId, { localDate: '2026-02-04', weightKg: 100, reps: 1 }); // 100

    const result = await repo.yearlyHeatmap(2026);
    const byDate = new Map(result.map((day) => [day.localDate, day]));

    // An untrained day anywhere in the year is level 0.
    expect(byDate.get('2026-06-15')!.level).toBe(0);
    // Every trained day is at least level 1.
    expect(byDate.get('2026-02-01')!.level).toBeGreaterThanOrEqual(1);
    // The clearly-highest-volume day outranks the clearly-lowest-volume day.
    expect(byDate.get('2026-02-04')!.level).toBeGreaterThan(byDate.get('2026-02-01')!.level);
  });

  it('excludes a soft-deleted set - a day whose only set is deleted reads as untrained (level 0)', async () => {
    const { db, repo } = setup();
    const exerciseId = await insertExercise(db);
    await seedWorkingSet(db, exerciseId, {
      localDate: '2026-05-10',
      weightKg: 999,
      reps: 999,
      setDeletedAt: START,
    });

    const result = await repo.yearlyHeatmap(2026);
    const day = result.find((row) => row.localDate === '2026-05-10');

    expect(day!.level).toBe(0);
    expect(day!.volumeKg).toBe(0);
  });
});
