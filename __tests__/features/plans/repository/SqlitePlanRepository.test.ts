import { createTestDatabase } from '@/database/node/createTestDatabase';
import { SqlitePlanRepository } from '@/features/plans/repository/SqlitePlanRepository';
import { SupersetSpansMultipleDaysError } from '@/features/plans/repository/errors';
import { RepositoryNotFoundError } from '@/repositories/base';
import type { DatabaseContext } from '@/repositories/contracts/database';
import { FixedClock } from '@/services/clock';
import { Uuid7IdGenerator } from '@/services/id';

async function setup() {
  const db = createTestDatabase();
  const clock = new FixedClock(Date.UTC(2026, 0, 1, 12));
  const idGenerator = new Uuid7IdGenerator(clock);
  const repo = new SqlitePlanRepository({ db, clock, idGenerator });
  return { db, clock, repo };
}

/** Inserts a minimal `exercise` row directly - plans only ever reference exercises, never own their lifecycle, so tests don't go through `ExerciseRepository`. */
async function insertExercise(
  db: DatabaseContext,
  overrides: Partial<{ id: string; nameEn: string }> = {},
): Promise<string> {
  const id = overrides.id ?? `exercise-${Math.random().toString(36).slice(2)}`;
  const nameEn = overrides.nameEn ?? 'Test Exercise';
  const now = Date.now();
  await db.run(
    `INSERT INTO exercise (id, source, name_en, name_search, tracking_type, created_at, updated_at)
     VALUES (?, 'catalog', ?, ?, 'weight_reps', ?, ?)`,
    [id, nameEn, nameEn.toLowerCase(), now, now],
  );
  return id;
}

describe('SqlitePlanRepository - plan CRUD', () => {
  it('createPlan assigns sequential sort_order and defaults is_active to false', async () => {
    const { repo } = await setup();
    const first = await repo.createPlan({ name: 'Push Pull Legs' });
    const second = await repo.createPlan({ name: 'Upper Lower' });

    expect(first.sortOrder).toBe(0);
    expect(second.sortOrder).toBe(1);
    expect(first.isActive).toBe(false);
    expect(second.isActive).toBe(false);
    expect(first.days).toEqual([]);
  });

  it('listPlans returns day counts and is ordered by sort_order', async () => {
    const { repo } = await setup();
    const planA = await repo.createPlan({ name: 'Plan A' });
    const planB = await repo.createPlan({ name: 'Plan B' });
    await repo.addDay(planA.id, { name: 'Day 1' });
    await repo.addDay(planA.id, { name: 'Day 2' });

    const list = await repo.listPlans();

    expect(list.map((p) => p.id)).toEqual([planA.id, planB.id]);
    expect(list[0]!.dayCount).toBe(2);
    expect(list[1]!.dayCount).toBe(0);
  });

  it('getPlan returns null for a missing id', async () => {
    const { repo } = await setup();
    expect(await repo.getPlan('does-not-exist')).toBeNull();
  });

  it('renamePlan updates the name; throws RepositoryNotFoundError for a missing id', async () => {
    const { repo } = await setup();
    const plan = await repo.createPlan({ name: 'Old Name' });

    await repo.renamePlan(plan.id, 'New Name');

    expect((await repo.getPlan(plan.id))!.name).toBe('New Name');
    await expect(repo.renamePlan('does-not-exist', 'X')).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
  });

  it('deletePlan soft-deletes; the plan disappears from getPlan/listPlans until restorePlan brings it back', async () => {
    const { repo } = await setup();
    const plan = await repo.createPlan({ name: 'Temporary Plan' });

    await repo.deletePlan(plan.id);
    expect(await repo.getPlan(plan.id)).toBeNull();
    expect(await repo.listPlans()).toEqual([]);

    await repo.restorePlan(plan.id);
    expect(await repo.getPlan(plan.id)).not.toBeNull();
    expect((await repo.listPlans()).map((p) => p.id)).toEqual([plan.id]);
  });

  it('deletePlan on a missing id throws RepositoryNotFoundError', async () => {
    const { repo } = await setup();
    await expect(repo.deletePlan('does-not-exist')).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });
});

