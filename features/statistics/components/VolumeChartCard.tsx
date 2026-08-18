import { Ionicons } from '@expo/vector-icons';

import { BarChartView, ChartCard, summarizeSeries, type SeriesPoint } from '@/components/charts';
import { t } from '@/i18n';
import { color } from '@/theme/tokens';

import type { TimeBucket } from '../repository/StatisticsRepository';

export interface VolumeChartCardProps {
  data: readonly TimeBucket[] | undefined;
  isPending: boolean;
  testID?: string | undefined;
}

/** `statistics` feature component (ARCHITECTURE.md section 10) - the "volume over time" chart, roadmap P11. */
export function VolumeChartCard({ data, isPending, testID }: VolumeChartCardProps) {
  const points: SeriesPoint[] = (data ?? []).map((bucket) => ({
    x: bucket.bucketStart,
    value: bucket.value,
  }));
  const isEmpty = points.length === 0 || points.every((point) => (point.value ?? 0) === 0);
  const summary = summarizeSeries(points);

  return (
    <ChartCard
      title={t('statistics.volume.title')}
      subtitle={t('statistics.volume.subtitle')}
      isPending={isPending}
      isEmpty={isEmpty}
      emptyIcon={<Ionicons name="barbell-outline" size={32} color={color.textTertiary} />}
      emptyTitle={t('statistics.volume.emptyTitle')}
      emptyMessage={t('statistics.volume.emptyMessage')}
      contentAccessibilityLabel={
        summary
          ? t('statistics.volume.accessibilityLabelTemplate', {
              count: summary.count,
              min: Math.round(summary.min),
              max: Math.round(summary.max),
            })
          : undefined
      }
      testID={testID}
    >
      <BarChartView
        data={points}
        formatY={(value) => `${Math.round(value)}`}
        color={color.chart[0]}
      />
    </ChartCard>
  );
}
