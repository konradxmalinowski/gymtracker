import * as fc from 'fast-check';

import {
  addDaysToLocalDate,
  formatLocalDate,
  isLeapYear,
  parseLocalDate,
  startOfIsoWeek,
  startOfMonth,
} from '@/features/statistics/domain/localDate';

describe('parseLocalDate / formatLocalDate', () => {
  it('round-trips a YYYY-MM-DD string', () => {
    expect(formatLocalDate(parseLocalDate('2026-08-18'))).toBe('2026-08-18');
  });

  it('pads single-digit month/day', () => {
    expect(formatLocalDate(parseLocalDate('2026-01-05'))).toBe('2026-01-05');
  });
});

describe('addDaysToLocalDate', () => {
  it('adds within a month', () => {
    expect(addDaysToLocalDate('2026-08-18', 3)).toBe('2026-08-21');
  });

  it('crosses a month boundary', () => {
    expect(addDaysToLocalDate('2026-08-30', 3)).toBe('2026-09-02');
  });

  it('crosses a year boundary', () => {
    expect(addDaysToLocalDate('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('subtracts with a negative count', () => {
    expect(addDaysToLocalDate('2026-08-02', -3)).toBe('2026-07-30');
  });

  it('property: adding N then -N returns the original date', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date(Date.UTC(2000, 0, 1)), max: new Date(Date.UTC(2100, 0, 1)) }),
        fc.integer({ min: -1000, max: 1000 }),
        (date, days) => {
          const localDate = formatLocalDate(date);
          const roundTrip = addDaysToLocalDate(addDaysToLocalDate(localDate, days), -days);
          expect(roundTrip).toBe(localDate);
        },
      ),
    );
  });
});

describe('startOfIsoWeek', () => {
  it('a Monday maps to itself', () => {
    expect(startOfIsoWeek('2026-08-17')).toBe('2026-08-17'); // 2026-08-17 is a Monday
  });

  it('a Sunday maps to the Monday six days earlier', () => {
    expect(startOfIsoWeek('2026-08-23')).toBe('2026-08-17');
  });

  it('every day in the same ISO week maps to the same Monday', () => {
    const monday = '2026-08-17';
    for (let offset = 0; offset < 7; offset += 1) {
      expect(startOfIsoWeek(addDaysToLocalDate(monday, offset))).toBe(monday);
    }
  });

  it('crosses a month boundary correctly', () => {
    // 2026-09-01 is a Tuesday; its Monday is 2026-08-31.
    expect(startOfIsoWeek('2026-09-01')).toBe('2026-08-31');
  });
});

describe('startOfMonth', () => {
  it('returns the 1st of the same month', () => {
    expect(startOfMonth('2026-08-18')).toBe('2026-08-01');
  });
});

describe('isLeapYear', () => {
  it.each([
    [2024, true],
    [2025, false],
    [2000, true],
    [1900, false],
    [2028, true],
  ])('%i -> %s', (year, expected) => {
    expect(isLeapYear(year)).toBe(expected);
  });
});