describe('SqlitePlanRepository.setActivePlan()', () => {
  it('activates a plan', async () => {
    const { repo } = await setup();
    const plan = await repo.createPlan({ name: 'A Plan' });

    await repo.setActivePlan(plan.id);

    expect((await repo.getPlan(plan.id))!.isActive).toBe(true);
  });

  it('switching the active plan clears the previous one - never two active, in the same transaction', async () => {
    const { db, repo } = await setup();
    const planA = await repo.createPlan({ name: 'Plan A' });
    const planB = await repo.createPlan({ name: 'Plan B' });
    const planC = await repo.createPlan({ name: 'Plan C' });

    for (const target of [planA, planB, planC, planA]) {
      await repo.setActivePlan(target.id);
      const activeRows = await db.select<{ id: string }>(
        'SELECT id FROM plan WHERE is_active = 1 AND deleted_at IS NULL',
      );
      expect(activeRows).toHaveLength(1);
      expect(activeRows[0]!.id).toBe(target.id);
    }
  });

  it('activating the already-active plan is a no-op success', async () => {
    const { repo } = await setup();
    const plan = await repo.createPlan({ name: 'A Plan' });
    await repo.setActivePlan(plan.id);

    await expect(repo.setActivePlan(plan.id)).resolves.toBeUndefined();
    expect((await repo.getPlan(plan.id))!.isActive).toBe(true);
  });

  it('throws RepositoryNotFoundError for a missing id and leaves the current active plan untouched', async () => {
    const { repo } = await setup();
    const plan = await repo.createPlan({ name: 'A Plan' });
    await repo.setActivePlan(plan.id);

    await expect(repo.setActivePlan('does-not-exist')).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
    expect((await repo.getPlan(plan.id))!.isActive).toBe(true);
  });
});

describe('SqlitePlanRepository.reorderPlans()', () => {
  it('persists the new sort_order for each id', async () => {
    const { repo } = await setup();
    const planA = await repo.createPlan({ name: 'Plan A' });
    const planB = await repo.createPlan({ name: 'Plan B' });
    const planC = await repo.createPlan({ name: 'Plan C' });

    await repo.reorderPlans([planC.id, planA.id, planB.id]);

    const list = await repo.listPlans();
    expect(list.map((p) => p.id)).toEqual([planC.id, planA.id, planB.id]);
  });

  it('a missing id rolls back the entire reorder (single transaction)', async () => {
    const { repo } = await setup();
    const planA = await repo.createPlan({ name: 'Plan A' });
    const planB = await repo.createPlan({ name: 'Plan B' });

    await expect(repo.reorderPlans([planB.id, 'does-not-exist'])).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );

    const list = await repo.listPlans();
    expect(list.map((p) => p.id)).toEqual([planA.id, planB.id]);
  });
});

