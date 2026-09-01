/**
 * A local transcription of `features/records/components/personalRecordFormatting.ts`'s
 * `formatAchievedDate` - not an import, deliberately: `records` barrel-exports
 * it, but `body-metrics`' own barrel declares this feature a leaf with "no
 * other feature depends on it either" (see `features/body-metrics/index.ts`'s
 * header comment) - importing `records` here would be the first incoming
 * edge that comment rules out. The same "duplicate, don't import"
 * precedent `features/statistics/domain/localDate.ts` already set against
 * `home`'s calendar-math primitives, for the identical dependency-graph
 * reason.
 */
export function formatBodyMetricsDate(timestampMs: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(timestampMs));
}
