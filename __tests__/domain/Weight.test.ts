import * as fc from 'fast-check';

import { Weight } from '@/domain/Weight';

/**
 * ARCHITECTURE.md section 14.3 names unit-conversion round-trips as a
 * property-test target. `Weight` currently only round-trips kilograms (the
 * storage unit) - the lb conversions land with the settings/body-metrics
 * phases. The property below is written so that it keeps holding, unchanged,
 * once those arrive: whatever `fromKilograms` accepts, `toKilograms` must give
 * back bit-for-bit, because every persisted weight in the database goes through
 * this pair.
 */
describe('Weight', () => {
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
