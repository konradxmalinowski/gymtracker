import * as fc from 'fast-check';
import { computeRemainingOccurrencesToday } from '@/features/daily-goals/domain/reminderOccurrences';

const NOON = new Date(2026, 8, 12, 12, 0, 0, 0); // 2026-09-12 12:00:00 local

describe('computeRemainingOccurrencesToday - scheduled', () => {
  it('returns the single occurrence when timeOfDay is still in the future today', () => {
    const result = computeRemainingOccurrencesToday(
      { reminderType: 'scheduled', timeOfDay: '18:30', intervalMinutes: null },
      NOON,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.getHours()).toBe(18);
    expect(result[0]!.getMinutes()).toBe(30);
    expect(result[0]!.getFullYear()).toBe(2026);
    expect(result[0]!.getMonth()).toBe(8);
    expect(result[0]!.getDate()).toBe(12);
  });

  it('returns empty when timeOfDay has already passed today', () => {
    const result = computeRemainingOccurrencesToday(
      { reminderType: 'scheduled', timeOfDay: '08:00', intervalMinutes: null },
      NOON,
    );
    expect(result).toEqual([]);
  });

  it('returns empty when timeOfDay equals now exactly (strictly future only)', () => {
    const exact = new Date(2026, 8, 12, 12, 0, 0, 0);
    const result = computeRemainingOccurrencesToday(
      { reminderType: 'scheduled', timeOfDay: '12:00', intervalMinutes: null },
      exact,
    );
    expect(result).toEqual([]);
  });

  it('returns empty for a null timeOfDay', () => {
    expect(
      computeRemainingOccurrencesToday(
        { reminderType: 'scheduled', timeOfDay: null, intervalMinutes: null },
        NOON,
      ),
    ).toEqual([]);
  });

  it('returns empty for a malformed timeOfDay', () => {
    expect(
      computeRemainingOccurrencesToday(
        { reminderType: 'scheduled', timeOfDay: '25:99', intervalMinutes: null },
        NOON,
      ),
    ).toEqual([]);
  });
});

describe('computeRemainingOccurrencesToday - interval', () => {
  it('generates every future step up to end of day, excluding "now" itself', () => {
    const eveningStart = new Date(2026, 8, 12, 22, 0, 0, 0);
    const result = computeRemainingOccurrencesToday(
      { reminderType: 'interval', timeOfDay: null, intervalMinutes: 60 },
      eveningStart,
    );
    // 23:00 and 23:59:xx would be the two theoretical steps at 22:00+60,+120;
    // 120 min from 22:00 is 00:00 next day, past end of day - excluded.
    expect(result).toHaveLength(1);
    expect(result[0]!.getHours()).toBe(23);
    expect(result[0]!.getDate()).toBe(12);
  });

  it('returns empty once no further step fits before end of day', () => {
    const lateNight = new Date(2026, 8, 12, 23, 55, 0, 0);
    const result = computeRemainingOccurrencesToday(
      { reminderType: 'interval', timeOfDay: null, intervalMinutes: 30 },
      lateNight,
    );
    expect(result).toEqual([]);
  });

  it('returns empty for a null/zero/negative intervalMinutes', () => {
    for (const intervalMinutes of [null, 0, -15]) {
      expect(
        computeRemainingOccurrencesToday(
          { reminderType: 'interval', timeOfDay: null, intervalMinutes },
          NOON,
        ),
      ).toEqual([]);
    }
  });

  it('every occurrence is strictly increasing and spaced exactly intervalMinutes apart', () => {
    const morning = new Date(2026, 8, 12, 6, 0, 0, 0);
    const result = computeRemainingOccurrencesToday(
      { reminderType: 'interval', timeOfDay: null, intervalMinutes: 90 },
      morning,
    );
    expect(result.length).toBeGreaterThan(1);
    for (let i = 1; i < result.length; i += 1) {
      expect(result[i]!.getTime() - result[i - 1]!.getTime()).toBe(90 * 60_000);
    }
  });
});

describe('computeRemainingOccurrencesToday - properties', () => {
  const nowArb = fc
    .integer({ min: 0, max: 23 * 60 + 59 })
    .map(
      (minuteOfDay) => new Date(2026, 8, 12, Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0),
    );

  it('interval: every occurrence is strictly after now and no later than local end of day', () => {
    fc.assert(
      fc.property(nowArb, fc.integer({ min: 15, max: 480 }), (now, intervalMinutes) => {
        const result = computeRemainingOccurrencesToday(
          { reminderType: 'interval', timeOfDay: null, intervalMinutes },
          now,
        );
        const endOfDay = new Date(2026, 8, 12, 23, 59, 59, 999).getTime();
        for (const occurrence of result) {
          expect(occurrence.getTime()).toBeGreaterThan(now.getTime());
          expect(occurrence.getTime()).toBeLessThanOrEqual(endOfDay);
        }
      }),
    );
  });

  it('interval: occurrence count is bounded by ceil(minutesLeftInDay / intervalMinutes)', () => {
    fc.assert(
      fc.property(nowArb, fc.integer({ min: 15, max: 480 }), (now, intervalMinutes) => {
        const result = computeRemainingOccurrencesToday(
          { reminderType: 'interval', timeOfDay: null, intervalMinutes },
          now,
        );
        const endOfDay = new Date(2026, 8, 12, 23, 59, 59, 999).getTime();
        const msLeft = endOfDay - now.getTime();
        const maxCount = Math.ceil(msLeft / (intervalMinutes * 60_000));
        expect(result.length).toBeLessThanOrEqual(maxCount);
      }),
    );
  });

  it('scheduled: a time strictly before now-of-day always yields zero occurrences', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 23 * 60 + 59 }), (minuteOfDay) => {
        const now = new Date(2026, 8, 12, Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);
        const earlierMinute = minuteOfDay - 1;
        const timeOfDay = `${String(Math.floor(earlierMinute / 60)).padStart(2, '0')}:${String(
          earlierMinute % 60,
        ).padStart(2, '0')}`;
        const result = computeRemainingOccurrencesToday(
          { reminderType: 'scheduled', timeOfDay, intervalMinutes: null },
          now,
        );
        expect(result).toEqual([]);
      }),
    );
  });
});
