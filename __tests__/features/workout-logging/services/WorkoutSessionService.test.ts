import { createTestDatabase } from '@/database/node/createTestDatabase';
import { SqliteWorkoutSessionRepository } from '@/features/workout-logging/repository/SqliteWorkoutSessionRepository';
import {
  WORKOUT_NOTE_MAX_LENGTH,
  WorkoutSessionService,
} from '@/features/workout-logging/services/WorkoutSessionService';
import {
  SessionSupersetMinimumSizeError,
  WorkoutValidationError,
} from '@/features/workout-logging/services/errors';
import { SessionNotInProgressError } from '@/features/workout-logging/repository/errors';
import { RepositoryNotFoundError } from '@/repositories/base';
import type { DatabaseContext } from '@/repositories/contracts/database';
import { SqliteSettingsRepository } from '@/repositories/settings';
import { FixedClock } from '@/services/clock';
import { Uuid7IdGenerator } from '@/services/id';

const START = Date.UTC(2026, 7, 6, 18, 0, 0);
const HOUR = 60 * 60 * 1000;

function setup() {
  const db = createTestDatabase();
  const clock = new FixedClock(START);
  const idGenerator = new Uuid7IdGenerator(clock);
  const repository = new SqliteWorkoutSessionRepository({ db, clock, idGenerator });
  const settings = new SqliteSettingsRepository(db, clock);
  const service = new WorkoutSessionService({ repository, settings, clock });
  return { db, clock, repository, settings, service };
}

async function insertExercise(db: DatabaseContext, id = 'ex-1'): Promise<string> {
  await db.run(
    `INSERT INTO exercise (id, source, name_en, name_search, tracking_type, created_at, updated_at)
     VALUES (?, 'catalog', 'Bench Press', 'bench press', 'weight_reps', ?, ?)`,
    [id, START, START],
  );
  return id;
}

describe('WorkoutSessionService - starting and resuming', () => {
  it('findInProgress returns null when nothing is running', async () => {
    const { service } = setup();
    expect(await service.findInProgress()).toBeNull();
  });

  it('reports staleness against the workout.staleAfterHours setting rather than a hardcoded value', async () => {
    const { service, settings, clock } = setup();
    await service.startEmpty(START);

    expect(await settings.get('workout.staleAfterHours')).toBe(6);
    expect(await service.findInProgress()).toMatchObject({ isStale: false, staleAfterHours: 6 });

    clock.advance(6 * HOUR);
    expect(await service.findInProgress()).toMatchObject({ isStale: true, staleAfterHours: 6 });

    await settings.set('workout.staleAfterHours', 12);
    expect(await service.findInProgress()).toMatchObject({ isStale: false, staleAfterHours: 12 });
  });

  it('turns a second start into a "blocked" outcome carrying the existing session, not an exception', async () => {
    const { service, clock } = setup();
    const started = await service.startEmpty(START);
    expect(started.outcome).toBe('started');

    clock.advance(HOUR);
    const blocked = await service.startEmpty();

    expect(blocked.outcome).toBe('blocked');
    if (blocked.outcome !== 'blocked') {
      throw new Error('unreachable');
    }
    expect(blocked.existing.session.id).toBe(
      started.outcome === 'started' ? started.session.id : '',
    );
    expect(blocked.existing.isStale).toBe(false);
  });

  it('defaults startedAt to the injected clock', async () => {
    const { service, clock } = setup();
    clock.set(START + 5000);

    const result = await service.startEmpty();

    expect(result.outcome).toBe('started');
    if (result.outcome !== 'started') {
      throw new Error('unreachable');
    }
    expect(result.session.startedAt).toBe(START + 5000);
  });

  it('rejects an empty or over-long custom title', async () => {
    const { service } = setup();
    await expect(service.startEmpty(START, '   ')).rejects.toBeInstanceOf(WorkoutValidationError);
    await expect(service.startEmpty(START, 'x'.repeat(101))).rejects.toBeInstanceOf(
      WorkoutValidationError,
    );
  });
});

describe('WorkoutSessionService - validation at the boundary', () => {
  async function withExercise() {
    const context = setup();
    await insertExercise(context.db);
    const result = await context.service.startEmpty(START);
    if (result.outcome !== 'started') {
      throw new Error('unreachable');
    }
    const exercise = await context.service.addExercise(result.session.id, 'ex-1');
    return { ...context, session: result.session, exercise };
  }

  it('rejects values the schema CHECK constraints would reject anyway, before they reach SQL', async () => {
    const { service, exercise } = await withExercise();

    await expect(service.appendSet(exercise.id, { weightKg: -1 })).rejects.toBeInstanceOf(
      WorkoutValidationError,
    );
    await expect(service.appendSet(exercise.id, { reps: 1001 })).rejects.toBeInstanceOf(
      WorkoutValidationError,
    );
    await expect(service.appendSet(exercise.id, { reps: 5.5 })).rejects.toBeInstanceOf(
      WorkoutValidationError,
    );
    await expect(service.appendSet(exercise.id, { rpe: 11 })).rejects.toBeInstanceOf(
      WorkoutValidationError,
    );
    await expect(
      service.appendSet(exercise.id, { setType: 'superset' as never }),
    ).rejects.toBeInstanceOf(WorkoutValidationError);
  });

  it('accepts an explicit null for every nullable value field', async () => {
    const { service, exercise } = await withExercise();
    await expect(
      service.appendSet(exercise.id, { weightKg: null, reps: null, rpe: null, note: null }),
    ).resolves.toMatchObject({ weightKg: null, reps: null });
  });

  it('validates completeSet values and an explicit completedAt', async () => {
    const { service, exercise } = await withExercise();
    const set = await service.appendSet(exercise.id, { weightKg: 100, reps: 5 });

    await expect(service.completeSet(set.id, { reps: -1 })).rejects.toBeInstanceOf(
      WorkoutValidationError,
    );
    await expect(service.completeSet(set.id, { completedAt: START + 1000 })).resolves.toMatchObject(
      {
        newPRs: [],
        set: { isCompleted: true, completedAt: START + 1000 },
      },
    );
  });

  it('requires at least two exercises to form a superset, but allows one to clear it', async () => {
    const { db, service, session, exercise } = await withExercise();
    await insertExercise(db, 'ex-2');
    const second = await service.addExercise(session.id, 'ex-2');

    await expect(service.setSupersetGroup([exercise.id], 1)).rejects.toBeInstanceOf(
      SessionSupersetMinimumSizeError,
    );
    await expect(service.setSupersetGroup([exercise.id, second.id], 1)).resolves.toBeUndefined();
    await expect(service.setSupersetGroup([exercise.id], null)).resolves.toBeUndefined();
  });
});

