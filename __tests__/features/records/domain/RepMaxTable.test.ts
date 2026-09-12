import * as fc from 'fast-check';

import {
  brzyckiFormula,
  epleyFormula,
  estimated1RM,
  MAX_ELIGIBLE_REPS,
} from '@/features/records/domain/Estimated1RM';
import { computeRepMaxTable } from '@/features/records/domain/RepMaxTable';

describe('computeRepMaxTable', () => {
  it('returns an empty table for a non-positive or non-finite estimated 1RM', () => {
    for (const invalid of [0, -1, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(computeRepMaxTable(invalid, epleyFormula)).toEqual([]);
    }
  });

  it('returns one entry per rep count from 1 to MAX_ELIGIBLE_REPS, ascending', () => {
    const table = computeRepMaxTable(100, epleyFormula);
    expect(table).toHaveLength(MAX_ELIGIBLE_REPS);
    expect(table.map((entry) => entry.reps)).toEqual(
      Array.from({ length: MAX_ELIGIBLE_REPS }, (_, index) => index + 1),
    );
  });

  it('the 1-rep entry always equals the estimated 1RM itself, regardless of formula', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 500, noNaN: true }),
        fc.constantFrom(epleyFormula, brzyckiFormula),
        (e1rm, formula) => {
          const table = computeRepMaxTable(e1rm, formula);
          expect(table[0]!.reps).toBe(1);
          expect(table[0]!.weightKg).toBeCloseTo(e1rm, 9);
        },
      ),
    );
  });

  it('weight strictly decreases as rep count increases, for both formulas', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 500, noNaN: true }),
        fc.constantFrom(epleyFormula, brzyckiFormula),
        (e1rm, formula) => {
          const table = computeRepMaxTable(e1rm, formula);
          for (let i = 1; i < table.length; i += 1) {
            expect(table[i]!.weightKg).toBeLessThan(table[i - 1]!.weightKg);
          }
        },
      ),
    );
  });

  /**
   * The round-trip property this file exists to prove: feeding a table
   * entry's `weightKg`/`reps` back through `estimated1RM` (the same formula)
   * reproduces the original estimated 1RM, for every rep count the table
   * actually produces (1 through `MAX_ELIGIBLE_REPS` - `estimated1RM`'s own
   * guard rejects anything past that, so the table never generates an entry
   * outside the range the forward formula can verify).
   */
  it('round-trips through estimated1RM for every eligible rep count, both formulas', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 500, noNaN: true }),
        fc.constantFrom(
          { formula: epleyFormula, name: 'epley' as const },
          { formula: brzyckiFormula, name: 'brzycki' as const },
        ),
        (e1rm, { formula }) => {
          const table = computeRepMaxTable(e1rm, formula);
          for (const entry of table) {
            const reEstimated = estimated1RM(
              { weightKg: entry.weightKg, reps: entry.reps, setType: 'normal' },
              formula,
            );
            expect(reEstimated).not.toBeNull();
            expect(reEstimated!).toBeCloseTo(e1rm, 6);
          }
        },
      ),
    );
  });
});
