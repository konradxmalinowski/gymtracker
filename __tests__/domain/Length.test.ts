import * as fc from 'fast-check';

import { Length } from '@/domain/Length';

describe('Length - centimeter identity', () => {
  it('returns exactly the centimeter value it was constructed from', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true }), (centimeters) => {
        expect(Length.fromCentimeters(centimeters).toCentimeters()).toBe(centimeters);
      }),
    );
  });

  it('considers two lengths built from the same centimeter value equal', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true }), (centimeters) => {
        expect(
          Length.fromCentimeters(centimeters).equals(Length.fromCentimeters(centimeters)),
        ).toBe(true);
      }),
    );
  });

  it('considers lengths built from different centimeter values unequal', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true }), fc.double({ noNaN: true }), (left, right) => {
        fc.pre(left !== right);
        expect(Length.fromCentimeters(left).equals(Length.fromCentimeters(right))).toBe(false);
      }),
    );
  });
});

describe('Length.fromInches() / toInches()', () => {
  it('round-trips through the ADR-0009 conversion factor', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 300, noNaN: true }), (inches) => {
        const centimeters = Length.fromInches(inches).toCentimeters();
        expect(Length.fromCentimeters(centimeters).toInches()).toBeCloseTo(inches, 9);
      }),
    );
  });
});

describe('Length.toDisplayString() - ADR-0009: 1 decimal in both units', () => {
  it('formats cm with exactly 1 decimal', () => {
    expect(Length.fromCentimeters(80).toDisplayString('cm')).toBe('80.0');
    expect(Length.fromCentimeters(82.54).toDisplayString('cm')).toBe('82.5');
  });

  it('formats in with exactly 1 decimal', () => {
    expect(Length.fromInches(30).toDisplayString('in')).toBe('30.0');
  });

  it('a value entered in inches, stored in cm, redisplays as the same 1-decimal inch value it was entered as (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3000 }), (tenthsOfAnInch) => {
        const inches = tenthsOfAnInch / 10;
        const length = Length.fromInches(inches);
        expect(length.toDisplayString('in')).toBe(inches.toFixed(1));
      }),
    );
  });
});
