import { createTestDatabase } from '@/database/node/createTestDatabase';
import { SqliteExerciseHistoryRepository } from '@/features/workout-logging/repository/SqliteExerciseHistoryRepository';
import {
  insertExercise,
  insertWorkoutSession,
  insertSessionExercise,
  insertWorkoutSet,
} from '../../../database/helpers/fixtures';

const START = Date.UTC(2026, 7, 6, 18, 0, 0);

function setup() {
  const db = createTestDatabase();
  const repo = new SqliteExerciseHistoryRepository({ db });
  return { db, repo };
}

describe('SqliteExerciseHistoryRepository.getPreviousPerformance()', () => {
  it('returns null when the exercise has no completed set anywhere', async () => {
    const { db, repo } = setup();
    const exerciseId = await insertExercise(db, { id: 'ex-1' });

    expect(await repo.getPreviousPerformance(exerciseId)).toBeNull();
  });

  it('returns the most recent past session, with every completed set for the exercise in it, oldest to newest', async () => {
    const { db, repo } = setup();
    const exerciseId = await insertExercise(db, { id: 'ex-1' });

    const olderSession = await insertWorkoutSession(db, {
      status: 'completed',
      now: START,
      localDate: '2026-08-01',
    });
    const olderSessionExercise = await insertSessionExercise(db, olderSession, exerciseId, {
      now: START,
    });
    await insertWorkoutSet(db, olderSessionExercise, olderSession, exerciseId, {
      weightKg: 90,
      reps: 8,
      performedAt: START,
    });

    const newerSession = await insertWorkoutSession(db, {
      status: 'completed',
      now: START + 86_400_000,
      localDate: '2026-08-06',
    });
    const newerSessionExercise = await insertSessionExercise(db, newerSession, exerciseId, {
      now: START + 86_400_000,
    });
    await insertWorkoutSet(db, newerSessionExercise, newerSession, exerciseId, {
      setType: 'warmup',
      weightKg: 40,
      reps: 10,
      performedAt: START + 86_400_000,
    });
    await insertWorkoutSet(db, newerSessionExercise, newerSession, exerciseId, {
      weightKg: 100,
      reps: 5,
      performedAt: START + 86_400_000 + 60_000,
    });

    const result = await repo.getPreviousPerformance(exerciseId);

    expect(result?.sessionId).toBe(newerSession);
    expect(result?.localDate).toBe('2026-08-06');
    expect(result?.sets).toHaveLength(2);
    expect(
      result?.sets.map((s) => ({ setType: s.setType, weightKg: s.weightKg, reps: s.reps })),
    ).toEqual([
      { setType: 'warmup', weightKg: 40, reps: 10 },
      { setType: 'normal', weightKg: 100, reps: 5 },
    ]);
  });

  it('beforeSessionId excludes that exact session, returning the one before it (the "in-progress session already has sets" case)', async () => {
    const { db, repo } = setup();
    const exerciseId = await insertExercise(db, { id: 'ex-1' });

    const pastSession = await insertWorkoutSession(db, { status: 'completed', now: START });
    const pastSessionExercise = await insertSessionExercise(db, pastSession, exerciseId, {
      now: START,
    });
    await insertWorkoutSet(db, pastSessionExercise, pastSession, exerciseId, {
      weightKg: 90,
      reps: 8,
      performedAt: START,
    });

    // A superset re-add or an already-completed set in the *current*
    // in-progress session for the same exercise - must not be mistaken for
    // "the previous session".
    const currentSession = await insertWorkoutSession(db, {
      status: 'in_progress',
      now: START + 3600_000,
    });
    const currentSessionExercise = await insertSessionExercise(db, currentSession, exerciseId, {
      now: START + 3600_000,
    });
    await insertWorkoutSet(db, currentSessionExercise, currentSession, exerciseId, {
      weightKg: 95,
      reps: 6,
      performedAt: START + 3600_000,
    });

    const result = await repo.getPreviousPerformance(exerciseId, currentSession);
    expect(result?.sessionId).toBe(pastSession);
  });
});

describe('SqliteExerciseHistoryRepository.getBestPerformance()', () => {
  it('returns null when the exercise has no eligible (normal/failure) set', async () => {
    const { db, repo } = setup();
    const exerciseId = await insertExercise(db, { id: 'ex-1' });
    const session = await insertWorkoutSession(db, { status: 'completed', now: START });
    const sessionExercise = await insertSessionExercise(db, session, exerciseId, { now: START });
    await insertWorkoutSet(db, sessionExercise, session, exerciseId, {
      setType: 'warmup',
      weightKg: 40,
      reps: 10,
      performedAt: START,
    });

    expect(await repo.getBestPerformance(exerciseId)).toBeNull();
  });

  it('resolves best weight, best reps and best set volume independently, each from its own set', async () => {
    const { db, repo } = setup();
    const exerciseId = await insertExercise(db, { id: 'ex-1' });
    const session = await insertWorkoutSession(db, { status: 'completed', now: START });
    const sessionExercise = await insertSessionExercise(db, session, exerciseId, { now: START });

    // Heaviest weight (120kg x 2 = 240 volume).
    await insertWorkoutSet(db, sessionExercise, session, exerciseId, {
      weightKg: 120,
      reps: 2,
      performedAt: START,
    });
    // Most reps (40kg x 20 = 800 volume - also the best set volume).
    await insertWorkoutSet(db, sessionExercise, session, exerciseId, {
      weightKg: 40,
      reps: 20,
      performedAt: START + 1000,
    });
    // Neither best weight, best reps, nor best volume.
    await insertWorkoutSet(db, sessionExercise, session, exerciseId, {
      weightKg: 80,
      reps: 8,
      performedAt: START + 2000,
    });

    const result = await repo.getBestPerformance(exerciseId);

    expect(result).toMatchObject({
      bestWeightKg: 120,
      bestReps: 20,
      bestSetVolumeKg: 800,
    });
    expect(result?.bestWeightAchievedAt).toBe(START);
    expect(result?.bestRepsAchievedAt).toBe(START + 1000);
    expect(result?.bestSetVolumeAchievedAt).toBe(START + 1000);
  });
});

describe('SqliteExerciseHistoryRepository.listRecentSessionsForExercise()', () => {
  it('orders sessions most-recent-first, respects the limit, and aggregates per session', async () => {
    const { db, repo } = setup();
    const exerciseId = await insertExercise(db, { id: 'ex-1' });

    for (let i = 0; i < 3; i += 1) {
      const sessionAt = START + i * 86_400_000;
      const session = await insertWorkoutSession(db, {
        status: 'completed',
        now: sessionAt,
        localDate: `2026-08-0${i + 1}`,
      });
      const sessionExercise = await insertSessionExercise(db, session, exerciseId, {
        now: sessionAt,
      });
      await insertWorkoutSet(db, sessionExercise, session, exerciseId, {
        weightKg: 100 + i,
        reps: 5,
        performedAt: sessionAt,
      });
      await insertWorkoutSet(db, sessionExercise, session, exerciseId, {
        weightKg: 90 + i,
        reps: 8,
        performedAt: sessionAt + 1000,
      });
    }

    const results = await repo.listRecentSessionsForExercise(exerciseId, 2);

    expect(results).toHaveLength(2);
    // Most recent (i=2) first.
    expect(results[0]).toMatchObject({
      localDate: '2026-08-03',
      setCount: 2,
      topSetWeightKg: 102,
      totalVolumeKg: 102 * 5 + 92 * 8,
    });
    expect(results[1]).toMatchObject({ localDate: '2026-08-02' });
  });
});