describe('SqlitePlanRepository - day CRUD', () => {
  it('addDay assigns sequential sort_order; throws for a missing plan', async () => {
    const { repo } = await setup();
    const plan = await repo.createPlan({ name: 'A Plan' });

    const day1 = await repo.addDay(plan.id, { name: 'Day 1' });
    const day2 = await repo.addDay(plan.id, { name: 'Day 2' });

    expect(day1.sortOrder).toBe(0);
    expect(day2.sortOrder).toBe(1);
    expect(day1.exercises).toEqual([]);
    await expect(repo.addDay('does-not-exist', { name: 'X' })).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
  });

  it('renameDay updates the name; throws for a missing id', async () => {
    const { repo } = await setup();
    const plan = await repo.createPlan({ name: 'A Plan' });
    const day = await repo.addDay(plan.id, { name: 'Old' });

    await repo.renameDay(day.id, 'New');

    const found = (await repo.getPlan(plan.id))!.days[0]!;
    expect(found.name).toBe('New');
    await expect(repo.renameDay('does-not-exist', 'X')).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
  });

  it('deleteDay soft-deletes - the day disappears from getPlan', async () => {
    const { repo } = await setup();
    const plan = await repo.createPlan({ name: 'A Plan' });
    const day = await repo.addDay(plan.id, { name: 'Day 1' });

    await repo.deleteDay(day.id);

    expect((await repo.getPlan(plan.id))!.days).toEqual([]);
  });

  it('deleteDay on a missing id throws RepositoryNotFoundError', async () => {
    const { repo } = await setup();
    await expect(repo.deleteDay('does-not-exist')).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it('restoreDay undoes deleteDay - the day (with its exercises intact) reappears via getPlan', async () => {
    const { db, repo } = await setup();
    const plan = await repo.createPlan({ name: 'A Plan' });
    const day = await repo.addDay(plan.id, { name: 'Day 1' });
    const exerciseId = await insertExercise(db);
    await repo.addExerciseToDay(day.id, { exerciseId });

    await repo.deleteDay(day.id);
    expect((await repo.getPlan(plan.id))!.days).toEqual([]);

    await repo.restoreDay(day.id);
    const restored = (await repo.getPlan(plan.id))!.days;
    expect(restored).toHaveLength(1);
    expect(restored[0]!.id).toBe(day.id);
    expect(restored[0]!.exercises).toHaveLength(1);
  });

  it('restoreDay on a missing id throws RepositoryNotFoundError', async () => {
    const { repo } = await setup();
    await expect(repo.restoreDay('does-not-exist')).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it('reorderDays persists order and rejects a day id belonging to a different plan', async () => {
    const { repo } = await setup();
    const planA = await repo.createPlan({ name: 'Plan A' });
    const planB = await repo.createPlan({ name: 'Plan B' });
    const dayA1 = await repo.addDay(planA.id, { name: 'A1' });
    const dayA2 = await repo.addDay(planA.id, { name: 'A2' });
    const dayB1 = await repo.addDay(planB.id, { name: 'B1' });

    await repo.reorderDays(planA.id, [dayA2.id, dayA1.id]);
    const reordered = (await repo.getPlan(planA.id))!.days;
    expect(reordered.map((d) => d.id)).toEqual([dayA2.id, dayA1.id]);

    await expect(repo.reorderDays(planA.id, [dayB1.id])).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
  });
});

describe('SqlitePlanRepository - day-exercise CRUD', () => {
  it('addExerciseToDay returns a PlanDayExercise with the embedded exercise summary; sequential sort_order; throws for a missing day', async () => {
    const { db, repo } = await setup();
    const plan = await repo.createPlan({ name: 'A Plan' });
    const day = await repo.addDay(plan.id, { name: 'Day 1' });
    const exerciseId = await insertExercise(db, { nameEn: 'Bench Press' });

    const first = await repo.addExerciseToDay(day.id, { exerciseId, targetSets: 3 });
    const secondExerciseId = await insertExercise(db, { nameEn: 'Squat' });
    const second = await repo.addExerciseToDay(day.id, { exerciseId: secondExerciseId });

    expect(first.sortOrder).toBe(0);
    expect(second.sortOrder).toBe(1);
    expect(first.exercise.id).toBe(exerciseId);
    expect(first.exercise.nameEn).toBe('Bench Press');
    expect(first.targetSets).toBe(3);
    expect(first.supersetGroup).toBeNull();
    await expect(
      repo.addExerciseToDay('does-not-exist', { exerciseId }),
    ).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it('updateDayExercise patches only the given fields; throws for a missing id', async () => {
    const { db, repo } = await setup();
    const plan = await repo.createPlan({ name: 'A Plan' });
    const day = await repo.addDay(plan.id, { name: 'Day 1' });
    const exerciseId = await insertExercise(db);
    const created = await repo.addExerciseToDay(day.id, {
      exerciseId,
      targetSets: 3,
      note: 'original note',
    });

    const updated = await repo.updateDayExercise(created.id, { targetSets: 5 });

    expect(updated.targetSets).toBe(5);
    expect(updated.note).toBe('original note');
    await expect(
      repo.updateDayExercise('does-not-exist', { targetSets: 1 }),
    ).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it('removeExerciseFromDay soft-deletes - the exercise disappears from getPlan', async () => {
    const { db, repo } = await setup();
    const plan = await repo.createPlan({ name: 'A Plan' });
    const day = await repo.addDay(plan.id, { name: 'Day 1' });
    const exerciseId = await insertExercise(db);
    const created = await repo.addExerciseToDay(day.id, { exerciseId });

    await repo.removeExerciseFromDay(created.id);

    expect((await repo.getPlan(plan.id))!.days[0]!.exercises).toEqual([]);
  });

  it('restoreDayExercise undoes removeExerciseFromDay - the exercise reappears via getPlan', async () => {
    const { db, repo } = await setup();
    const plan = await repo.createPlan({ name: 'A Plan' });
    const day = await repo.addDay(plan.id, { name: 'Day 1' });
    const exerciseId = await insertExercise(db);
    const created = await repo.addExerciseToDay(day.id, { exerciseId, targetSets: 4 });

    await repo.removeExerciseFromDay(created.id);
    expect((await repo.getPlan(plan.id))!.days[0]!.exercises).toEqual([]);

    await repo.restoreDayExercise(created.id);
    const restored = (await repo.getPlan(plan.id))!.days[0]!.exercises;
    expect(restored).toHaveLength(1);
    expect(restored[0]!.id).toBe(created.id);
    expect(restored[0]!.targetSets).toBe(4);
  });

  it('restoreDayExercise on a missing id throws RepositoryNotFoundError', async () => {
    const { repo } = await setup();
    await expect(repo.restoreDayExercise('does-not-exist')).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
  });

  it('reorderDayExercises persists order and rejects an id belonging to a different day', async () => {
    const { db, repo } = await setup();
    const plan = await repo.createPlan({ name: 'A Plan' });
    const dayA = await repo.addDay(plan.id, { name: 'Day A' });
    const dayB = await repo.addDay(plan.id, { name: 'Day B' });
    const exercise1 = await insertExercise(db);
    const exercise2 = await insertExercise(db);
    const exercise3 = await insertExercise(db);
    const deA1 = await repo.addExerciseToDay(dayA.id, { exerciseId: exercise1 });
    const deA2 = await repo.addExerciseToDay(dayA.id, { exerciseId: exercise2 });
    const deB1 = await repo.addExerciseToDay(dayB.id, { exerciseId: exercise3 });

    await repo.reorderDayExercises(dayA.id, [deA2.id, deA1.id]);
    const reordered = (await repo.getPlan(plan.id))!.days.find((d) => d.id === dayA.id)!.exercises;
    expect(reordered.map((e) => e.id)).toEqual([deA2.id, deA1.id]);

    await expect(repo.reorderDayExercises(dayA.id, [deB1.id])).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
  });
});

describe('SqlitePlanRepository.setSupersetGroup()', () => {
  it('groups same-day day-exercises together and can ungroup with null', async () => {
    const { db, repo } = await setup();
    const plan = await repo.createPlan({ name: 'A Plan' });
    const day = await repo.addDay(plan.id, { name: 'Day 1' });
    const exercise1 = await insertExercise(db);
    const exercise2 = await insertExercise(db);
    const de1 = await repo.addExerciseToDay(day.id, { exerciseId: exercise1 });
    const de2 = await repo.addExerciseToDay(day.id, { exerciseId: exercise2 });

    await repo.setSupersetGroup([de1.id, de2.id], 1);
    let exercises = (await repo.getPlan(plan.id))!.days[0]!.exercises;
    expect(exercises.every((e) => e.supersetGroup === 1)).toBe(true);

    await repo.setSupersetGroup([de1.id, de2.id], null);
    exercises = (await repo.getPlan(plan.id))!.days[0]!.exercises;
    expect(exercises.every((e) => e.supersetGroup === null)).toBe(true);
  });

  it('throws SupersetSpansMultipleDaysError for ids spanning more than one day, applying no change', async () => {
    const { db, repo } = await setup();
    const plan = await repo.createPlan({ name: 'A Plan' });
    const dayA = await repo.addDay(plan.id, { name: 'Day A' });
    const dayB = await repo.addDay(plan.id, { name: 'Day B' });
    const exerciseA = await insertExercise(db);
    const exerciseB = await insertExercise(db);
    const deA = await repo.addExerciseToDay(dayA.id, { exerciseId: exerciseA });
    const deB = await repo.addExerciseToDay(dayB.id, { exerciseId: exerciseB });

    await expect(repo.setSupersetGroup([deA.id, deB.id], 1)).rejects.toBeInstanceOf(
      SupersetSpansMultipleDaysError,
    );

    const refreshedPlan = await repo.getPlan(plan.id);
    const allExercises = refreshedPlan!.days.flatMap((d) => d.exercises);
    expect(allExercises.every((e) => e.supersetGroup === null)).toBe(true);
  });

  it('throws RepositoryNotFoundError for a missing day-exercise id', async () => {
    const { db, repo } = await setup();
    const plan = await repo.createPlan({ name: 'A Plan' });
    const day = await repo.addDay(plan.id, { name: 'Day 1' });
    const exerciseId = await insertExercise(db);
    const de = await repo.addExerciseToDay(day.id, { exerciseId });

    await expect(repo.setSupersetGroup([de.id, 'does-not-exist'], 1)).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
  });
});

describe('SqlitePlanRepository.duplicatePlan()', () => {
  it('deep-copies a plan with 4 days and 24 exercises: new ids for every row, same day/exercise counts, no shared rows with the original', async () => {
    const { db, repo } = await setup();
    const original = await repo.createPlan({ name: 'Full Program', description: 'desc', color: 'accent' });
    for (let dayIndex = 0; dayIndex < 4; dayIndex += 1) {
      const day = await repo.addDay(original.id, { name: `Day ${dayIndex + 1}` });
      for (let exerciseIndex = 0; exerciseIndex < 6; exerciseIndex += 1) {
        const exerciseId = await insertExercise(db, { nameEn: `Exercise ${dayIndex}-${exerciseIndex}` });
        await repo.addExerciseToDay(day.id, { exerciseId, targetSets: 3, note: 'note' });
      }
    }
    const originalFull = await repo.getPlan(original.id);

    const copy = await repo.duplicatePlan(original.id);

    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe('Full Program (copy)');
    expect(copy.description).toBe('desc');
    expect(copy.color).toBe('accent');
    expect(copy.isActive).toBe(false);
    expect(copy.days).toHaveLength(4);

    const originalDayIds = new Set(originalFull!.days.map((d) => d.id));
    const copyDayIds = new Set(copy.days.map((d) => d.id));
    expect([...copyDayIds].some((id) => originalDayIds.has(id))).toBe(false);

    const originalExerciseRowIds = new Set(
      originalFull!.days.flatMap((d) => d.exercises.map((e) => e.id)),
    );
    const copyExerciseRowIds = new Set(copy.days.flatMap((d) => d.exercises.map((e) => e.id)));
    expect(copyExerciseRowIds.size).toBe(24);
    expect([...copyExerciseRowIds].some((id) => originalExerciseRowIds.has(id))).toBe(false);

    for (const [dayIndex, day] of copy.days.entries()) {
      expect(day.exercises).toHaveLength(6);
      expect(day.exercises.map((e) => e.exercise.id)).toEqual(
        originalFull!.days[dayIndex]!.exercises.map((e) => e.exercise.id),
      );
    }

    const originalAfterCopy = await repo.getPlan(original.id);
    expect(originalAfterCopy!.days).toHaveLength(4);
    expect(originalAfterCopy!.days.flatMap((d) => d.exercises)).toHaveLength(24);
  });

  it('does not disambiguate repeated duplicates - both copies get the literal "(copy)" suffix', async () => {
    const { repo } = await setup();
    const original = await repo.createPlan({ name: 'Push Day' });

    const firstCopy = await repo.duplicatePlan(original.id);
    const secondCopy = await repo.duplicatePlan(original.id);

    expect(firstCopy.name).toBe('Push Day (copy)');
    expect(secondCopy.name).toBe('Push Day (copy)');
    expect(firstCopy.id).not.toBe(secondCopy.id);
  });

  it('throws RepositoryNotFoundError for a missing plan id', async () => {
    const { repo } = await setup();
    await expect(repo.duplicatePlan('does-not-exist')).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
  });
});

describe('SqlitePlanRepository.duplicateDay()', () => {
  it('deep-copies a day within the same plan: new day/day-exercise ids, same exercise_id references, appended at the end', async () => {
    const { db, repo } = await setup();
    const plan = await repo.createPlan({ name: 'A Plan' });
    const dayA = await repo.addDay(plan.id, { name: 'Day A' });
    const dayB = await repo.addDay(plan.id, { name: 'Day B' });
    const exercise1 = await insertExercise(db);
    const exercise2 = await insertExercise(db);
    const deA1 = await repo.addExerciseToDay(dayA.id, { exerciseId: exercise1, targetSets: 4 });
    const deA2 = await repo.addExerciseToDay(dayA.id, { exerciseId: exercise2 });

    const copy = await repo.duplicateDay(dayA.id);

    expect(copy.id).not.toBe(dayA.id);
    expect(copy.id).not.toBe(dayB.id);
    expect(copy.name).toBe('Day A');
    expect(copy.exercises).toHaveLength(2);
    expect(copy.exercises.map((e) => e.id)).not.toEqual(
      expect.arrayContaining([deA1.id, deA2.id]),
    );
    expect(copy.exercises.map((e) => e.exercise.id)).toEqual([exercise1, exercise2]);
    expect(copy.exercises[0]!.targetSets).toBe(4);

    const fullPlan = await repo.getPlan(plan.id);
    expect(fullPlan!.days.map((d) => d.id)).toEqual([dayA.id, dayB.id, copy.id]);
  });

  it('throws RepositoryNotFoundError for a missing day id', async () => {
    const { repo } = await setup();
    await expect(repo.duplicateDay('does-not-exist')).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
  });
});

describe('SqlitePlanRepository - session-snapshot acceptance criterion (ROADMAP.md, this phase)', () => {
  it('purging a plan sets workout_session.plan_id/plan_day_id to NULL via ON DELETE SET NULL while its snapshot fields survive unchanged', async () => {
    const { db, repo } = await setup();
    const plan = await repo.createPlan({ name: 'Push Day' });
    const day = await repo.addDay(plan.id, { name: 'Day 1' });

    const sessionId = 'session-1';
    const now = Date.now();
    await db.run(
      `INSERT INTO workout_session (
         id, plan_id, plan_day_id, plan_name_snapshot, plan_day_name_snapshot,
         title, status, started_at, local_date, tz_offset_minutes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'Evening Workout', 'in_progress', ?, '2026-01-01', 0, ?, ?)`,
      [sessionId, plan.id, day.id, plan.name, day.name, now, now, now],
    );

    // workout-logging (the real writer of `workout_session`) doesn't exist
    // yet - this repository's own delete path (`purgePlan`, a hard delete) is
    // what must be verified to leave the session row's history intact.
    await repo.purgePlan(plan.id);

    const session = await db.selectOne<{
      plan_id: string | null;
      plan_day_id: string | null;
      plan_name_snapshot: string | null;
      plan_day_name_snapshot: string | null;
    }>(
      'SELECT plan_id, plan_day_id, plan_name_snapshot, plan_day_name_snapshot FROM workout_session WHERE id = ?',
      [sessionId],
    );

    expect(session).not.toBeNull();
    expect(session!.plan_id).toBeNull();
    expect(session!.plan_day_id).toBeNull();
    expect(session!.plan_name_snapshot).toBe('Push Day');
    expect(session!.plan_day_name_snapshot).toBe('Day 1');

    // The plan and its day are truly gone (hard delete, not soft delete).
    expect(await db.selectOne('SELECT id FROM plan WHERE id = ?', [plan.id])).toBeNull();
    expect(await db.selectOne('SELECT id FROM plan_day WHERE id = ?', [day.id])).toBeNull();
  });
});

describe('SqlitePlanRepository - transaction composition', () => {
  it('honors an explicit tx and rolls back with the caller-managed transaction', async () => {
    const { db, repo } = await setup();

    await expect(
      db.transaction(async (tx) => {
        await repo.createPlan({ name: 'Rolled Back Plan' }, tx);
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    expect(await repo.listPlans()).toEqual([]);
  });
});
