import {
  ALL_TIME_FLOOR_LOCAL_DATE,
  RANGE_BUCKET,
  resolveStatRange,
  STAT_RANGES,
} from '@/features/statistics/domain/statRange';

describe('RANGE_BUCKET', () => {
  it('matches Step 0 decision 1 exactly', () => {
    expect(RANGE_BUCKET).toEqual({ '4w': 'day', '3m': 'week', '1y': 'week', all: 'month' });
  });

  it('covers every StatRange with no extras', () => {
    expect(Object.keys(RANGE_BUCKET).sort()).toEqual([...STAT_RANGES].sort());
  });
});

describe('resolveStatRange', () => {
  const today = '2026-08-18';

  it('4w: 28 days inclusive, day bucket', () => {
    const resolved = resolveStatRange('4w', today);
    expect(resolved).toEqual({ localDateFrom: '2026-07-22', localDateTo: today, bucket: 'day' });
  });

  it('3m: 90 days inclusive, week bucket', () => {
    const resolved = resolveStatRange('3m', today);
    expect(resolved).toEqual({ localDateFrom: '2026-05-21', localDateTo: today, bucket: 'week' });
  });

  it('1y: 365 days inclusive, week bucket', () => {
    const resolved = resolveStatRange('1y', today);
    expect(resolved).toEqual({ localDateFrom: '2025-08-19', localDateTo: today, bucket: 'week' });
  });

  it('all: floor date, month bucket', () => {
    const resolved = resolveStatRange('all', today);
    expect(resolved).toEqual({
      localDateFrom: ALL_TIME_FLOOR_LOCAL_DATE,
      localDateTo: today,
      bucket: 'month',
    });
  });

  it('every range resolves localDateFrom <= localDateTo', () => {
    for (const range of STAT_RANGES) {
      const resolved = resolveStatRange(range, today);
      expect(resolved.localDateFrom <= resolved.localDateTo).toBe(true);
    }
  });
});
