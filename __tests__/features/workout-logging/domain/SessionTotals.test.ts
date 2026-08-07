import * as fc from 'fast-check';

import {
  computeSessionTotals,
  sessionDurationSeconds,
  type SessionTotalsSetInput,
} from '@/features/workout-logging/domain/SessionTotals';
import { SET_TYPES, SET_TYPE_SEMANTICS } from '@/features/workout-logging/domain/setSemantics';

const HOUR = 60 * 60 * 1000;

function set(overrides: Partial<SessionTotalsSetInput> = {}): SessionTotalsSetInput {
  return { setType: 'normal', weightKg: 100, reps: 5, isCompleted: true, ...overrides };
}

describe('sessionDurationSeconds', () => {
  it('excludes paused time', () => {
    expect(
      sessionDurationSeconds({ startedAt: 0, finishedAt: HOUR, pausedMs: 10 * 60 * 1000 }),
    ).toBe(50 * 60);
  });

  it('truncates rather than rounds', () => {
    expect(sessionDurationSeconds({ startedAt: 0, finishedAt: 90_900, pausedMs: 0 })).toBe(90);
  });

  it('clamps at zero when paused time exceeds the elapsed window or the clock went backwards', () => {
    expect(sessionDurationSeconds({ startedAt: 0, finishedAt: 1000, pausedMs: 5000 })).toBe(0);
    expect(sessionDurationSeconds({ startedAt: HOUR, finishedAt: 0, pausedMs: 0 })).toBe(0);
  });

  it('is never negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 40 }),
        fc.integer({ min: 0, max: 2 ** 40 }),
        fc.integer({ min: 0, max: 2 ** 40 }),
        (startedAt, finishedAt, pausedMs) => {
          expect(
            sessionDurationSeconds({ startedAt, finishedAt, pausedMs }),
          ).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });
});

describe('computeSessionTotals', () => {
  const duration = { startedAt: 0, finishedAt: HOUR, pausedMs: 0 };

  it('counts only completed sets', () => {
    const totals = computeSessionTotals(duration, [
      set({ weightKg: 100, reps: 5 }),
      set({ weightKg: 100, reps: 5, isCompleted: false }),
    ]);
    expect(totals).toEqual({
      durationSeconds: 3600,
      totalVolumeKg: 500,
      totalSets: 1,
      totalReps: 5,
    });
  });

  it('applies the ADR-0006 set-count column: warmup and drop do not count, assisted and partial do', () => {
    const totals = computeSessionTotals(duration, [
      set({ setType: 'warmup', weightKg: 40, reps: 10 }),
      set({ setType: 'normal', weightKg: 100, reps: 5 }),
      set({ setType: 'drop', weightKg: 60, reps: 8 }),
      set({ setType: 'failure', weightKg: 100, reps: 3 }),
      set({ setType: 'assisted', weightKg: 20, reps: 6 }),
      set({ setType: 'partial', weightKg: 100, reps: 4 }),
    ]);

    expect(totals.totalSets).toBe(4);
    // 500 (normal) + 480 (drop) + 300 (failure); warmup/assisted/partial contribute nothing.
    expect(totals.totalVolumeKg).toBe(1280);
    // Reps are summed across every completed set regardless of type, matching v_session_summary.
    expect(totals.totalReps).toBe(10 + 5 + 8 + 3 + 6 + 4);
  });

  it('handles a session with no sets', () => {
    expect(computeSessionTotals(duration, [])).toEqual({
      durationSeconds: 3600,
      totalVolumeKg: 0,
      totalSets: 0,
      totalReps: 0,
    });
  });

  it('treats a null rep count as zero reps rather than as NaN', () => {
    const totals = computeSessionTotals(duration, [set({ weightKg: 100, reps: null })]);
    expect(totals.totalReps).toBe(0);
    expect(totals.totalVolumeKg).toBe(0);
  });

  it('never counts an incomplete set toward any total, whatever its type or values', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            setType: fc.constantFrom(...SET_TYPES),
            weightKg: fc.option(fc.double({ min: 0, max: 300, noNaN: true }), { nil: null }),
            reps: fc.option(fc.integer({ min: 0, max: 50 }), { nil: null }),
            isCompleted: fc.constant(false),
          }),
          { maxLength: 15 },
        ),
        (sets) => {
          const totals = computeSessionTotals(duration, sets);
          expect(totals.totalSets).toBe(0);
          expect(totals.totalVolumeKg).toBe(0);
          expect(totals.totalReps).toBe(0);
        },
      ),
    );
  });

  it('totalSets equals the number of completed sets whose type counts, for any generated session', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            setType: fc.constantFrom(...SET_TYPES),
            weightKg: fc.double({ min: 0, max: 300, noNaN: true }),
            reps: fc.integer({ min: 0, max: 50 }),
            isCompleted: fc.boolean(),
          }),
          { maxLength: 25 },
        ),
        (sets) => {
          const expected = sets.filter(
            (s) => s.isCompleted && SET_TYPE_SEMANTICS[s.setType].countsTowardSetCount,
          ).length;
          expect(computeSessionTotals(duration, sets).totalSets).toBe(expected);
        },
      ),
    );
  });
});
