import type { BucketGranularity } from './statRange';
import { addDaysToLocalDate, startOfIsoWeek, startOfMonth } from './localDate';

/**
 * Every bucketing decision in this feature happens here, in JS, over
 * already-cheap day-level SQL aggregates (`GROUP BY local_date`) - never as
 * a second, independently-hand-written SQL date-bucket expression. SQLite's
 * `date()` modifiers can express an ISO week start, but keeping that logic
 * in exactly one place (this file) is what guarantees the SQL query's
 * per-day rows and the chart's per-bucket points can never drift apart, and
 * keeps every repository method's SQL simple and easy to verify. Re-bucketing
 * a range's worth of day rows (at most 366 of them, already scalar
 * aggregates, never raw sets/sessions) is a tiny second-stage reduction, not
 * the "load-all-then-sum-in-JS" pattern CQRS-lite forbids - that rule is
 * about summing a large raw dataset in JS instead of `SUM()`; the `SUM()`/
 * `COUNT()` already happened in SQL, this just re-groups already-aggregated
 * rows.
 */

/** Maps any `YYYY-MM-DD` date to the start of the bucket it belongs to. */
export function bucketStartFor(localDate: string, bucket: BucketGranularity): string {
  switch (bucket) {
    case 'day':
      return localDate;
    case 'week':
      return startOfIsoWeek(localDate);
    case 'month':
      return startOfMonth(localDate);
  }
}

/** Generates every bucket-start date between `localDateFrom` and `localDateTo` (inclusive), in ascending order, with no duplicates - the full x-axis a chart should render even where no row exists for a given bucket. */
export function generateBucketBoundaries(
  localDateFrom: string,
  localDateTo: string,
  bucket: BucketGranularity,
): string[] {
  const boundaries: string[] = [];
  let cursor = bucketStartFor(localDateFrom, bucket);
  const lastBoundary = bucketStartFor(localDateTo, bucket);

  while (cursor <= lastBoundary) {
    boundaries.push(cursor);
    cursor =
      bucket === 'month'
        ? nextMonthStart(cursor)
        : addDaysToLocalDate(cursor, bucket === 'week' ? 7 : 1);
  }
  return boundaries;
}

function nextMonthStart(monthStart: string): string {
  const [year, month] = monthStart.split('-').map(Number);
  const nextMonth = month! === 12 ? 1 : month! + 1;
  const nextYear = month! === 12 ? year! + 1 : year!;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
}

/**
 * Groups already-day-level rows into buckets and reduces each bucket with
 * `reducer` - `0` (via `reducer([])`) for every boundary with no matching
 * rows, so the result is always a complete, gap-free series.
 */
export function aggregateDailyRowsIntoBuckets<T extends { localDate: string }>(
  rows: readonly T[],
  boundaries: readonly string[],
  bucket: BucketGranularity,
  reducer: (rowsInBucket: readonly T[]) => number,
): { bucketStart: string; value: number }[] {
  const byBucket = new Map<string, T[]>();
  for (const row of rows) {
    const bucketStart = bucketStartFor(row.localDate, bucket);
    const existing = byBucket.get(bucketStart);
    if (existing) {
      existing.push(row);
    } else {
      byBucket.set(bucketStart, [row]);
    }
  }
  return boundaries.map((bucketStart) => ({
    bucketStart,
    value: reducer(byBucket.get(bucketStart) ?? []),
  }));
}
