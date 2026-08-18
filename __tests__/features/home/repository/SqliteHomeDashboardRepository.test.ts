import { createTestDatabase } from '@/database/node/createTestDatabase';
import { SqliteHomeDashboardRepository } from '@/features/home/repository/SqliteHomeDashboardRepository';
import {
  insertPlan,
  insertPlanDay,
  insertWorkoutSession,
} from '../../../database/helpers/fixtures';

const START = Date.UTC(2026, 7, 6, 18, 0, 0);

function setup() {
  const db = createTestDatabase();
  const repo = new SqliteHomeDashboardRepository({ db });
  return { db, repo };
}

describe('SqliteHomeDashboardRepository.getTrainingLocalDates()', () => {
  it('returns an empty array for an empty database', async () => {
    const { repo } = setup();
    expect(await repo.getTrainingLocalDates('2026-01-01')).toEqual([]);
  });

  it('returns only completed, non-deleted sessions on or after sinceLocalDate, distinct and most-recent-first', async () => {
    const { db, repo } = setup();
    await insertWorkoutSession(db, {
      status: 'completed',
      now: START,
      localDate: '2026-08-01',
    });
    // Same day, second session - must not produce a duplicate date entry.
    await insertWorkoutSession(db, {
      status: 'completed',
      now: START + 1000,
      localDate: '2026-08-01',
    });
    await insertWorkoutSession(db, {
      status: 'completed',
      now: START + 2000,
      localDate: '2026-08-05',
    });
    await insertWorkoutSession(db, {
      status: 'in_progress',
      now: START,
      localDate: '2026-08-06',
    });
    await insertWorkoutSession(db, {
      status: 'discarded',
      now: START,
      localDate: '2026-08-07',
    });
    // Before the lookback window.
    await insertWorkoutSession(db, {
      status: 'completed',
      now: START,
      localDate: '2026-07-01',
    });
    // Soft-deleted completed session - must be excluded.
    await insertWorkoutSession(db, {
      status: 'completed',
      now: START,
      localDate: '2026-08-04',
      deletedAt: START + 5000,
    });

    const result = await repo.getTrainingLocalDates('2026-08-01');
    expect(result).toEqual(['2026-08-05', '2026-08-01']);
  });
});

describe('SqliteHomeDashboardRepository.getWeeklySummary()', () => {
  it('returns all zeros when no session matches (empty database)', async () => {
    const { repo } = setup();
    expect(await repo.getWeeklySummary('2026-08-01', '2026-08-07')).toEqual({
      workouts: 0,
      sets: 0,
      volumeKg: 0,
      durationSeconds: 0,
    });
  });

  it('returns all zeros (not null) when sessions exist but none fall in range', async () => {
    const { db, repo } = setup();
    await insertWorkoutSession(db, {
      status: 'completed',
      now: START,
      localDate: '2026-01-01',
      totalVolumeKg: 500,
      totalSets: 10,
      durationSeconds: 1800,
    });

    expect(await repo.getWeeklySummary('2026-08-01', '2026-08-07')).toEqual({
      workouts: 0,
      sets: 0,
      volumeKg: 0,
      durationSeconds: 0,
    });
  });

  it('sums totals across completed, non-deleted sessions within the inclusive date range', async () => {
    const { db, repo } = setup();
    await insertWorkoutSession(db, {
      status: 'completed',
      now: START,
      localDate: '2026-08-01',
      totalVolumeKg: 500,
      totalSets: 10,
      durationSeconds: 1800,
    });
    await insertWorkoutSession(db, {
      status: 'completed',
      now: START,
      localDate: '2026-08-07',
      totalVolumeKg: 300,
      totalSets: 8,
      durationSeconds: 1200,
    });
    // In-progress - must not count.
    await insertWorkoutSession(db, {
      status: 'in_progress',
      now: START,
      localDate: '2026-08-03',
    });
    // Discarded - must not count.
    await insertWorkoutSession(db, {
      status: 'discarded',
      now: START,
      localDate: '2026-08-03',
    });
    // Soft-deleted completed - must not count.
    await insertWorkoutSession(db, {
      status: 'completed',
      now: START,
      localDate: '2026-08-03',
      totalVolumeKg: 9999,
      totalSets: 99,
      durationSeconds: 9999,
      deletedAt: START,
    });
    // Outside the range.
    await insertWorkoutSession(db, {
      status: 'completed',
      now: START,
      localDate: '2026-08-08',
      totalVolumeKg: 100,
      totalSets: 2,
      durationSeconds: 300,
    });

    expect(await repo.getWeeklySummary('2026-08-01', '2026-08-07')).toEqual({
      workouts: 2,
      sets: 18,
      volumeKg: 800,
      durationSeconds: 3000,
    });
  });
});

