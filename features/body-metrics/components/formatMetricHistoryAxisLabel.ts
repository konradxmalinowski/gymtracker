/**
 * A short, tick-sized date label ("Aug 15") for `MetricHistoryScreen`'s
 * chart x-axis - distinct from `formatBodyMetricsDate`'s full "Aug 15,
 * 2026" used for the entry list below the chart, where the year still
 * matters. A local transcription of `features/statistics/components/
 * formatChartAxisLabel.ts`'s day-bucket branch, not an import:
 * `features/statistics` doesn't barrel-export that helper, and reaching
 * past its barrel into the file directly would be a lint violation (rule
 * 4, cross-feature imports only through a barrel) - the same
 * "duplicate, don't import" precedent `formatBodyMetricsDate.ts`'s own
 * header comment already documents against `records`.
 *
 * Parses `localDate` (`YYYY-MM-DD`) as UTC midnight, never the host's
 * local timezone, so the label is stable regardless of where the app runs -
 * matching `formatChartAxisLabel`'s own `parseLocalDate` convention.
 */
export function formatMetricHistoryAxisLabel(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}
