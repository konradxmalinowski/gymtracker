import { createTestDatabase } from '@/database/node/createTestDatabase';
import { SqliteCalendarRepository } from '@/features/calendar/repository/SqliteCalendarRepository';
import type { DatabaseContext } from '@/repositories/contracts/database';
import {
  insertExercise,
  insertSessionExercise,
  insertWorkoutSession,
  insertWorkoutSet,
} from '../../../database/helpers/fixtures';

const START = Date.UTC(2026, 7, 6, 18, 0, 0);

function setup() {
  const db = createTestDatabase();
  const repo = new SqliteCalendarRepository({ db });
  return { db, repo };
}

/**
 * Inserts one completed, non-deleted session with one real working set on
 * `localDate`. Post-perf-fix (database-agent's concurrent follow-up to
 * test-agent's own benchmark finding - see `SqliteCalendarRepository.ts`'s
 * own header comment), `monthOverview` and `yearOverview` read from two
 * different sources, so this helper seeds both consistently rather than
 * relying on one: `monthOverview` reads `workout_session.total_volume_kg`
 * directly (a denormalized, `finish()`-time snapshot column, passed here via
 * `insertWorkoutSession`'s own `totalVolumeKg` override - defaults to
 * `weightKg * reps`, `0` when the set is soft-deleted, matching what a real
 * `finish()` call would have written), while `yearOverview` still reads
 * `v_working_set` (hence the real `workout_set` row this helper also
 * inserts). `planDayName`, when passed, is written via a raw `UPDATE`
 * afterward since the shared `insertWorkoutSession` fixture has no knob for
 * `plan_day_name_snapshot` (the same raw-SQL approach `SqlitePlanRepository.
 * test.ts`'s own session-snapshot test already uses).
 */
async function seedTrainedSession(
  db: DatabaseContext,
  overrides: {
    localDate: string;
    weightKg?: number;
    reps?: number;
    planDayName?: string | null;
    status?: 'completed' | 'in_progress' | 'discarded';
    sessionDeletedAt?: number | null;
    setDeletedAt?: number | null;
  },
): Promise<string> {
  const weightKg = overrides.weightKg ?? 50;
  const reps = overrides.reps ?? 10;
  const totalVolumeKg = overrides.setDeletedAt ? 0 : weightKg * reps;
  const sessionId = await insertWorkoutSession(db, {
    status: overrides.status ?? 'completed',
    now: START,
    localDate: overrides.localDate,
    deletedAt: overrides.sessionDeletedAt ?? null,
    totalVolumeKg,
  });
  const exerciseId = await insertExercise(db);
  const sessionExerciseId = await insertSessionExercise(db, sessionId, exerciseId, { now: START });
  await insertWorkoutSet(db, sessionExerciseId, sessionId, exerciseId, {
    weightKg,
    reps,
    performedAt: START,
    now: START,
    deletedAt: overrides.setDeletedAt ?? null,
  });
  if (overrides.planDayName !== undefined) {
    await db.run('UPDATE workout_session SET plan_day_name_snapshot = ? WHERE id = ?', [
      overrides.planDayName,
      sessionId,
    ]);
  }
  return sessionId;
}

