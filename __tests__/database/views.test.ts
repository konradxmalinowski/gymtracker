import { createTestDatabase } from '@/database/node/createTestDatabase';
import type { NodeSqlExecutor } from '@/database/node/NodeSqlExecutor';
import {
  insertExercise,
  insertSessionExercise,
  insertWorkoutSession,
  insertWorkoutSet,
} from './helpers/fixtures';

describe('read-model views (ARCHITECTURE.md 7.10)', () => {
  let db: NodeSqlExecutor;

  beforeEach(() => {
    db = createTestDatabase();
  });

  describe('v_working_set', () => {
    it('includes completed sets from completed sessions and computes volume_kg', async () => {
      const exerciseId = await insertExercise(db);
      const sessionId = await insertWorkoutSession(db, { status: 'completed' });
      const sessionExerciseId = await insertSessionExercise(db, sessionId, exerciseId);
      await insertWorkoutSet(db, sessionExerciseId, sessionId, exerciseId, {
        setType: 'normal',
        weightKg: 100,
        reps: 5,
      });

      const rows = await db.select<{ volume_kg: number; local_date: string }>(
        'SELECT * FROM v_working_set',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.volume_kg).toBe(500);
    });

    it('zeroes volume_kg for warmup, assisted and partial sets', async () => {
      const exerciseId = await insertExercise(db);
      const sessionId = await insertWorkoutSession(db, { status: 'completed' });
      const sessionExerciseId = await insertSessionExercise(db, sessionId, exerciseId);
      for (const setType of ['warmup', 'assisted', 'partial'] as const) {
        await insertWorkoutSet(db, sessionExerciseId, sessionId, exerciseId, {
          setType,
          weightKg: 100,
          reps: 5,
          setIndex: ['warmup', 'assisted', 'partial'].indexOf(setType) + 1,
        });
      }

      const rows = await db.select<{ volume_kg: number }>('SELECT volume_kg FROM v_working_set');
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.volume_kg === 0)).toBe(true);
    });

    it('excludes sets from an in-progress session', async () => {
      const exerciseId = await insertExercise(db);
      const sessionId = await insertWorkoutSession(db, { status: 'in_progress' });
      const sessionExerciseId = await insertSessionExercise(db, sessionId, exerciseId);
      await insertWorkoutSet(db, sessionExerciseId, sessionId, exerciseId);

      const rows = await db.select('SELECT * FROM v_working_set');
      expect(rows).toHaveLength(0);
    });

    it('excludes incomplete sets and soft-deleted sets', async () => {
      const exerciseId = await insertExercise(db);
      const sessionId = await insertWorkoutSession(db, { status: 'completed' });
      const sessionExerciseId = await insertSessionExercise(db, sessionId, exerciseId);
      await insertWorkoutSet(db, sessionExerciseId, sessionId, exerciseId, {
        isCompleted: false,
        setIndex: 1,
      });
      const deletedId = await insertWorkoutSet(db, sessionExerciseId, sessionId, exerciseId, {
        setIndex: 2,
      });
      await db.run('UPDATE workout_set SET deleted_at = ? WHERE id = ?', [Date.now(), deletedId]);

      const rows = await db.select('SELECT * FROM v_working_set');
      expect(rows).toHaveLength(0);
    });
  });

  describe('v_session_summary', () => {
    it('aggregates working-set count, volume and reps for a completed session', async () => {
      const exerciseId = await insertExercise(db);
      const sessionId = await insertWorkoutSession(db, { status: 'completed' });
      const sessionExerciseId = await insertSessionExercise(db, sessionId, exerciseId);
      await insertWorkoutSet(db, sessionExerciseId, sessionId, exerciseId, {
        setIndex: 1,
        weightKg: 100,
        reps: 5,
      });
      await insertWorkoutSet(db, sessionExerciseId, sessionId, exerciseId, {
        setIndex: 2,
        weightKg: 100,
        reps: 5,
      });

      const summary = await db.selectOne<{
        exercise_count: number;
        working_set_count: number;
        total_volume_kg: number;
        total_reps: number;
      }>('SELECT * FROM v_session_summary WHERE id = ?', [sessionId]);

      expect(summary).toMatchObject({
        exercise_count: 1,
        working_set_count: 2,
        total_volume_kg: 1000,
        total_reps: 10,
      });
    });

    it('does not include an in-progress session', async () => {
      const sessionId = await insertWorkoutSession(db, { status: 'in_progress' });
      const row = await db.selectOne('SELECT * FROM v_session_summary WHERE id = ?', [sessionId]);
      expect(row).toBeNull();
    });

    it('returns zeroed totals for a completed session with no working sets', async () => {
      const sessionId = await insertWorkoutSession(db, { status: 'completed' });
      const summary = await db.selectOne<{
        total_volume_kg: number;
        total_reps: number;
        working_set_count: number;
      }>('SELECT * FROM v_session_summary WHERE id = ?', [sessionId]);
      expect(summary).toMatchObject({ total_volume_kg: 0, total_reps: 0, working_set_count: 0 });
    });
  });

  describe('v_exercise_last_session', () => {
    it('reports the most recent performed_at per exercise across sessions', async () => {
      const exerciseId = await insertExercise(db);
      const olderSession = await insertWorkoutSession(db, {
        status: 'completed',
        startedAt: 1_000,
      });
      const olderSessionExercise = await insertSessionExercise(db, olderSession, exerciseId);
      await insertWorkoutSet(db, olderSessionExercise, olderSession, exerciseId, {
        performedAt: 1_000,
      });

      const newerSession = await insertWorkoutSession(db, {
        status: 'completed',
        startedAt: 5_000,
      });
      const newerSessionExercise = await insertSessionExercise(db, newerSession, exerciseId);
      await insertWorkoutSet(db, newerSessionExercise, newerSession, exerciseId, {
        performedAt: 5_000,
      });

      const row = await db.selectOne<{ session_id: string; performed_at: number }>(
        'SELECT session_id, performed_at FROM v_exercise_last_session WHERE exercise_id = ?',
        [exerciseId],
      );
      expect(row).toEqual({ session_id: newerSession, performed_at: 5_000 });
    });
  });
});
