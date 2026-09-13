import * as fc from 'fast-check';
import {
  enumerateLocalDates,
  formatLocalDate,
  parseLocalDate,
} from '@/features/daily-goals/domain/localDate';

describe('parseLocalDate / formatLocalDate', () => {
  it('round-trips a date string', () => {
    expect(formatLocalDate(parseLocalDate('2026-09-12'))).toBe('2026-09-12');
  });
});

describe('enumerateLocalDates', () => {
  it('returns a single-element array when from === to', () => {
    expect(enumerateLocalDates('2026-09-12', '2026-09-12')).toEqual(['2026-09-12']);
  });

  it('returns every date inclusive, ascending', () => {
    expect(enumerateLocalDates('2026-09-10', '2026-09-13')).toEqual([
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
    ]);
  });

  it('returns an empty array when from is after to', () => {
    expect(enumerateLocalDates('2026-09-13', '2026-09-10')).toEqual([]);
  });

  it('correctly crosses a month boundary', () => {
    expect(enumerateLocalDates('2026-08-30', '2026-09-02')).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ]);
  });
});

describe('enumerateLocalDates - properties', () => {
  it('the result length always equals the inclusive day span', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 60 }),
        (startOffsetDays, spanDays) => {
          const base = Date.UTC(2026, 0, 1);
          const from = formatLocalDate(base + startOffsetDays * 86_400_000);
          const to = formatLocalDate(base + (startOffsetDays + spanDays) * 86_400_000);
          expect(enumerateLocalDates(from, to)).toHaveLength(spanDays + 1);
        },
      ),
    );
  });
});
