import { Ionicons } from '@expo/vector-icons';

import { ChartCard, LineChartView, summarizeSeries, type SeriesPoint } from '@/components/charts';
import { t } from '@/i18n';
import { color } from '@/theme/tokens';

import type { TimeBucket } from '../repository/StatisticsRepository';

export interface DurationTrendCardProps {
  data: readonly TimeBucket[] | undefined;
  isPending: boolean;
  testID?: string | undefined;
}

/**
 * `statistics` feature component (beyond section 10's literal list - this
 * phase's plan). Average completed-session duration per bucket, roadmap
 * P11's "duration trend."
 */
export function DurationTrendCard({ data, isPending, testID }: DurationTrendCardProps) {
  const points: SeriesPoint[] = (data ?? []).map((bucket) => ({
    x: bucket.bucketStart,
    value: bucket.value > 0 ? bucket.value / 60 : null,
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
        formatY={(value) => `${Math.round(value)}m`}
        color={color.chart[2]}
      />
    </ChartCard>
  );
}
