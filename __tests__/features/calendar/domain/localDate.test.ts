import * as fc from 'fast-check';

import {
  addDaysToLocalDate,
  addMonthsToLocalDate,
  endOfMonth,
  formatLocalDate,
  generateDateRange,
  isSameYearMonth,
  parseLocalDate,
  startOfIsoWeek,
  startOfMonth,
} from '@/features/calendar/domain/localDate';

/** Leap-year-aware days-in-month, independent of the module under test - used only to compute expected values in property tests. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

describe('parseLocalDate / formatLocalDate', () => {
  it('round-trips a YYYY-MM-DD string', () => {
    expect(formatLocalDate(parseLocalDate('2026-08-18'))).toBe('2026-08-18');
  });

  it('pads single-digit month/day', () => {
    expect(formatLocalDate(parseLocalDate('2026-01-05'))).toBe('2026-01-05');
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

describe('endOfMonth', () => {
  it('returns the 30th for a 30-day month', () => {
    expect(endOfMonth('2026-04-05')).toBe('2026-04-30');
  });

  it('returns the 31st for a 31-day month', () => {
    expect(endOfMonth('2026-08-01')).toBe('2026-08-31');
  });

  it('rolls a December date over to Dec 31, never into January', () => {
    expect(endOfMonth('2026-12-15')).toBe('2026-12-31');
  });

  it('returns Feb 28 in a non-leap year', () => {
    expect(endOfMonth('2026-02-01')).toBe('2026-02-28');
  });

  it('returns Feb 29 in a leap year', () => {
    expect(endOfMonth('2024-02-15')).toBe('2024-02-29');
  });

  it('property: the result is always in the same year-month as the input, and the following day always rolls into the next month', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 2100 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        (year, month, day) => {
          const localDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const end = endOfMonth(localDate);
          expect(end.slice(0, 7)).toBe(localDate.slice(0, 7));
          expect(addDaysToLocalDate(end, 1).slice(0, 7)).not.toBe(localDate.slice(0, 7));
        },
      ),
    );
  });
});

describe('addMonthsToLocalDate', () => {
  it('adds a month within the same year', () => {
    expect(addMonthsToLocalDate('2026-03-15', 1)).toBe('2026-04-15');
  });

  it('subtracts a month with a negative delta', () => {
    expect(addMonthsToLocalDate('2026-03-15', -1)).toBe('2026-02-15');
  });

  it('crosses a year boundary forward', () => {
    expect(addMonthsToLocalDate('2026-12-01', 1)).toBe('2027-01-01');
  });

  it('crosses a year boundary backward', () => {
    expect(addMonthsToLocalDate('2026-01-01', -1)).toBe('2025-12-01');
  });

  it('clamps 31 January + 1 month to Feb 28 in a non-leap year, never rolling into March', () => {
    expect(addMonthsToLocalDate('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('clamps 31 January + 1 month to Feb 29 in a leap year', () => {
    expect(addMonthsToLocalDate('2024-01-31', 1)).toBe('2024-02-29');
  });

  it('clamps 31 March - 1 month to Feb 28, never rolling backward into January', () => {
    expect(addMonthsToLocalDate('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('property: a full-year round trip (+12 months) returns the same month and day', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 2099 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }), // day <= 28 avoids clamping so the round trip is exact
        (year, month, day) => {
          const localDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const monthDay = localDate.slice(5);
          expect(addMonthsToLocalDate(localDate, 12)).toBe(`${year + 1}-${monthDay}`);
          expect(addMonthsToLocalDate(localDate, -12)).toBe(`${year - 1}-${monthDay}`);
        },
      ),
    );
  });

  it('property: preserves day-of-month when the target month is long enough, clamps otherwise, and always lands inside the target month', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 2100 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 31 }),
        fc.integer({ min: -60, max: 60 }),
        (year, month, rawDay, months) => {
          const day = Math.min(rawDay, daysInMonth(year, month));
          const localDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const result = addMonthsToLocalDate(localDate, months);

          const totalMonthsFromEpoch = year * 12 + (month - 1) + months;
          const targetYear = Math.floor(totalMonthsFromEpoch / 12);
          const targetMonth = (totalMonthsFromEpoch % 12) + 1;
          const expectedDay = Math.min(day, daysInMonth(targetYear, targetMonth));

          expect(result).toBe(
            `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(expectedDay).padStart(2, '0')}`,
          );
          expect(
            isSameYearMonth(result, `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`),
          ).toBe(true);
        },
      ),
    );
  });
});

describe('isSameYearMonth', () => {
  it('true for two dates in the same year and month', () => {
    expect(isSameYearMonth('2026-08-01', '2026-08-31')).toBe(true);
  });

  it('false for two dates in different months of the same year', () => {
    expect(isSameYearMonth('2026-08-31', '2026-09-01')).toBe(false);
  });

  it('false for the same month in different years', () => {
    expect(isSameYearMonth('2025-08-15', '2026-08-15')).toBe(false);
  });
});

describe('generateDateRange', () => {
  it('is inclusive of both endpoints', () => {
    const dates = generateDateRange('2026-08-01', '2026-08-03');
    expect(dates[0]).toBe('2026-08-01');
    expect(dates.at(-1)).toBe('2026-08-03');
  });

  it('returns exactly one date when from === to', () => {
    expect(generateDateRange('2026-08-01', '2026-08-01')).toEqual(['2026-08-01']);
  });

  it('returns the correct length for a known range (a full 31-day January)', () => {
    expect(generateDateRange('2026-01-01', '2026-01-31')).toHaveLength(31);
  });

  it('crosses a month boundary gap-free and ascending', () => {
    expect(generateDateRange('2026-01-30', '2026-02-02')).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ]);
  });

  it('property: length always equals the day span plus one, gap-free and ascending', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date(Date.UTC(2000, 0, 1)), max: new Date(Date.UTC(2100, 0, 1)) }),
        fc.integer({ min: 0, max: 400 }),
        (date, spanDays) => {
          const from = formatLocalDate(date);
          const to = addDaysToLocalDate(from, spanDays);
          const range = generateDateRange(from, to);

          expect(range).toHaveLength(spanDays + 1);
          expect(range[0]).toBe(from);
          expect(range.at(-1)).toBe(to);
          for (let i = 1; i < range.length; i += 1) {
            expect(addDaysToLocalDate(range[i - 1]!, 1)).toBe(range[i]);
          }
        },
      ),
    );
  });
});
