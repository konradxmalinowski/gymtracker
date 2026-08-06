import * as fc from 'fast-check';

import { Weight } from '@/domain/Weight';

/**
 * ARCHITECTURE.md section 14.3 names unit-conversion round-trips as a
 * property-test target, and ADR-0009 explicitly calls out the lb display
 * round-trip as needing a property test, not just example-based tests: the
 * failure mode (a value entered as `225` redisplaying as `224.5`) is subtle
 * and easy to miss by inspection.
 */
describe('Weight - kilogram identity', () => {
  it('returns exactly the kilogram value it was constructed from', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true }), (kilograms) => {
        expect(Weight.fromKilograms(kilograms).toKilograms()).toBe(kilograms);
      }),
    );
  });

  it('considers two weights built from the same kilogram value equal', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true }), (kilograms) => {
        expect(Weight.fromKilograms(kilograms).equals(Weight.fromKilograms(kilograms))).toBe(true);
      }),
    );
  });

  it('considers weights built from different kilogram values unequal', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true }), fc.double({ noNaN: true }), (left, right) => {
        fc.pre(left !== right);
        expect(Weight.fromKilograms(left).equals(Weight.fromKilograms(right))).toBe(false);
      }),
    );
  });
});

describe('Weight.fromPounds() / toPounds()', () => {
  it('round-trips through the ADR-0009 conversion factor', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1000, noNaN: true }), (pounds) => {
        const kilograms = Weight.fromPounds(pounds).toKilograms();
        expect(Weight.fromKilograms(kilograms).toPounds()).toBeCloseTo(pounds, 9);
      }),
    );
  });
});

describe('Weight.toDisplayString() - ADR-0009 rounding table', () => {
  it('rounds kg to the nearest 0.25 and trims trailing zeros', () => {
    expect(Weight.fromKilograms(80).toDisplayString('kg')).toBe('80');
    expect(Weight.fromKilograms(82.5).toDisplayString('kg')).toBe('82.5');
    expect(Weight.fromKilograms(100.25).toDisplayString('kg')).toBe('100.25');
    expect(Weight.fromKilograms(80.1).toDisplayString('kg')).toBe('80');
    expect(Weight.fromKilograms(80.13).toDisplayString('kg')).toBe('80.25');
  });

  it('rounds lb to the nearest 0.5', () => {
    expect(Weight.fromPounds(225).toDisplayString('lb')).toBe('225');
    expect(Weight.fromPounds(135.2).toDisplayString('lb')).toBe('135');
    expect(Weight.fromPounds(135.3).toDisplayString('lb')).toBe('135.5');
  });

  it('matches the ADR-0009 worked example: 225 lb -> ~102.058 kg -> displays as 225 lb again', () => {
    const weight = Weight.fromPounds(225);
    expect(weight.toKilograms()).toBeCloseTo(102.058, 3);
    expect(weight.toDisplayString('lb')).toBe('225');
  });

  it('a value entered in lb, stored in kg, redisplays as the same lb value it was entered as (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 2000 }), (halfPounds) => {
        // Every multiple of 0.5 lb in [1, 1000] - the plausible entry range
        // under the app's own lb quick-adjust increments (ADR-0009).
        const pounds = halfPounds * 0.5;
        const weight = Weight.fromPounds(pounds);
        expect(weight.toDisplayString('lb')).toBe(String(pounds));
      }),
    );
  });

  it('a value entered in kg redisplays as the same kg value it was entered as (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 4, max: 4000 }), (quarterKilograms) => {
        // Every multiple of 0.25 kg in [1, 1000].
        const kilograms = quarterKilograms * 0.25;
        expect(Weight.fromKilograms(kilograms).toDisplayString('kg')).toBe(String(kilograms));
      }),
    );
  });
});
