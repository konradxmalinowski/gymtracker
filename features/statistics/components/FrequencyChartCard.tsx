import Ionicons from '@expo/vector-icons/Ionicons';

import { BarChartView, ChartCard, summarizeSeries, type SeriesPoint } from '@/components/charts';
import { t } from '@/i18n';
import { color } from '@/theme/tokens';

import { RANGE_BUCKET, type StatRange } from '../domain/statRange';
import type { TimeBucket } from '../repository/StatisticsRepository';
import { formatChartAxisLabel } from './formatChartAxisLabel';

export interface FrequencyChartCardProps {
  data: readonly TimeBucket[] | undefined;
  isPending: boolean;
  /** Drives the x-axis tick format (day/week/month) - defaults to `'3m'` for callers (tests, mostly) that don't track a range selector. */
  range?: StatRange | undefined;
  testID?: string | undefined;
}

/** `statistics` feature component - "workout frequency," roadmap P11. */
export function FrequencyChartCard({
  data,
  isPending,
  range = '3m',
  testID,
}: FrequencyChartCardProps) {
  const bucket = RANGE_BUCKET[range];
  const unitSuffix = t('statistics.frequency.unitSuffix');
  const points: SeriesPoint[] = (data ?? []).map((bucketPoint) => ({
    x: bucketPoint.bucketStart,
    value: bucketPoint.value,
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
        formatX={(x) => formatChartAxisLabel(x, bucket)}
        formatY={(value) => `${Math.round(value)} ${unitSuffix}`}
        color={color.chart[1]}
      />
    </ChartCard>
  );
}