describe('SqliteHomeDashboardRepository.getLastCompletedSession()', () => {
  it('returns null when no completed session exists', async () => {
    const { db, repo } = setup();
    await insertWorkoutSession(db, { status: 'in_progress', now: START });
    expect(await repo.getLastCompletedSession()).toBeNull();
  });

  it('returns null when the database is empty', async () => {
    const { repo } = setup();
    expect(await repo.getLastCompletedSession()).toBeNull();
  });

  it('returns the most recently finished completed, non-deleted session', async () => {
    const { db, repo } = setup();
    await insertWorkoutSession(db, {
      status: 'completed',
      title: 'Older',
      now: START,
      finishedAt: START,
      localDate: '2026-08-01',
      totalVolumeKg: 100,
      totalSets: 5,
      durationSeconds: 600,
    });
    const newerId = await insertWorkoutSession(db, {
      status: 'completed',
      title: 'Newer',
      now: START + 86_400_000,
      finishedAt: START + 86_400_000,
      localDate: '2026-08-02',
      totalVolumeKg: 250,
      totalSets: 12,
      durationSeconds: 2400,
    });
    // Soft-deleted, finished even more recently - must be excluded.
    await insertWorkoutSession(db, {
      status: 'completed',
      title: 'Deleted',
      now: START + 2 * 86_400_000,
      finishedAt: START + 2 * 86_400_000,
      localDate: '2026-08-03',
      deletedAt: START + 2 * 86_400_000,
    });

    const result = await repo.getLastCompletedSession();
    expect(result).toEqual({
      id: newerId,
      title: 'Newer',
      localDate: '2026-08-02',
      totalVolumeKg: 250,
      totalSets: 12,
      durationSeconds: 2400,
      finishedAt: START + 86_400_000,
    });
  });
});

describe('SqliteHomeDashboardRepository.getMostRecentCompletedPlanDayId()', () => {
  it('returns null when the plan has no sessions at all', async () => {
    const { db, repo } = setup();
    const planId = await insertPlan(db);
    expect(await repo.getMostRecentCompletedPlanDayId(planId)).toBeNull();
  });

  it('returns null when the plan has sessions but none completed', async () => {
    const { db, repo } = setup();
    const planId = await insertPlan(db);
    const planDayId = await insertPlanDay(db, planId);
    await insertWorkoutSession(db, {
      status: 'in_progress',
      now: START,
      planId,
      planDayId,
    });
    await insertWorkoutSession(db, {
      status: 'discarded',
      now: START,
      planId,
      planDayId,
    });
    expect(await repo.getMostRecentCompletedPlanDayId(planId)).toBeNull();
  });

  it('returns the plan_day_id of the most recently finished completed session for that plan', async () => {
    const { db, repo } = setup();
    const planId = await insertPlan(db);
    const dayA = await insertPlanDay(db, planId, { name: 'Day A' });
    const dayB = await insertPlanDay(db, planId, { name: 'Day B' });

    await insertWorkoutSession(db, {
      status: 'completed',
      now: START,
      finishedAt: START,
      planId,
      planDayId: dayA,
    });
    await insertWorkoutSession(db, {
      status: 'completed',
      now: START + 86_400_000,
      finishedAt: START + 86_400_000,
      planId,
      planDayId: dayB,
    });
    // A different plan's session must not interfere.
    const otherPlanId = await insertPlan(db);
    const otherDay = await insertPlanDay(db, otherPlanId);
    await insertWorkoutSession(db, {
      status: 'completed',
      now: START + 2 * 86_400_000,
      finishedAt: START + 2 * 86_400_000,
      planId: otherPlanId,
      planDayId: otherDay,
    });

    expect(await repo.getMostRecentCompletedPlanDayId(planId)).toBe(dayB);
  });

  it('returns null when the most recent completed session for the plan has no plan_day_id', async () => {
    const { db, repo } = setup();
    const planId = await insertPlan(db);
    await insertWorkoutSession(db, {
      status: 'completed',
      now: START,
      finishedAt: START,
      planId,
      planDayId: null,
    });
    expect(await repo.getMostRecentCompletedPlanDayId(planId)).toBeNull();
  });
});