describe('SqliteCalendarRepository.monthOverview()', () => {
  it('returns an empty array for a month with no sessions', async () => {
    const { repo } = setup();
    expect(await repo.monthOverview(2026, 8)).toEqual([]);
  });

  it('returns one CalendarDayDto per day with sessions on several different days', async () => {
    const { db, repo } = setup();
    const dayOneId = await seedTrainedSession(db, {
      localDate: '2026-08-01',
      weightKg: 50,
      reps: 10, // 500
      planDayName: 'Push Day',
    });
    const dayFifteenId = await seedTrainedSession(db, {
      localDate: '2026-08-15',
      weightKg: 30,
      reps: 10, // 300
      planDayName: null,
    });

    const result = await repo.monthOverview(2026, 8);

    expect(result).toEqual([
      {
        localDate: '2026-08-01',
        sessionIds: [dayOneId],
        planDayNames: ['Push Day'],
        totalVolumeKg: 500,
      },
      {
        localDate: '2026-08-15',
        sessionIds: [dayFifteenId],
        planDayNames: [null],
        totalVolumeKg: 300,
      },
    ]);
  });

  /**
   * `monthOverview`'s underlying query (`SqliteCalendarRepository.ts`) orders
   * by `local_date ASC` only - it has no secondary tiebreaker
   * (`started_at`, `id`, ...) for two sessions sharing the same day, so
   * SQLite's actual tie-break order is implementation-defined, not
   * guaranteed. A first draft of this test asserted a specific
   * `[morningId, eveningId]` order and was observed to fail intermittently
   * (query-plan-dependent, not a code change) - a real flaky-test root
   * cause per this project's own flaky-test protocol, traced to a genuine
   * gap in the production query rather than fixed by retrying. Reworked to
   * verify the actual documented invariant - every `sessionIds[i]` pairs
   * with the correct `planDayNames[i]` - independent of which order the two
   * sessions come back in, since the repository's own contract never
   * promised a same-day ordering. See this suite's own `SqliteCalendarRepository.ts`
   * doc comment and the state file's "found, not fixed" section for the
   * missing-tiebreaker gap itself.
   */
  it('aggregates two sessions on the same day into one CalendarDayDto with index-aligned sessionIds/planDayNames and summed totalVolumeKg', async () => {
    const { db, repo } = setup();
    const morningId = await seedTrainedSession(db, {
      localDate: '2026-08-01',
      weightKg: 50,
      reps: 10, // 500
      planDayName: 'Morning Push',
    });
    const eveningId = await seedTrainedSession(db, {
      localDate: '2026-08-01',
      weightKg: 30,
      reps: 10, // 300
      planDayName: null,
    });

    const result = await repo.monthOverview(2026, 8);

    expect(result).toHaveLength(1);
    expect(result[0]!.localDate).toBe('2026-08-01');
    expect(result[0]!.totalVolumeKg).toBe(800);
    expect(new Set(result[0]!.sessionIds)).toEqual(new Set([morningId, eveningId]));

    const planDayById = new Map(
      result[0]!.sessionIds.map((id, index) => [id, result[0]!.planDayNames[index]]),
    );
    expect(planDayById.get(morningId)).toBe('Morning Push');
    expect(planDayById.get(eveningId)).toBeNull();
  });

  it('excludes a soft-deleted session', async () => {
    const { db, repo } = setup();
    await seedTrainedSession(db, { localDate: '2026-08-01', sessionDeletedAt: START });

    expect(await repo.monthOverview(2026, 8)).toEqual([]);
  });

  it('excludes an in-progress session', async () => {
    const { db, repo } = setup();
    await seedTrainedSession(db, { localDate: '2026-08-01', status: 'in_progress' });

    expect(await repo.monthOverview(2026, 8)).toEqual([]);
  });

  it('excludes a discarded session', async () => {
    const { db, repo } = setup();
    await seedTrainedSession(db, { localDate: '2026-08-01', status: 'discarded' });

    expect(await repo.monthOverview(2026, 8)).toEqual([]);
  });

  it('is scoped to the requested month only, excluding a session in the prior or following month', async () => {
    const { db, repo } = setup();
    await seedTrainedSession(db, { localDate: '2026-07-31', weightKg: 10, reps: 10 });
    const inMonthId = await seedTrainedSession(db, {
      localDate: '2026-08-15',
      weightKg: 20,
      reps: 10,
    });
    await seedTrainedSession(db, { localDate: '2026-09-01', weightKg: 30, reps: 10 });

    const result = await repo.monthOverview(2026, 8);

    expect(result).toHaveLength(1);
    expect(result[0]!.localDate).toBe('2026-08-15');
    expect(result[0]!.sessionIds).toEqual([inMonthId]);
  });

  it('includes the first and last day of the month at its exact boundaries', async () => {
    const { db, repo } = setup();
    await seedTrainedSession(db, { localDate: '2026-08-01', weightKg: 10, reps: 10 });
    await seedTrainedSession(db, { localDate: '2026-08-31', weightKg: 10, reps: 10 });

    const result = await repo.monthOverview(2026, 8);

    expect(result.map((day) => day.localDate)).toEqual(['2026-08-01', '2026-08-31']);
  });
});