describe('WorkoutSessionService - notes (FR-16)', () => {
  async function withExercise() {
    const context = setup();
    await insertExercise(context.db);
    const result = await context.service.startEmpty(START);
    if (result.outcome !== 'started') {
      throw new Error('unreachable');
    }
    const exercise = await context.service.addExercise(result.session.id, 'ex-1');
    return { ...context, session: result.session, exercise };
  }

  it('writes and clears an exercise note', async () => {
    const { service, exercise } = await withExercise();

    await expect(
      service.setExerciseNote(exercise.id, 'Pause at the chest'),
    ).resolves.toBeUndefined();
    let snapshot = await service.findInProgress();
    expect(snapshot!.session.exercises[0]!.note).toBe('Pause at the chest');

    await service.setExerciseNote(exercise.id, null);
    snapshot = await service.findInProgress();
    expect(snapshot!.session.exercises[0]!.note).toBeNull();
  });

  it('writes and clears a workout note', async () => {
    const { service, session } = await withExercise();

    await service.setSessionNotes(session.id, 'Slept badly, everything felt heavy');
    let snapshot = await service.findInProgress();
    expect(snapshot!.session.notes).toBe('Slept badly, everything felt heavy');

    await service.setSessionNotes(session.id, null);
    snapshot = await service.findInProgress();
    expect(snapshot!.session.notes).toBeNull();
  });

  it('rejects a note longer than WORKOUT_NOTE_MAX_LENGTH before it reaches the repository', async () => {
    const { service, session, exercise } = await withExercise();
    const tooLong = 'x'.repeat(WORKOUT_NOTE_MAX_LENGTH + 1);

    await expect(service.setExerciseNote(exercise.id, tooLong)).rejects.toBeInstanceOf(
      WorkoutValidationError,
    );
    await expect(service.setSessionNotes(session.id, tooLong)).rejects.toBeInstanceOf(
      WorkoutValidationError,
    );

    const snapshot = await service.findInProgress();
    expect(snapshot!.session.exercises[0]!.note).toBeNull();
    expect(snapshot!.session.notes).toBeNull();

    await expect(
      service.setExerciseNote(exercise.id, 'y'.repeat(WORKOUT_NOTE_MAX_LENGTH)),
    ).resolves.toBeUndefined();
  });

  it('propagates RepositoryNotFoundError for an unknown exercise or session', async () => {
    const { service } = await withExercise();

    await expect(service.setExerciseNote('nope', 'x')).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
    await expect(service.setSessionNotes('nope', 'x')).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
  });
});

describe('WorkoutSessionService - finishing', () => {
  it('finishes with the injected clock by default and returns the denormalized totals', async () => {
    const { db, service, clock } = setup();
    await insertExercise(db);
    const started = await service.startEmpty(START);
    if (started.outcome !== 'started') {
      throw new Error('unreachable');
    }
    const exercise = await service.addExercise(started.session.id, 'ex-1');
    const set = await service.appendSet(exercise.id, { weightKg: 100, reps: 5 });
    await service.completeSet(set.id);

    clock.set(START + 30 * 60_000);
    const summary = await service.finish(started.session.id);

    expect(summary).toMatchObject({
      durationSeconds: 30 * 60,
      totalVolumeKg: 500,
      totalSets: 1,
      totalReps: 5,
    });
    expect(await service.findInProgress()).toBeNull();
  });

  it('propagates SessionNotInProgressError rather than silently no-oping', async () => {
    const { service } = setup();
    const started = await service.startEmpty(START);
    if (started.outcome !== 'started') {
      throw new Error('unreachable');
    }
    await service.discard(started.session.id);

    await expect(service.finish(started.session.id)).rejects.toBeInstanceOf(
      SessionNotInProgressError,
    );
  });

  it('exposes workout.confirmDiscard so the caller decides whether to confirm', async () => {
    const { service, settings } = setup();
    expect(await service.shouldConfirmDiscard()).toBe(true);

    await settings.set('workout.confirmDiscard', false);
    expect(await service.shouldConfirmDiscard()).toBe(false);
  });
});
