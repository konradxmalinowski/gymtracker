import * as fc from 'fast-check';

import { calculatePlateBreakdown } from '@/features/workout-logging/domain/PlateCalculator';

const STANDARD_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];

describe('calculatePlateBreakdown', () => {
  it('an exactly-achievable target returns zero delta', () => {
    // 20kg bar + 2x25 per side (one 25kg plate) = 20 + 50 = 70.
    const result = calculatePlateBreakdown({
      targetWeightKg: 70,
      barWeightKg: 20,
      availablePlatesKg: STANDARD_PLATES_KG,
    });
    expect(result.achievedWeightKg).toBeCloseTo(70, 9);
    expect(result.deltaKg).toBeCloseTo(0, 9);
    expect(result.perSide).toEqual([{ plateWeightKg: 25, count: 1 }]);
  });

  it('greedily combines multiple plate sizes on one side when needed', () => {
    // 100kg -> 40kg per side -> greedy: one 25kg (15 left), one 15kg (0 left).
    const result = calculatePlateBreakdown({
      targetWeightKg: 100,
      barWeightKg: 20,
      availablePlatesKg: STANDARD_PLATES_KG,
    });
    expect(result.achievedWeightKg).toBeCloseTo(100, 9);
    expect(result.deltaKg).toBeCloseTo(0, 9);
    expect(result.perSide).toEqual([
      { plateWeightKg: 25, count: 1 },
      { plateWeightKg: 15, count: 1 },
    ]);
  });

  it('a target below the bar weight itself returns just the bar, with a positive delta', () => {
    const result = calculatePlateBreakdown({
      targetWeightKg: 10,
      barWeightKg: 20,
      availablePlatesKg: STANDARD_PLATES_KG,
    });
    expect(result.perSide).toEqual([]);
    expect(result.achievedWeightKg).toBe(20);
    expect(result.deltaKg).toBe(10);
  });

  it('an unreachable-in-between target under-loads rather than overshoots', () => {
    // 20 + 2x1.25 per side = 22.5, closest reachable at or below 23 with this set.
    const result = calculatePlateBreakdown({
      targetWeightKg: 23,
      barWeightKg: 20,
      availablePlatesKg: STANDARD_PLATES_KG,
    });
    expect(result.achievedWeightKg).toBeCloseTo(22.5, 9);
    expect(result.deltaKg).toBeCloseTo(-0.5, 9);
  });

  it('never includes a zero-count plate in the breakdown', () => {
    const result = calculatePlateBreakdown({
      targetWeightKg: 20,
      barWeightKg: 20,
      availablePlatesKg: STANDARD_PLATES_KG,
    });
    expect(result.perSide).toEqual([]);
  });

  it('ignores non-finite/non-positive plate sizes rather than crashing', () => {
    const result = calculatePlateBreakdown({
      targetWeightKg: 60,
      barWeightKg: 20,
      availablePlatesKg: [20, 0, -5, Number.NaN, Number.POSITIVE_INFINITY],
    });
    expect(result.achievedWeightKg).toBeCloseTo(60, 9);
    expect(result.perSide).toEqual([{ plateWeightKg: 20, count: 1 }]);
  });

  it('clamps a non-finite/negative bar weight or target to zero rather than crashing', () => {
    for (const barWeightKg of [Number.NaN, -5]) {
      expect(() =>
        calculatePlateBreakdown({
          targetWeightKg: 60,
          barWeightKg,
          availablePlatesKg: STANDARD_PLATES_KG,
        }),
      ).not.toThrow();
    }
    for (const targetWeightKg of [Number.NaN, -5]) {
      expect(() =>
        calculatePlateBreakdown({
          targetWeightKg,
          barWeightKg: 20,
          availablePlatesKg: STANDARD_PLATES_KG,
        }),
      ).not.toThrow();
    }
  });

  describe('properties, over the app default plate set', () => {
    it('achievedWeightKg always equals barWeightKg + 2x the summed per-side plates', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 300, noNaN: true }),
          fc.double({ min: 0, max: 30, noNaN: true }),
          (targetWeightKg, barWeightKg) => {
            const result = calculatePlateBreakdown({
              targetWeightKg,
              barWeightKg,
              availablePlatesKg: STANDARD_PLATES_KG,
            });
            const perSideSum = result.perSide.reduce(
              (sum, entry) => sum + entry.plateWeightKg * entry.count,
              0,
            );
            expect(result.achievedWeightKg).toBeCloseTo(result.barWeightKg + 2 * perSideSum, 9);
          },
        ),
      );
    });

    it('never overshoots the target once the bar alone is at or under it', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 300, noNaN: true }),
          fc.double({ min: 0, max: 30, noNaN: true }),
          (targetWeightKg, barWeightKg) => {
            fc.pre(targetWeightKg >= barWeightKg);
            const result = calculatePlateBreakdown({
              targetWeightKg,
              barWeightKg,
              availablePlatesKg: STANDARD_PLATES_KG,
            });
            expect(result.achievedWeightKg).toBeLessThanOrEqual(targetWeightKg + 1e-9);
          },
        ),
      );
    });

    it('every plate count is a positive integer', () => {
      fc.assert(
        fc.property(fc.double({ min: 0, max: 300, noNaN: true }), (targetWeightKg) => {
          const result = calculatePlateBreakdown({
            targetWeightKg,
            barWeightKg: 20,
            availablePlatesKg: STANDARD_PLATES_KG,
          });
          for (const entry of result.perSide) {
            expect(Number.isInteger(entry.count)).toBe(true);
            expect(entry.count).toBeGreaterThan(0);
          }
        }),
      );
    });

    it('deltaKg always equals achievedWeightKg minus the (clamped) target', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 300, noNaN: true }),
          fc.double({ min: 0, max: 30, noNaN: true }),
          (targetWeightKg, barWeightKg) => {
            const result = calculatePlateBreakdown({
              targetWeightKg,
              barWeightKg,
              availablePlatesKg: STANDARD_PLATES_KG,
            });
            const clampedTarget = targetWeightKg > 0 ? targetWeightKg : 0;
            expect(result.deltaKg).toBeCloseTo(result.achievedWeightKg - clampedTarget, 9);
          },
        ),
      );
    });
  });
});
