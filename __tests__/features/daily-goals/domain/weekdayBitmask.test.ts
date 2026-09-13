import * as fc from 'fast-check';
import {
  isWeekdayActive,
  weekdayIndexOf,
  type MondayBasedWeekdayIndex,
} from '@/features/daily-goals/domain/weekdayBitmask';

describe('isWeekdayActive', () => {
  it('reads bit0 as Monday', () => {
    expect(isWeekdayActive(0b0000001, 0)).toBe(true);
    expect(isWeekdayActive(0b0000001, 1)).toBe(false);
  });

  it('reads bit6 as Sunday', () => {
    expect(isWeekdayActive(0b1000000, 6)).toBe(true);
    expect(isWeekdayActive(0b1000000, 5)).toBe(false);
  });

  it('127 (every bit set) is active on every weekday', () => {
    for (let day = 0; day <= 6; day += 1) {
      expect(isWeekdayActive(127, day as MondayBasedWeekdayIndex)).toBe(true);
    }
  });

  it('a Mon/Wed/Fri mask (bits 0,2,4 = 0b0010101 = 21) is active only on those days', () => {
    const mask = 0b0010101;
    expect(isWeekdayActive(mask, 0)).toBe(true); // Mon
    expect(isWeekdayActive(mask, 1)).toBe(false); // Tue
    expect(isWeekdayActive(mask, 2)).toBe(true); // Wed
    expect(isWeekdayActive(mask, 3)).toBe(false); // Thu
    expect(isWeekdayActive(mask, 4)).toBe(true); // Fri
    expect(isWeekdayActive(mask, 5)).toBe(false); // Sat
    expect(isWeekdayActive(mask, 6)).toBe(false); // Sun
  });
});

describe('isWeekdayActive - properties', () => {
  it("for any mask in the schema's valid 1-127 range, exactly popcount(mask) weekdays are active", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 127 }), (mask) => {
        const activeCount = [0, 1, 2, 3, 4, 5, 6].filter((day) =>
          isWeekdayActive(mask, day as MondayBasedWeekdayIndex),
        ).length;
        const popcount = mask
          .toString(2)
          .split('')
          .filter((bit) => bit === '1').length;
        expect(activeCount).toBe(popcount);
      }),
    );
  });
});

describe('weekdayIndexOf', () => {
  it.each([
    ['2026-09-07', 0], // Monday
    ['2026-09-08', 1], // Tuesday
    ['2026-09-09', 2], // Wednesday
    ['2026-09-10', 3], // Thursday
    ['2026-09-11', 4], // Friday
    ['2026-09-12', 5], // Saturday
    ['2026-09-13', 6], // Sunday
  ])('%s maps to Monday-based index %i', (localDate, expected) => {
    expect(weekdayIndexOf(localDate)).toBe(expected);
  });

  it('agrees with isWeekdayActive for a mask covering only that weekday', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2026, max: 2030 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        (year, month, day) => {
          const localDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const index = weekdayIndexOf(localDate);
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThanOrEqual(6);
          const soleMask = 1 << index;
          expect(isWeekdayActive(soleMask, index)).toBe(true);
        },
      ),
    );
  });
});
