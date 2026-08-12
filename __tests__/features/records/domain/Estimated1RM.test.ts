import * as fc from 'fast-check';

import {
  brzyckiFormula,
  epleyFormula,
  estimated1RM,
  isRecordEligibleSetType,
  MAX_ELIGIBLE_REPS,
  RECORD_ELIGIBLE_SET_TYPES,
  SET_TYPES,
  type OneRmFormula,
  type SetType,
} from '@/features/records/domain/Estimated1RM';

/**
 * ADR-0015 Decision 1: "Guard rails, which matter more than the formula
 * choice." This file tests the guard rails exhaustively first, then the two
 * formulas, then a monotonicity property that must hold regardless of which
 * formula is injected.
 */

const INELIGIBLE_SET_TYPES = SET_TYPES.filter((setType) => !RECORD_ELIGIBLE_SET_TYPES.has(setType));

describe('isRecordEligibleSetType', () => {
  it('is true only for normal and failure', () => {
    for (const setType of SET_TYPES) {
      expect(isRecordEligibleSetType(setType)).toBe(setType === 'normal' || setType === 'failure');
    }
  });
});

describe('estimated1RM - guard rails (ADR-0015 Decision 1)', () => {
  it.each(INELIGIBLE_SET_TYPES)(
    'returns null for ineligible set type %s, regardless of weight/reps',
    (setType) => {
      expect(
        estimated1RM({ weightKg: 100, reps: 5, setType: setType as SetType }, epleyFormula),
      ).toBeNull();
    },
  );

  it.each([0, -1, -100])('returns null when weightKg is %s (non-positive)', (weightKg) => {
    expect(estimated1RM({ weightKg, reps: 5, setType: 'normal' }, epleyFormula)).toBeNull();
  });

  it('returns null when weightKg is non-finite', () => {
    expect(
      estimated1RM({ weightKg: Number.NaN, reps: 5, setType: 'normal' }, epleyFormula),
    ).toBeNull();
    expect(
      estimated1RM(
        { weightKg: Number.POSITIVE_INFINITY, reps: 5, setType: 'normal' },
        epleyFormula,
      ),
    ).toBeNull();
  });

  it.each([0, -1])('returns null when reps is %s (not an actual performed rep)', (reps) => {
    expect(estimated1RM({ weightKg: 100, reps, setType: 'normal' }, epleyFormula)).toBeNull();
  });

  it('returns the weight itself when reps === 1, for both eligible set types and both formulas', () => {
    for (const setType of ['normal', 'failure'] as const) {
      expect(estimated1RM({ weightKg: 142.5, reps: 1, setType }, epleyFormula)).toBe(142.5);
      expect(estimated1RM({ weightKg: 142.5, reps: 1, setType }, brzyckiFormula)).toBe(142.5);
    }
  });

  it.each([13, 14, 20, 100])('returns null above %s reps (MAX_ELIGIBLE_REPS = 12)', (reps) => {
    expect(estimated1RM({ weightKg: 100, reps, setType: 'normal' }, epleyFormula)).toBeNull();
  });

  it('MAX_ELIGIBLE_REPS is 12, matching ADR-0015', () => {
    expect(MAX_ELIGIBLE_REPS).toBe(12);
  });

  it('does not return null at exactly 12 reps (the boundary is inclusive)', () => {
    expect(
      estimated1RM({ weightKg: 100, reps: 12, setType: 'normal' }, epleyFormula),
    ).not.toBeNull();
  });
});

describe('estimated1RM - formulas', () => {
  it('Epley: w * (1 + reps / 30)', () => {
    expect(estimated1RM({ weightKg: 100, reps: 10, setType: 'normal' }, epleyFormula)).toBeCloseTo(
      100 * (1 + 10 / 30),
      9,
    );
  });

  it('Brzycki: w * 36 / (37 - reps)', () => {
    expect(
      estimated1RM({ weightKg: 100, reps: 10, setType: 'normal' }, brzyckiFormula),
    ).toBeCloseTo((100 * 36) / (37 - 10), 9);
  });

  it('the two formulas agree closely but are not identical in the 2-12 rep range', () => {
    const epley = estimated1RM({ weightKg: 100, reps: 8, setType: 'normal' }, epleyFormula)!;
    const brzycki = estimated1RM({ weightKg: 100, reps: 8, setType: 'normal' }, brzyckiFormula)!;
    expect(epley).not.toBe(brzycki);
    expect(Math.abs(epley - brzycki) / epley).toBeLessThan(0.1);
  });

  it('the formula is injected, not imported - a caller-supplied formula is used verbatim', () => {
    const flatFormula: OneRmFormula = () => 999;
    expect(estimated1RM({ weightKg: 50, reps: 5, setType: 'normal' }, flatFormula)).toBe(999);
  });
});

describe('estimated1RM - properties', () => {
  const eligibleSetTypeArb = fc.constantFrom('normal', 'failure' as const);
  const repsArb = fc.integer({ min: 2, max: MAX_ELIGIBLE_REPS });
  const weightArb = fc.double({ min: Math.fround(0.01), max: 500, noNaN: true });

  it('is monotonically non-decreasing in weight for fixed reps and set type, for both formulas', () => {
    for (const formula of [epleyFormula, brzyckiFormula]) {
      fc.assert(
        fc.property(
          eligibleSetTypeArb,
          repsArb,
          weightArb,
          weightArb,
          (setType, reps, weightA, weightB) => {
            const lower = Math.min(weightA, weightB);
            const higher = Math.max(weightA, weightB);
            const lowerResult = estimated1RM({ weightKg: lower, reps, setType }, formula)!;
            const higherResult = estimated1RM({ weightKg: higher, reps, setType }, formula)!;
            expect(higherResult).toBeGreaterThanOrEqual(lowerResult);
          },
        ),
      );
    }
  });

  it('never returns a value below the weight actually lifted, for any eligible input (both formulas produce >= 1x bodyweight-of-the-lift multipliers in this rep range)', () => {
    for (const formula of [epleyFormula, brzyckiFormula]) {
      fc.assert(
        fc.property(eligibleSetTypeArb, repsArb, weightArb, (setType, reps, weightKg) => {
          const result = estimated1RM({ weightKg, reps, setType }, formula);
          expect(result).not.toBeNull();
          expect(result!).toBeGreaterThanOrEqual(weightKg);
        }),
      );
    }
  });

  it('is null for every ineligible set type, whatever the weight/reps', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...INELIGIBLE_SET_TYPES),
        fc.double({ min: 0.01, max: 500, noNaN: true }),
        fc.integer({ min: 1, max: MAX_ELIGIBLE_REPS }),
        (setType, weightKg, reps) => {
          expect(
            estimated1RM({ weightKg, reps, setType: setType as SetType }, epleyFormula),
          ).toBeNull();
        },
      ),
    );
  });
});
