import { parseLocalDate } from '../domain/localDate';
import type { BucketGranularity } from '../domain/statRange';

/**
 * Formats a bucket-start `YYYY-MM-DD` (a day, an ISO week's Monday, or a
 * month's 1st - `bucketStartFor`'s three shapes) into a chart x-axis tick
 * label. Day/week buckets show a short date; month buckets show month + year
 * so a multi-year "all time" range stays unambiguous. `en-US`
 * `Intl.DateTimeFormat` directly, matching this app's English-only-v1 (D-11)
 * date-formatting convention (`CalendarDayCell.formatCalendarDayLabel`,
 * `formatBodyMetricsDate`) rather than a translation-catalog template - the
 * same reasoning, applied to every time-bucketed chart in this directory
 * instead of duplicating the branch per card.
 */
export function formatChartAxisLabel(bucketStart: string, bucket: BucketGranularity): string {
  const date = parseLocalDate(bucketStart);
  return bucket === 'month'
    ? new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(date)
    : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}