describe('SqliteCalendarRepository.yearOverview()', () => {
  it('returns an empty array for a year with no sessions', async () => {
    const { repo } = setup();
    expect(await repo.yearOverview(2026)).toEqual([]);
  });

  it('returns one row per trained day in the year', async () => {
    const { db, repo } = setup();
    await seedTrainedSession(db, { localDate: '2026-02-01', weightKg: 50, reps: 10 }); // 500
    await seedTrainedSession(db, { localDate: '2026-06-15', weightKg: 30, reps: 10 }); // 300

    const result = await repo.yearOverview(2026);

    expect(result).toEqual([
      { localDate: '2026-02-01', totalVolumeKg: 500 },
      { localDate: '2026-06-15', totalVolumeKg: 300 },
    ]);
  });

  it('excludes a day whose only session has zero volume (HAVING SUM(total_volume_kg) > 0)', async () => {
    const { db, repo } = setup();
    // A completed session with a soft-deleted set contributes 0 volume via
    // v_working_set, so v_session_summary reports total_volume_kg = 0 for it.
    await seedTrainedSession(db, { localDate: '2026-02-01', setDeletedAt: START });

    expect(await repo.yearOverview(2026)).toEqual([]);
  });

  it('sums multiple same-day sessions into one row', async () => {
    const { db, repo } = setup();
    await seedTrainedSession(db, { localDate: '2026-03-01', weightKg: 20, reps: 10 }); // 200
    await seedTrainedSession(db, { localDate: '2026-03-01', weightKg: 15, reps: 10 }); // 150

    const result = await repo.yearOverview(2026);

    expect(result).toEqual([{ localDate: '2026-03-01', totalVolumeKg: 350 }]);
  });

  it('is scoped to the requested year only, excluding December of the prior year and January of the next', async () => {
    const { db, repo } = setup();
    await seedTrainedSession(db, { localDate: '2025-12-31', weightKg: 10, reps: 10 });
    await seedTrainedSession(db, { localDate: '2026-06-15', weightKg: 20, reps: 10 }); // 200
    await seedTrainedSession(db, { localDate: '2027-01-01', weightKg: 30, reps: 10 });

    const result = await repo.yearOverview(2026);

    expect(result).toEqual([{ localDate: '2026-06-15', totalVolumeKg: 200 }]);
  });

  it('excludes a soft-deleted session even though its set would otherwise count', async () => {
    const { db, repo } = setup();
    await seedTrainedSession(db, {
      localDate: '2026-04-01',
      weightKg: 999,
      reps: 999,
      sessionDeletedAt: START,
    });

    expect(await repo.yearOverview(2026)).toEqual([]);
  });

  it('excludes an in-progress or discarded session', async () => {
    const { db, repo } = setup();
    await seedTrainedSession(db, {
      localDate: '2026-04-01',
      weightKg: 999,
      reps: 999,
      status: 'in_progress',
    });
    await seedTrainedSession(db, {
      localDate: '2026-04-02',
      weightKg: 999,
      reps: 999,
      status: 'discarded',
    });

    expect(await repo.yearOverview(2026)).toEqual([]);
  });

  it('includes the first and last day of the year at its exact boundaries', async () => {
    const { db, repo } = setup();
    await seedTrainedSession(db, { localDate: '2026-01-01', weightKg: 10, reps: 10 });
    await seedTrainedSession(db, { localDate: '2026-12-31', weightKg: 10, reps: 10 });

    const result = await repo.yearOverview(2026);

    expect(result.map((day) => day.localDate)).toEqual(['2026-01-01', '2026-12-31']);
  });
});
