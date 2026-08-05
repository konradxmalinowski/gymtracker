import { createTestDatabase } from '@/database/node/createTestDatabase';
import type { NodeSqlExecutor } from '@/database/node/NodeSqlExecutor';
import { seedLookupTables } from '@/database/seed/lookupSeeder';
import {
  insertExercise,
  insertPlan,
  insertPlanDay,
  insertSessionExercise,
  insertWorkoutSession,
  insertWorkoutSet,
  nextId,
} from './helpers/fixtures';

describe('schema constraints', () => {
  let db: NodeSqlExecutor;

  beforeEach(async () => {
    db = createTestDatabase();
    await seedLookupTables(db);
  });

  describe('ux_plan_single_active - at most one active plan', () => {
    it('allows a single active plan', async () => {
      await insertPlan(db, { isActive: true });
      const rows = await db.select('SELECT id FROM plan WHERE is_active = 1');
      expect(rows).toHaveLength(1);
    });

    it('rejects a second active plan', async () => {
      await insertPlan(db, { isActive: true });
      await expect(insertPlan(db, { isActive: true })).rejects.toThrow(/UNIQUE constraint failed/i);
    });

    it('allows a second active plan once the first is soft-deleted', async () => {
      const firstId = await insertPlan(db, { isActive: true });
      await db.run('UPDATE plan SET deleted_at = ? WHERE id = ?', [Date.now(), firstId]);
      await expect(insertPlan(db, { isActive: true })).resolves.toBeDefined();
    });

    it('allows multiple inactive plans', async () => {
      await insertPlan(db, { isActive: false });
      await insertPlan(db, { isActive: false });
      const rows = await db.select('SELECT id FROM plan');
      expect(rows).toHaveLength(2);
    });
  });

  describe('ux_session_single_in_progress - at most one in-progress workout', () => {
    it('allows a single in-progress session', async () => {
      await insertWorkoutSession(db, { status: 'in_progress' });
      const rows = await db.select("SELECT id FROM workout_session WHERE status = 'in_progress'");
      expect(rows).toHaveLength(1);
    });

    it('rejects a second in-progress session (FR-19)', async () => {
      await insertWorkoutSession(db, { status: 'in_progress' });
      await expect(insertWorkoutSession(db, { status: 'in_progress' })).rejects.toThrow(
        /UNIQUE constraint failed/i,
      );
    });

    it('allows a second in-progress session once the first is finished', async () => {
      const firstId = await insertWorkoutSession(db, { status: 'in_progress' });
      await db.run(
        "UPDATE workout_session SET status = 'completed', finished_at = ? WHERE id = ?",
        [Date.now(), firstId],
      );
      await expect(insertWorkoutSession(db, { status: 'in_progress' })).resolves.toBeDefined();
    });

    it('allows multiple completed sessions', async () => {
      await insertWorkoutSession(db, { status: 'completed' });
      await insertWorkoutSession(db, { status: 'completed' });
      const rows = await db.select('SELECT id FROM workout_session');
      expect(rows).toHaveLength(2);
    });
  });

  describe('ux_pr_current - at most one current record per exercise/type/rep-bucket', () => {
    async function insertPr(
      exerciseId: string,
      overrides: { recordType?: string; repBucket?: number | null; isCurrent?: boolean } = {},
    ) {
      await db.run(
        `INSERT INTO personal_record (id, exercise_id, record_type, rep_bucket, value, achieved_at, is_current, created_at, updated_at)
         VALUES (?, ?, ?, ?, 100, ?, ?, ?, ?)`,
        [
          nextId(),
          exerciseId,
          overrides.recordType ?? 'max_weight',
          overrides.repBucket ?? null,
          Date.now(),
          (overrides.isCurrent ?? true) ? 1 : 0,
          Date.now(),
          Date.now(),
        ],
      );
    }

    it('allows one current record per exercise/type', async () => {
      const exerciseId = await insertExercise(db);
      await insertPr(exerciseId);
      const rows = await db.select('SELECT id FROM personal_record');
      expect(rows).toHaveLength(1);
    });

    it('rejects a second current record for the same exercise/type/rep-bucket', async () => {
      const exerciseId = await insertExercise(db);
      await insertPr(exerciseId);
      await expect(insertPr(exerciseId)).rejects.toThrow(/UNIQUE constraint failed/i);
    });

    it('treats NULL rep_bucket values as equal for uniqueness (IFNULL(rep_bucket, -1))', async () => {
      const exerciseId = await insertExercise(db);
      await insertPr(exerciseId, { recordType: 'max_weight', repBucket: null });
      await expect(
        insertPr(exerciseId, { recordType: 'max_weight', repBucket: null }),
      ).rejects.toThrow(/UNIQUE constraint failed/i);
    });

    it('allows a new current record once the previous one is superseded (is_current = 0)', async () => {
      const exerciseId = await insertExercise(db);
      await insertPr(exerciseId);
      await db.run('UPDATE personal_record SET is_current = 0 WHERE exercise_id = ?', [exerciseId]);
      await expect(insertPr(exerciseId)).resolves.toBeUndefined();
    });

    it('allows the same exercise/type with a different rep_bucket to both be current', async () => {
      const exerciseId = await insertExercise(db);
      await insertPr(exerciseId, { recordType: 'weight_at_reps', repBucket: 5 });
      await expect(
        insertPr(exerciseId, { recordType: 'weight_at_reps', repBucket: 8 }),
      ).resolves.toBeUndefined();
    });
  });

  describe('CHECK constraints', () => {
    it('rejects a completed session with no finished_at', async () => {
      await expect(
        db.run(
          `INSERT INTO workout_session (id, title, status, started_at, local_date, tz_offset_minutes, created_at, updated_at)
           VALUES (?, 'x', 'completed', ?, '2026-01-01', 0, ?, ?)`,
          [nextId(), Date.now(), Date.now(), Date.now()],
        ),
      ).rejects.toThrow(/CHECK constraint failed/i);
    });

    it('rejects a completed set with is_completed = 0 and a completed_at set... (inverse: incomplete requires null is fine, but completed requires completed_at)', async () => {
      const exerciseId = await insertExercise(db);
      const sessionId = await insertWorkoutSession(db, { status: 'in_progress' });
      const sessionExerciseId = await insertSessionExercise(db, sessionId, exerciseId);

      await expect(
        db.run(
          `INSERT INTO workout_set (
             id, session_exercise_id, session_id, exercise_id, set_index, is_completed, completed_at, performed_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, 1, 1, NULL, ?, ?, ?)`,
          [nextId(), sessionExerciseId, sessionId, exerciseId, Date.now(), Date.now(), Date.now()],
        ),
      ).rejects.toThrow(/CHECK constraint failed/i);
    });

    it('rejects a drop-set parent_set_id on a non-drop set_type', async () => {
      const exerciseId = await insertExercise(db);
      const sessionId = await insertWorkoutSession(db, { status: 'in_progress' });
      const sessionExerciseId = await insertSessionExercise(db, sessionId, exerciseId);
      const parentId = await insertWorkoutSet(db, sessionExerciseId, sessionId, exerciseId, {
        setIndex: 1,
      });

      await expect(
        insertWorkoutSet(db, sessionExerciseId, sessionId, exerciseId, {
          setIndex: 2,
          setType: 'normal',
          parentSetId: parentId,
        }),
      ).rejects.toThrow(/CHECK constraint failed/i);
    });

    it('allows a drop-set parent_set_id on a drop set_type', async () => {
      const exerciseId = await insertExercise(db);
      const sessionId = await insertWorkoutSession(db, { status: 'in_progress' });
      const sessionExerciseId = await insertSessionExercise(db, sessionId, exerciseId);
      const parentId = await insertWorkoutSet(db, sessionExerciseId, sessionId, exerciseId, {
        setIndex: 1,
      });

      await expect(
        insertWorkoutSet(db, sessionExerciseId, sessionId, exerciseId, {
          setIndex: 2,
          setType: 'drop',
          parentSetId: parentId,
        }),
      ).resolves.toBeDefined();
    });

    it('rejects a negative weight_kg', async () => {
      const exerciseId = await insertExercise(db);
      const sessionId = await insertWorkoutSession(db, { status: 'in_progress' });
      const sessionExerciseId = await insertSessionExercise(db, sessionId, exerciseId);

      await expect(
        insertWorkoutSet(db, sessionExerciseId, sessionId, exerciseId, { weightKg: -5 }),
      ).rejects.toThrow(/CHECK constraint failed/i);
    });

    it('rejects reps outside 0..1000', async () => {
      const exerciseId = await insertExercise(db);
      const sessionId = await insertWorkoutSession(db, { status: 'in_progress' });
      const sessionExerciseId = await insertSessionExercise(db, sessionId, exerciseId);

      await expect(
        insertWorkoutSet(db, sessionExerciseId, sessionId, exerciseId, { reps: 1001 }),
      ).rejects.toThrow(/CHECK constraint failed/i);
    });

    it('rejects target_rep_min greater than target_rep_max on plan_day_exercise', async () => {
      const planId = await insertPlan(db);
      const dayId = await insertPlanDay(db, planId);
      const exerciseId = await insertExercise(db);

      await expect(
        db.run(
          `INSERT INTO plan_day_exercise (id, plan_day_id, exercise_id, target_rep_min, target_rep_max, created_at, updated_at)
           VALUES (?, ?, ?, 12, 8, ?, ?)`,
          [nextId(), dayId, exerciseId, Date.now(), Date.now()],
        ),
      ).rejects.toThrow(/CHECK constraint failed/i);
    });

    it('rejects an unknown body_metric_entry metric', async () => {
      await expect(
        db.run(
          `INSERT INTO body_metric_entry (id, metric, value, measured_at, local_date, created_at, updated_at)
           VALUES (?, 'not_a_real_metric', 80, ?, '2026-01-01', ?, ?)`,
          [nextId(), Date.now(), Date.now(), Date.now()],
        ),
      ).rejects.toThrow(/CHECK constraint failed/i);
    });
  });

  describe('foreign key behavior', () => {
    it('cascades plan deletion to plan_day and plan_day_exercise', async () => {
      const planId = await insertPlan(db);
      const dayId = await insertPlanDay(db, planId);
      const exerciseId = await insertExercise(db);
      await db.run(
        `INSERT INTO plan_day_exercise (id, plan_day_id, exercise_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [nextId(), dayId, exerciseId, Date.now(), Date.now()],
      );

      await db.run('DELETE FROM plan WHERE id = ?', [planId]);

      expect(await db.select('SELECT id FROM plan_day WHERE plan_id = ?', [planId])).toHaveLength(
        0,
      );
      expect(
        await db.select('SELECT id FROM plan_day_exercise WHERE plan_day_id = ?', [dayId]),
      ).toHaveLength(0);
    });

    it('restricts deleting an exercise referenced by a plan_day_exercise', async () => {
      const planId = await insertPlan(db);
      const dayId = await insertPlanDay(db, planId);
      const exerciseId = await insertExercise(db);
      await db.run(
        `INSERT INTO plan_day_exercise (id, plan_day_id, exercise_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [nextId(), dayId, exerciseId, Date.now(), Date.now()],
      );

      await expect(db.run('DELETE FROM exercise WHERE id = ?', [exerciseId])).rejects.toThrow(
        /FOREIGN KEY constraint failed/i,
      );
    });

    it('sets workout_session.plan_id to NULL when the plan is deleted', async () => {
      const planId = await insertPlan(db);
      const sessionId = await insertWorkoutSession(db, { status: 'completed' });
      await db.run('UPDATE workout_session SET plan_id = ? WHERE id = ?', [planId, sessionId]);

      await db.run('DELETE FROM plan WHERE id = ?', [planId]);

      const row = await db.selectOne<{ plan_id: string | null }>(
        'SELECT plan_id FROM workout_session WHERE id = ?',
        [sessionId],
      );
      expect(row?.plan_id).toBeNull();
    });

    it('cascades workout_session deletion down to session_exercise and workout_set', async () => {
      const exerciseId = await insertExercise(db);
      const sessionId = await insertWorkoutSession(db, { status: 'completed' });
      const sessionExerciseId = await insertSessionExercise(db, sessionId, exerciseId);
      await insertWorkoutSet(db, sessionExerciseId, sessionId, exerciseId);

      await db.run('DELETE FROM workout_session WHERE id = ?', [sessionId]);

      expect(
        await db.select('SELECT id FROM session_exercise WHERE session_id = ?', [sessionId]),
      ).toHaveLength(0);
      expect(
        await db.select('SELECT id FROM workout_set WHERE session_id = ?', [sessionId]),
      ).toHaveLength(0);
    });

    it('cascades exercise deletion to exercise_user_data via ON DELETE CASCADE', async () => {
      const exerciseId = await insertExercise(db);
      await db.run(
        `INSERT INTO exercise_user_data (exercise_id, created_at, updated_at) VALUES (?, ?, ?)`,
        [exerciseId, Date.now(), Date.now()],
      );

      // No plan/session references this exercise, so the delete itself is allowed.
      await db.run('DELETE FROM exercise WHERE id = ?', [exerciseId]);

      expect(
        await db.select('SELECT * FROM exercise_user_data WHERE exercise_id = ?', [exerciseId]),
      ).toHaveLength(0);
    });
  });

  describe('exercise_muscle - WITHOUT ROWID composite key', () => {
    it('allows the same exercise/muscle pair with different roles', async () => {
      const exerciseId = await insertExercise(db);
      await db.run(
        'INSERT INTO exercise_muscle (exercise_id, muscle_slug, role) VALUES (?, ?, ?)',
        [exerciseId, 'chest', 'primary'],
      );
      await db.run(
        'INSERT INTO exercise_muscle (exercise_id, muscle_slug, role) VALUES (?, ?, ?)',
        [exerciseId, 'chest', 'secondary'],
      );
      expect(
        await db.select('SELECT * FROM exercise_muscle WHERE exercise_id = ?', [exerciseId]),
      ).toHaveLength(2);
    });

    it('rejects a duplicate exercise/muscle/role triple', async () => {
      const exerciseId = await insertExercise(db);
      await db.run(
        'INSERT INTO exercise_muscle (exercise_id, muscle_slug, role) VALUES (?, ?, ?)',
        [exerciseId, 'chest', 'primary'],
      );
      await expect(
        db.run('INSERT INTO exercise_muscle (exercise_id, muscle_slug, role) VALUES (?, ?, ?)', [
          exerciseId,
          'chest',
          'primary',
        ]),
      ).rejects.toThrow(/UNIQUE constraint failed|PRIMARY KEY/i);
    });
  });
});
