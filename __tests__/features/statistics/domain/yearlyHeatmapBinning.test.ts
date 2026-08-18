import * as fc from 'fast-check';

import { computeYearlyHeatmap } from '@/features/statistics/domain/yearlyHeatmapBinning';

describe('computeYearlyHeatmap', () => {
  it('fills every day of a non-leap year with level 0 when there is no data', () => {
    const days = computeYearlyHeatmap([], 2026);
    expect(days).toHaveLength(365);
    expect(days.every((day) => day.level === 0)).toBe(true);
    expect(days[0]!.localDate).toBe('2026-01-01');
    expect(days.at(-1)!.localDate).toBe('2026-12-31');
  });

  it('fills 366 days for a leap year', () => {
    const days = computeYearlyHeatmap([], 2024);
    expect(days).toHaveLength(366);
    expect(days.at(-1)!.localDate).toBe('2024-12-31');
  });

  it('a day with no matching row is level 0 with volumeKg 0', () => {
    const days = computeYearlyHeatmap([{ localDate: '2026-06-01', volumeKg: 1000 }], 2026);
    const untrainedDay = days.find((day) => day.localDate === '2026-06-02')!;
    expect(untrainedDay).toEqual({ localDate: '2026-06-02', volumeKg: 0, level: 0 });
  });

  it('a single trained day gets level 1 (the only quartile it can occupy)', () => {
    const days = computeYearlyHeatmap([{ localDate: '2026-06-01', volumeKg: 500 }], 2026);
    const trainedDay = days.find((day) => day.localDate === '2026-06-01')!;
    expect(trainedDay.level).toBe(1);
  });

  it('quantile-bins four distinct trained-day volumes into levels 1-4', () => {
    const rows = [
      { localDate: '2026-01-01', volumeKg: 100 },
      { localDate: '2026-01-02', volumeKg: 200 },
      { localDate: '2026-01-03', volumeKg: 300 },
      { localDate: '2026-01-04', volumeKg: 400 },
    ];
    const days = computeYearlyHeatmap(rows, 2026);
    const levelByDate = new Map(days.map((day) => [day.localDate, day.level]));
    expect(levelByDate.get('2026-01-01')).toBe(1);
    expect(levelByDate.get('2026-01-02')).toBe(2);
    expect(levelByDate.get('2026-01-03')).toBe(3);
    expect(levelByDate.get('2026-01-04')).toBe(4);
  });

  it('the highest-volume day is always level 4 (or higher-ranked than the lowest) for any distinct set of volumes', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 100000 }), { minLength: 2, maxLength: 20 }),
        (volumes) => {
          const rows = volumes.map((volumeKg, index) => ({
            localDate: `2026-01-${String(index + 1).padStart(2, '0')}`,
            volumeKg,
          }));
          const days = computeYearlyHeatmap(rows, 2026);
          const trainedDays = days.filter((day) => day.volumeKg > 0);
          const maxVolume = Math.max(...volumes);
          const minVolume = Math.min(...volumes);
          const maxDay = trainedDays.find((day) => day.volumeKg === maxVolume)!;
          const minDay = trainedDays.find((day) => day.volumeKg === minVolume)!;
          expect(maxDay.level).toBeGreaterThanOrEqual(minDay.level);
          expect(trainedDays.every((day) => day.level >= 1 && day.level <= 4)).toBe(true);
        },
      ),
    );
  });

  it('every day is either level 0 (untrained) or 1-4 (trained), never negative or above 4', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            day: fc.integer({ min: 1, max: 28 }),
            volumeKg: fc.integer({ min: 0, max: 5000 }),
          }),
          {
            maxLength: 28,
          },
        ),
        (entries) => {
          const rows = entries.map((entry) => ({
            localDate: `2026-02-${String(entry.day).padStart(2, '0')}`,
            volumeKg: entry.volumeKg,
          }));
          const days = computeYearlyHeatmap(rows, 2026);
          expect(days.every((day) => day.level >= 0 && day.level <= 4)).toBe(true);
        },
      ),
    );
  });
});
