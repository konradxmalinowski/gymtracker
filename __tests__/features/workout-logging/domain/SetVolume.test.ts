import * as fc from 'fast-check';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import type { DatabaseContext } from '@/repositories/contracts/database';
import { setVolumeKg, totalVolumeKg } from '@/features/workout-logging/domain/SetVolume';
import { SET_TYPES, type SetType } from '@/features/workout-logging/domain/setSemantics';

/**
 * ADR-0006: "A repository test asserts that the view's volume expression and the
 * TypeScript calculator produce identical results across a generated matrix of
 * set types and values. That test is the only thing keeping two implementations
 * of one rule honest, and it is not optional."
 *
 * This file is that test, plus the property-based coverage
 * `docs/ROADMAP.md`'s Definition of Done asks for on every domain calculator a
 * phase introduces.
 */

interface Candidate {
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
}

const SESSION_ID = 'session-volume-matrix';
const SESSION_EXERCISE_ID = 'session-exercise-volume-matrix';
const EXERCISE_ID = 'exercise-volume-matrix';

/** A completed session with one exercise - `v_working_set` only surfaces sets whose session is `completed` and whose row is completed and not deleted. */
async function seedCompletedSession(db: DatabaseContext): Promise<void> {
  const now = 1_700_000_000_000;
  await db.run(
    `INSERT INTO exercise (id, source, name_en, name_search, tracking_type, created_at, updated_at)
     VALUES (?, 'catalog', 'Bench Press', 'bench press', 'weight_reps', ?, ?)`,
    [EXERCISE_ID, now, now],
  );
  await db.run(
    `INSERT INTO workout_session (id, title, status, started_at, finished_at, local_date,
                                  tz_offset_minutes, created_at, updated_at)
     VALUES (?, 'Matrix', 'completed', ?, ?, '2023-11-14', 0, ?, ?)`,
    [SESSION_ID, now, now + 1000, now, now],
  );
  await db.run(
    `INSERT INTO session_exercise (id, session_id, exercise_id, exercise_name_snapshot, sort_order,
                                   created_at, updated_at)
     VALUES (?, ?, ?, 'Bench Press', 0, ?, ?)`,
    [SESSION_EXERCISE_ID, SESSION_ID, EXERCISE_ID, now, now],
  );
}

