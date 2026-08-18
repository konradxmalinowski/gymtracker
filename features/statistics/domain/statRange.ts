import { addDaysToLocalDate } from './localDate';

/** The four ranges the Statistics tab's range selector offers (Step 0 decision 1). */
export const STAT_RANGES = ['4w', '3m', '1y', 'all'] as const;
export type StatRange = (typeof STAT_RANGES)[number];

export type BucketGranularity = 'day' | 'week' | 'month';

/**
 * Step 0 decision 1: bucket size grows with range so every chart stays
 * readable without a manual bucket picker - `4w`/day, `3m`/week, `1y`/week,
 * `all`/month.
 */
export const RANGE_BUCKET: Record<StatRange, BucketGranularity> = {
  '4w': 'day',
  '3m': 'week',
  '1y': 'week',
  all: 'month',
};

const RANGE_DAYS: Record<Exclude<StatRange, 'all'>, number> = {
  '4w': 28,
  '3m': 90,
  '1y': 365,
};

/**
 * A date far enough in the past that no real training data predates it -
 * `all`'s lower bound. Avoids a second query to find the earliest session:
 * an empty prefix of the range is cheap for an indexed `local_date` scan and
 * doesn't affect correctness.
 */
export const ALL_TIME_FLOOR_LOCAL_DATE = '2000-01-01';

export interface ResolvedStatRange {
  localDateFrom: string;
  localDateTo: string;
  bucket: BucketGranularity;
}

/** Resolves a `StatRange` against `todayLocalDate` into concrete SQL bounds plus the bucket size to group by - repositories never resolve this themselves (Step 0 decision 5). */
export function resolveStatRange(range: StatRange, todayLocalDate: string): ResolvedStatRange {
  const bucket = RANGE_BUCKET[range];
  if (range === 'all') {
    return { localDateFrom: ALL_TIME_FLOOR_LOCAL_DATE, localDateTo: todayLocalDate, bucket };
  }
  const days = RANGE_DAYS[range];
  return {
    localDateFrom: addDaysToLocalDate(todayLocalDate, -(days - 1)),
    localDateTo: todayLocalDate,
    bucket,
  };
}
