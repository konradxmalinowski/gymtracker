import * as fc from 'fast-check';

import { calculateStreak } from '@/features/home/domain/StreakCalculator';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Test-local mirror of the file-under-test's own UTC-anchored date helpers - kept separate deliberately, so the test does not import (and therefore cannot silently share a bug with) the implementation's internals. */
function addDays(localDate: string, days: number): string {
  const parts = localDate.split('-');
  const epochMs =
    Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])) + days * ONE_DAY_MS;
  const date = new Date(epochMs);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** `count` consecutive local dates ending at (and including) `endLocalDate`. */
function consecutiveDatesEndingAt(endLocalDate: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(endLocalDate, -i));
}

describe('calculateStreak', () => {
  it('returns 0 for empty input', () => {
    expect(calculateStreak([], '2026-08-14')).toBe(0);
  });

  it('counts N when today is trained, N consecutive days ending today', () => {
    const trained = consecutiveDatesEndingAt('2026-08-14', 5);
    expect(calculateStreak(trained, '2026-08-14')).toBe(5);
  });

  it('grace rule: today not trained but yesterday was, N consecutive days ending yesterday', () => {
    const trained = consecutiveDatesEndingAt('2026-08-13', 5);
    expect(calculateStreak(trained, '2026-08-14')).toBe(5);
  });

  it('a gap in the middle stops the count there', () => {
    // Trained 2026-08-14, 08-13, 08-12, then a gap at 08-11, then 08-10 trained too.
    const trained = ['2026-08-14', '2026-08-13', '2026-08-12', '2026-08-10'];
    expect(calculateStreak(trained, '2026-08-14')).toBe(3);
  });

  it('breaks to 0 when neither today nor yesterday was trained', () => {
    const trained = ['2026-08-10'];
    expect(calculateStreak(trained, '2026-08-14')).toBe(0);
  });

  it('is correct across a DST spring-forward boundary (US, 2026-03-08)', () => {
    const trained = consecutiveDatesEndingAt('2026-03-09', 4);
    expect(trained).toEqual(['2026-03-09', '2026-03-08', '2026-03-07', '2026-03-06']);
    expect(calculateStreak(trained, '2026-03-09')).toBe(4);
  });

  it('is correct across a DST fall-back boundary (US, 2026-11-01)', () => {
    const trained = consecutiveDatesEndingAt('2026-11-02', 4);
    expect(trained).toEqual(['2026-11-02', '2026-11-01', '2026-10-31', '2026-10-30']);
    expect(calculateStreak(trained, '2026-11-02')).toBe(4);
  });

  it('is correct across a local-midnight/month boundary', () => {
    const trained = consecutiveDatesEndingAt('2026-09-01', 3);
    expect(trained).toEqual(['2026-09-01', '2026-08-31', '2026-08-30']);
    expect(calculateStreak(trained, '2026-09-01')).toBe(3);
  });

  it('tolerates duplicate and unsorted input', () => {
    const trained = ['2026-08-12', '2026-08-14', '2026-08-14', '2026-08-13', '2026-08-13'];
    expect(calculateStreak(trained, '2026-08-14')).toBe(3);
  });

  it('property: N consecutive trained days ending today always yields a streak of N', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 60 }),
        fc.integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2030, 11, 31) }),
        (n, anchorEpochMs) => {
          const anchorDate = new Date(anchorEpochMs);
          const today = `${anchorDate.getUTCFullYear()}-${String(anchorDate.getUTCMonth() + 1).padStart(2, '0')}-${String(anchorDate.getUTCDate()).padStart(2, '0')}`;
          const trained = n === 0 ? [] : consecutiveDatesEndingAt(today, n);
          expect(calculateStreak(trained, today)).toBe(n);
        },
      ),
    );
  });

  it('property: shuffling and duplicating the input never changes the result', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30 }),
        fc.array(fc.integer({ min: 0, max: 2 }), { minLength: 0, maxLength: 30 }),
        (n, dupeCounts) => {
          const today = '2026-08-14';
          const base = n === 0 ? [] : consecutiveDatesEndingAt(today, n);
          const expanded = base.flatMap((date, i) => Array((dupeCounts[i] ?? 0) + 1).fill(date));
          const shuffled = [...expanded].reverse();
          expect(calculateStreak(shuffled, today)).toBe(n);
        },
      ),
    );
  });
});