/** Inserts each candidate as a completed set and returns the view's `volume_kg`, in the same order. */
async function volumesFromView(
  db: DatabaseContext,
  candidates: readonly Candidate[],
): Promise<number[]> {
  const now = 1_700_000_000_000;
  await db.run('DELETE FROM workout_set WHERE session_id = ?', [SESSION_ID]);
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    await db.run(
      `INSERT INTO workout_set (id, session_exercise_id, session_id, exercise_id, set_index, set_type,
                                weight_kg, reps, is_completed, completed_at, performed_at,
                                created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [
        `set-${index}`,
        SESSION_EXERCISE_ID,
        SESSION_ID,
        EXERCISE_ID,
        index + 1,
        candidate.setType,
        candidate.weightKg,
        candidate.reps,
        now,
        now + index,
        now,
        now,
      ],
    );
  }
  const rows = await db.select<{ id: string; volume_kg: number }>(
    'SELECT id, volume_kg FROM v_working_set WHERE session_id = ? ORDER BY performed_at ASC',
    [SESSION_ID],
  );
  return rows.map((row) => row.volume_kg);
}

describe('setVolumeKg - ADR-0006 semantics table', () => {
  it.each([
    ['warmup', 60, 10, 0],
    ['normal', 60, 10, 600],
    ['drop', 40, 12, 480],
    ['failure', 100, 3, 300],
    ['assisted', 20, 8, 0],
    ['partial', 80, 5, 0],
  ] as const)('%s with %s kg x %s reps -> %s kg', (setType, weightKg, reps, expected) => {
    expect(setVolumeKg({ setType, weightKg, reps })).toBe(expected);
  });

  it('returns 0 whenever weight or reps is missing, for every volume-bearing type', () => {
    for (const setType of SET_TYPES) {
      expect(setVolumeKg({ setType, weightKg: null, reps: 10 })).toBe(0);
      expect(setVolumeKg({ setType, weightKg: 60, reps: null })).toBe(0);
      expect(setVolumeKg({ setType, weightKg: null, reps: null })).toBe(0);
    }
  });

  it('treats a zero-weight or zero-rep set as zero volume rather than as missing data', () => {
    expect(setVolumeKg({ setType: 'normal', weightKg: 0, reps: 10 })).toBe(0);
    expect(setVolumeKg({ setType: 'normal', weightKg: 60, reps: 0 })).toBe(0);
  });

  it('totalVolumeKg sums the individual volumes and ignores nothing', () => {
    expect(
      totalVolumeKg([
        { setType: 'normal', weightKg: 100, reps: 5 },
        { setType: 'warmup', weightKg: 60, reps: 10 },
        { setType: 'drop', weightKg: 60, reps: 8 },
      ]),
    ).toBe(500 + 0 + 480);
  });
});

describe('setVolumeKg - properties', () => {
  const setTypeArb = fc.constantFrom(...SET_TYPES);
  const weightArb = fc.option(fc.double({ min: 0, max: 500, noNaN: true }), { nil: null });
  const repsArb = fc.option(fc.integer({ min: 0, max: 1000 }), { nil: null });

  it('is never negative and never NaN', () => {
    fc.assert(
      fc.property(setTypeArb, weightArb, repsArb, (setType, weightKg, reps) => {
        const volume = setVolumeKg({ setType, weightKg, reps });
        expect(Number.isNaN(volume)).toBe(false);
        expect(volume).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('is exactly zero for every set type the table excludes from volume, whatever the values', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('warmup', 'assisted', 'partial' as const),
        weightArb,
        repsArb,
        (setType, weightKg, reps) => {
          expect(setVolumeKg({ setType: setType as SetType, weightKg, reps })).toBe(0);
        },
      ),
    );
  });

  it('is weight x reps for every volume-bearing type when both values are present', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('normal', 'drop', 'failure' as const),
        fc.double({ min: 0, max: 500, noNaN: true }),
        fc.integer({ min: 0, max: 1000 }),
        (setType, weightKg, reps) => {
          expect(setVolumeKg({ setType: setType as SetType, weightKg, reps })).toBe(
            weightKg * reps,
          );
        },
      ),
    );
  });

  it('totalVolumeKg equals the sum of its parts (order-independent)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            setType: setTypeArb,
            weightKg: fc.double({ min: 0, max: 300, noNaN: true }),
            reps: fc.integer({ min: 0, max: 30 }),
          }),
          { maxLength: 20 },
        ),
        (sets) => {
          const expected = sets.reduce((sum, set) => sum + setVolumeKg(set), 0);
          expect(totalVolumeKg(sets)).toBe(expected);
        },
      ),
    );
  });
});

describe('setVolumeKg vs the v_working_set SQL view (ADR-0006 equivalence, mandatory)', () => {
  it('agrees across the full exhaustive set-type x value matrix', async () => {
    const db = createTestDatabase();
    await seedCompletedSession(db);

    const weights: (number | null)[] = [null, 0, 0.5, 2.5, 60, 142.75];
    const reps: (number | null)[] = [null, 0, 1, 8, 1000];
    const candidates: Candidate[] = [];
    for (const setType of SET_TYPES) {
      for (const weightKg of weights) {
        for (const repCount of reps) {
          candidates.push({ setType, weightKg, reps: repCount });
        }
      }
    }

    const fromView = await volumesFromView(db, candidates);
    expect(fromView).toHaveLength(candidates.length);
    expect(fromView).toEqual(candidates.map(setVolumeKg));
  });

  it('agrees across a generated matrix', async () => {
    const db = createTestDatabase();
    await seedCompletedSession(db);

    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            setType: fc.constantFrom(...SET_TYPES),
            weightKg: fc.option(fc.double({ min: 0, max: 500, noNaN: true }), { nil: null }),
            reps: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: null }),
          }),
          { minLength: 1, maxLength: 12 },
        ),
        async (candidates) => {
          const fromView = await volumesFromView(db, candidates);
          expect(fromView).toEqual(candidates.map(setVolumeKg));
        },
      ),
      { numRuns: 30 },
    );
  });
});
