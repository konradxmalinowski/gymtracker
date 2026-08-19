import * as fc from 'fast-check';

import { computeDayIntensities } from '@/features/calendar/domain/intensityBinning';

describe('computeDayIntensities', () => {
  it('a day absent from rows entirely is level 0 with totalVolumeKg 0', () => {
    const days = computeDayIntensities(
      [{ localDate: '2026-06-01', totalVolumeKg: 1000 }],
      ['2026-06-01', '2026-06-02'],
    );
    const untrainedDay = days.find((day) => day.localDate === '2026-06-02')!;

    expect(untrainedDay).toEqual({ localDate: '2026-06-02', totalVolumeKg: 0, level: 0 });
  });

  it('a day present in rows with totalVolumeKg <= 0 is level 0, even though it is technically "in" the input', () => {
    const days = computeDayIntensities(
      [{ localDate: '2026-06-01', totalVolumeKg: 0 }],
      ['2026-06-01'],
    );
    expect(days[0]!.level).toBe(0);
  });

  it('a negative totalVolumeKg row is also level 0', () => {
    const days = computeDayIntensities(
      [{ localDate: '2026-06-01', totalVolumeKg: -5 }],
      ['2026-06-01'],
    );
    expect(days[0]!.level).toBe(0);
  });

  it('a single trained day gets level 1 (the only quartile it can occupy)', () => {
    const days = computeDayIntensities(
      [{ localDate: '2026-06-01', totalVolumeKg: 500 }],
      ['2026-06-01'],
    );
    expect(days[0]!.level).toBe(1);
  });

  it('quantile-bins four distinct trained-day volumes into levels 1-4', () => {
    const rows = [
      { localDate: '2026-01-01', totalVolumeKg: 100 },
      { localDate: '2026-01-02', totalVolumeKg: 200 },
      { localDate: '2026-01-03', totalVolumeKg: 300 },
      { localDate: '2026-01-04', totalVolumeKg: 400 },
    ];
    const days = computeDayIntensities(
      rows,
      rows.map((row) => row.localDate),
    );
    const levelByDate = new Map(days.map((day) => [day.localDate, day.level]));

    expect(levelByDate.get('2026-01-01')).toBe(1);
    expect(levelByDate.get('2026-01-02')).toBe(2);
    expect(levelByDate.get('2026-01-03')).toBe(3);
    expect(levelByDate.get('2026-01-04')).toBe(4);
  });

  it('fewer than 4 trained days still bins every trained day to at least level 1', () => {
    const rows = [
      { localDate: '2026-01-01', totalVolumeKg: 100 },
      { localDate: '2026-01-02', totalVolumeKg: 200 },
    ];
    const days = computeDayIntensities(rows, ['2026-01-01', '2026-01-02', '2026-01-03']);
    const trainedDays = days.filter((day) => day.totalVolumeKg > 0);

    expect(trainedDays).toHaveLength(2);
    expect(trainedDays.every((day) => day.level >= 1)).toBe(true);
    expect(days.find((day) => day.localDate === '2026-01-03')!.level).toBe(0);
  });

  it('property: the highest-volume trained day is always level 4 and the lowest is always level 1, for any set of distinct trained-day volumes', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 100_000 }), { minLength: 2, maxLength: 20 }),
        (volumes) => {
          const rows = volumes.map((totalVolumeKg, index) => ({
            localDate: `2026-01-${String(index + 1).padStart(2, '0')}`,
            totalVolumeKg,
          }));
          const days = computeDayIntensities(
            rows,
            rows.map((row) => row.localDate),
          );
          const maxVolume = Math.max(...volumes);
          const minVolume = Math.min(...volumes);
          const maxDay = days.find((day) => day.totalVolumeKg === maxVolume)!;
          const minDay = days.find((day) => day.totalVolumeKg === minVolume)!;

          expect(maxDay.level).toBe(4);
          expect(minDay.level).toBe(1);
          expect(days.every((day) => day.level >= 1 && day.level <= 4)).toBe(true);
        },
      ),
    );
  });

  it('property: a day never present in rows is always level 0, regardless of how many other days are trained', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            day: fc.integer({ min: 1, max: 20 }),
            totalVolumeKg: fc.integer({ min: 1, max: 5000 }),
          }),
          { maxLength: 20 },
        ),
        (entries) => {
          const rows = entries.map((entry) => ({
            localDate: `2026-02-${String(entry.day).padStart(2, '0')}`,
            totalVolumeKg: entry.totalVolumeKg,
          }));
          const allLocalDates = Array.from(
            { length: 28 },
            (_, i) => `2026-02-${String(i + 1).padStart(2, '0')}`,
          );
          const rowDates = new Set(rows.map((row) => row.localDate));
          const days = computeDayIntensities(rows, allLocalDates);
          const untrainedDays = days.filter((day) => !rowDates.has(day.localDate));

          expect(untrainedDays.every((day) => day.level === 0)).toBe(true);
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
            totalVolumeKg: fc.integer({ min: 0, max: 5000 }),
          }),
          { maxLength: 28 },
        ),
        (entries) => {
          const rows = entries.map((entry) => ({
            localDate: `2026-02-${String(entry.day).padStart(2, '0')}`,
            totalVolumeKg: entry.totalVolumeKg,
          }));
          const allLocalDates = Array.from(
            { length: 28 },
            (_, i) => `2026-02-${String(i + 1).padStart(2, '0')}`,
          );
          const days = computeDayIntensities(rows, allLocalDates);

          expect(days.every((day) => day.level >= 0 && day.level <= 4)).toBe(true);
          expect(days).toHaveLength(28);
        },
      ),
    );
  });
});
