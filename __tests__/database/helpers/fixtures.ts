import { generateUuidV7 } from '@/database/ids/uuidv7';
import type { SqlExecutor } from '@/repositories/contracts/database';

let counter = 0;
/** Deterministic, monotonically-increasing id for test fixtures (not a real UUIDv7 clock). */
export function nextId(): string {
  counter += 1;
  return generateUuidV7(Date.UTC(2026, 0, 1) + counter);
}

export async function insertExercise(
  db: SqlExecutor,
  overrides: Partial<{
    id: string;
    source: 'catalog' | 'custom';
    nameEn: string;
    now: number;
    deletedAt: number | null;
  }> = {},
): Promise<string> {
  const id = overrides.id ?? nextId();
  const now = overrides.now ?? Date.now();
  const nameEn = overrides.nameEn ?? `Exercise ${id.slice(0, 8)}`;
  await db.run(
    `INSERT INTO exercise (id, source, name_en, name_search, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      overrides.source ?? 'custom',
      nameEn,
      nameEn.toLowerCase(),
      now,
      now,
      overrides.deletedAt ?? null,
    ],
  );
  return id;
}

export async function insertPlan(
  db: SqlExecutor,
  overrides: Partial<{ id: string; name: string; isActive: boolean; now: number }> = {},
): Promise<string> {
  const id = overrides.id ?? nextId();
  const now = overrides.now ?? Date.now();
  await db.run(
    `INSERT INTO plan (id, name, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [id, overrides.name ?? 'Plan', overrides.isActive ? 1 : 0, now, now],
  );
  return id;
}

export async function insertPlanDay(
  db: SqlExecutor,
  planId: string,
  overrides: Partial<{ id: string; name: string; now: number }> = {},
): Promise<string> {
  const id = overrides.id ?? nextId();
  const now = overrides.now ?? Date.now();
  await db.run(
    `INSERT INTO plan_day (id, plan_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [id, planId, overrides.name ?? 'Day', now, now],
  );
  return id;
}

export async function insertWorkoutSession(
  db: SqlExecutor,
  overrides: Partial<{
    id: string;
    status: 'in_progress' | 'completed' | 'discarded';
    startedAt: number;
    finishedAt: number | null;
    localDate: string;
    now: number;
  }> = {},
): Promise<string> {
  const id = overrides.id ?? nextId();
  const now = overrides.now ?? Date.now();
  const startedAt = overrides.startedAt ?? now;
  const status = overrides.status ?? 'in_progress';
  const finishedAt =
    overrides.finishedAt !== undefined
      ? overrides.finishedAt
      : status === 'completed'
        ? startedAt + 1
        : null;
  const localDate = overrides.localDate ?? new Date(startedAt).toISOString().slice(0, 10);

  await db.run(
    `INSERT INTO workout_session (
       id, title, status, started_at, finished_at, local_date, tz_offset_minutes, created_at, updated_at
     ) VALUES (?, 'Session', ?, ?, ?, ?, 0, ?, ?)`,
    [id, status, startedAt, finishedAt, localDate, now, now],
  );
  return id;
}

export async function insertSessionExercise(
  db: SqlExecutor,
  sessionId: string,
  exerciseId: string,
  overrides: Partial<{ id: string; now: number }> = {},
): Promise<string> {
  const id = overrides.id ?? nextId();
  const now = overrides.now ?? Date.now();
  await db.run(
    `INSERT INTO session_exercise (id, session_id, exercise_id, exercise_name_snapshot, created_at, updated_at)
     VALUES (?, ?, ?, 'Exercise', ?, ?)`,
    [id, sessionId, exerciseId, now, now],
  );
  return id;
}

export async function insertWorkoutSet(
  db: SqlExecutor,
  sessionExerciseId: string,
  sessionId: string,
  exerciseId: string,
  overrides: Partial<{
    id: string;
    setIndex: number;
    setType: 'warmup' | 'normal' | 'drop' | 'failure' | 'assisted' | 'partial';
    parentSetId: string | null;
    weightKg: number | null;
    reps: number | null;
    isCompleted: boolean;
    completedAt: number | null;
    performedAt: number;
    now: number;
  }> = {},
): Promise<string> {
  const id = overrides.id ?? nextId();
  const now = overrides.now ?? Date.now();
  const performedAt = overrides.performedAt ?? now;
  const isCompleted = overrides.isCompleted ?? true;
  const completedAt =
    overrides.completedAt !== undefined ? overrides.completedAt : isCompleted ? performedAt : null;

  await db.run(
    `INSERT INTO workout_set (
       id, session_exercise_id, session_id, exercise_id, set_index, set_type, parent_set_id,
       weight_kg, reps, is_completed, completed_at, performed_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      sessionExerciseId,
      sessionId,
      exerciseId,
      overrides.setIndex ?? 1,
      overrides.setType ?? 'normal',
      overrides.parentSetId ?? null,
      overrides.weightKg ?? 60,
      overrides.reps ?? 8,
      isCompleted ? 1 : 0,
      completedAt,
      performedAt,
      now,
      now,
    ],
  );
  return id;
}
