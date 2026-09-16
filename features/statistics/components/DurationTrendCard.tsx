import Ionicons from '@expo/vector-icons/Ionicons';

import { ChartCard, LineChartView, summarizeSeries, type SeriesPoint } from '@/components/charts';
import { t } from '@/i18n';
import { color } from '@/theme/tokens';

import { RANGE_BUCKET, type StatRange } from '../domain/statRange';
import type { TimeBucket } from '../repository/StatisticsRepository';
import { formatChartAxisLabel } from './formatChartAxisLabel';

export interface DurationTrendCardProps {
  data: readonly TimeBucket[] | undefined;
  isPending: boolean;
  /** Drives the x-axis tick format (day/week/month) - defaults to `'3m'` for callers (tests, mostly) that don't track a range selector. */
  range?: StatRange | undefined;
  testID?: string | undefined;
}

/**
 * `statistics` feature component (beyond section 10's literal list - this
 * phase's plan). Average completed-session duration per bucket, roadmap
 * P11's "duration trend."
 */
export function DurationTrendCard({
  data,
  isPending,
  range = '3m',
  testID,
}: DurationTrendCardProps) {
  const bucket = RANGE_BUCKET[range];
  const points: SeriesPoint[] = (data ?? []).map((bucketPoint) => ({
    x: bucketPoint.bucketStart,
    value: bucketPoint.value > 0 ? bucketPoint.value / 60 : null,
  }));
  const isEmpty = points.every((point) => point.value === null);
  const summary = summarizeSeries(points);

  return (
    <ChartCard
      title={t('statistics.duration.title')}
      subtitle={t('statistics.duration.subtitle')}
      isPending={isPending}
      isEmpty={isEmpty}
      emptyIcon={<Ionicons name="time-outline" size={32} color={color.textTertiary} />}
      emptyTitle={t('statistics.duration.emptyTitle')}
      emptyMessage={t('statistics.duration.emptyMessage')}
      contentAccessibilityLabel={
        summary
          ? t('statistics.duration.accessibilityLabelTemplate', {
              count: summary.count,
              min: Math.round(summary.min),
              max: Math.round(summary.max),
            })
          : undefined
      }
      testID={testID}
    >
      <LineChartView
        data={points}
        formatX={(x) => formatChartAxisLabel(x, bucket)}
        formatY={(value) => `${Math.round(value)}m`}
        color={color.chart[2]}
      />
    </ChartCard>
  );
}
