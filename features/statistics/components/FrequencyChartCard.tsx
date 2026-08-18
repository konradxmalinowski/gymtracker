import { Ionicons } from '@expo/vector-icons';

import { BarChartView, ChartCard, summarizeSeries, type SeriesPoint } from '@/components/charts';
import { t } from '@/i18n';
import { color } from '@/theme/tokens';

import type { TimeBucket } from '../repository/StatisticsRepository';

export interface FrequencyChartCardProps {
  data: readonly TimeBucket[] | undefined;
  isPending: boolean;
  testID?: string | undefined;
}

/** `statistics` feature component - "workout frequency," roadmap P11. */
export function FrequencyChartCard({ data, isPending, testID }: FrequencyChartCardProps) {
  const points: SeriesPoint[] = (data ?? []).map((bucket) => ({
    x: bucket.bucketStart,
    value: bucket.value,
  }));
  const isEmpty = points.length === 0 || points.every((point) => (point.value ?? 0) === 0);
  const summary = summarizeSeries(points);

  return (
    <ChartCard
      title={t('statistics.frequency.title')}
      subtitle={t('statistics.frequency.subtitle')}
      isPending={isPending}
      isEmpty={isEmpty}
      emptyIcon={<Ionicons name="calendar-outline" size={32} color={color.textTertiary} />}
      emptyTitle={t('statistics.frequency.emptyTitle')}
      emptyMessage={t('statistics.frequency.emptyMessage')}
      contentAccessibilityLabel={
        summary
          ? t('statistics.frequency.accessibilityLabelTemplate', {
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
        color={color.chart[1]}
      />
    </ChartCard>
  );
}
