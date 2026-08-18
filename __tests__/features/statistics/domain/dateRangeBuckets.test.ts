import {
  aggregateDailyRowsIntoBuckets,
  bucketStartFor,
  generateBucketBoundaries,
} from '@/features/statistics/domain/dateRangeBuckets';

describe('bucketStartFor', () => {
  it('day: returns the date unchanged', () => {
    expect(bucketStartFor('2026-08-18', 'day')).toBe('2026-08-18');
  });

  it('week: returns the ISO Monday', () => {
    expect(bucketStartFor('2026-08-19', 'week')).toBe('2026-08-17');
  });

  it('month: returns the 1st of the month', () => {
    expect(bucketStartFor('2026-08-19', 'month')).toBe('2026-08-01');
  });
});

describe('generateBucketBoundaries', () => {
  it('day bucket: one boundary per calendar day, inclusive', () => {
    const boundaries = generateBucketBoundaries('2026-08-01', '2026-08-05', 'day');
    expect(boundaries).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
    ]);
  });

  it('week bucket: one boundary per ISO week spanned', () => {
    // 2026-08-01 (Sat) is in the week starting 2026-07-27; 2026-08-19 (Wed) is
    // in the week starting 2026-08-17 - three week boundaries in between.
    const boundaries = generateBucketBoundaries('2026-08-01', '2026-08-19', 'week');
    expect(boundaries).toEqual(['2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17']);
  });

  it('month bucket: one boundary per calendar month spanned, including a year rollover', () => {
    const boundaries = generateBucketBoundaries('2026-11-15', '2027-02-03', 'month');
    expect(boundaries).toEqual(['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01']);
  });

  it('a single-day range yields exactly one boundary', () => {
    expect(generateBucketBoundaries('2026-08-18', '2026-08-18', 'day')).toEqual(['2026-08-18']);
  });

  it('boundaries are always sorted ascending with no duplicates', () => {
    const boundaries = generateBucketBoundaries('2025-01-01', '2026-12-31', 'month');
    const sorted = [...boundaries].sort();
    expect(boundaries).toEqual(sorted);
    expect(new Set(boundaries).size).toBe(boundaries.length);
  });
});

describe('aggregateDailyRowsIntoBuckets', () => {
  it('gap-fills every boundary with 0 when no row matches', () => {
    const boundaries = generateBucketBoundaries('2026-08-01', '2026-08-03', 'day');
    const result = aggregateDailyRowsIntoBuckets<{ localDate: string; value: number }>(
      [],
      boundaries,
      'day',
      (rows) => rows.reduce((sum, row) => sum + row.value, 0),
    );
    expect(result).toEqual([
      { bucketStart: '2026-08-01', value: 0 },
      { bucketStart: '2026-08-02', value: 0 },
      { bucketStart: '2026-08-03', value: 0 },
    ]);
  });

  it('sums multiple day-rows that fall into the same week bucket', () => {
    const boundaries = generateBucketBoundaries('2026-08-17', '2026-08-23', 'week');
    const rows = [
      { localDate: '2026-08-17', value: 10 },
      { localDate: '2026-08-19', value: 5 },
      { localDate: '2026-08-23', value: 2 },
    ];
    const result = aggregateDailyRowsIntoBuckets(rows, boundaries, 'week', (rowsInBucket) =>
      rowsInBucket.reduce((sum, row) => sum + row.value, 0),
    );
    expect(result).toEqual([{ bucketStart: '2026-08-17', value: 17 }]);
  });

  it('keeps rows in separate buckets when they cross a boundary', () => {
    const boundaries = generateBucketBoundaries('2026-08-01', '2026-09-02', 'month');
    const rows = [
      { localDate: '2026-08-15', value: 3 },
      { localDate: '2026-09-01', value: 4 },
    ];
    const result = aggregateDailyRowsIntoBuckets(rows, boundaries, 'month', (rowsInBucket) =>
      rowsInBucket.reduce((sum, row) => sum + row.value, 0),
    );
    expect(result).toEqual([
      { bucketStart: '2026-08-01', value: 3 },
      { bucketStart: '2026-09-01', value: 4 },
    ]);
  });
});
