import * as fc from 'fast-check';

import {
  CALORIES_PER_MINUTE,
  estimatedCalories,
} from '@/features/workout-logging/domain/EstimatedCalories';

describe('estimatedCalories', () => {
  it('applies the flat kcal-per-minute constant', () => {
    expect(estimatedCalories(60)).toBe(CALORIES_PER_MINUTE);
    expect(estimatedCalories(600)).toBe(CALORIES_PER_MINUTE * 10);
  });

  it('rounds to the nearest whole kcal', () => {
    // 70s -> 70/60 * 5 = 5.8333... -> rounds to 6.
    expect(estimatedCalories(70)).toBe(6);
    // 65s -> 65/60 * 5 = 5.4166... -> rounds to 5.
    expect(estimatedCalories(65)).toBe(5);
  });

  it('returns zero for zero duration', () => {
    expect(estimatedCalories(0)).toBe(0);
  });

  it('never goes negative for a negative or non-finite duration', () => {
    expect(estimatedCalories(-1)).toBe(0);
    expect(estimatedCalories(-3600)).toBe(0);
    expect(estimatedCalories(NaN)).toBe(0);
    expect(estimatedCalories(Infinity)).toBe(0);
    expect(estimatedCalories(-Infinity)).toBe(0);
  });

  it('is never negative for any finite duration input', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e9, max: 1e9, noNaN: true }), (durationSeconds) => {
        expect(estimatedCalories(durationSeconds)).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('is monotonic: a longer duration never yields fewer calories than a shorter one', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1e8, noNaN: true }),
        fc.double({ min: 0, max: 1e8, noNaN: true }),
        (a, b) => {
          const [shorter, longer] = a <= b ? [a, b] : [b, a];
          expect(estimatedCalories(longer)).toBeGreaterThanOrEqual(estimatedCalories(shorter));
        },
      ),
    );
  });

  it('returns an integer for any finite duration input', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e9, max: 1e9, noNaN: true }), (durationSeconds) => {
        expect(Number.isInteger(estimatedCalories(durationSeconds))).toBe(true);
      }),
    );
  });
});
