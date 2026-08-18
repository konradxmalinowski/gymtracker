import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { ChartCard, LineChartView, summarizeSeries } from '@/components/charts';
import { SegmentedControl } from '@/components/ui';
import { t } from '@/i18n';
import { color, space } from '@/theme/tokens';

import type { ProgressionMetric, SeriesPoint } from '../domain/exerciseProgressionReducer';

export interface ExerciseProgressionCardProps {
  data: readonly SeriesPoint[] | undefined;
  isPending: boolean;
  metric: ProgressionMetric;
  onMetricChange?: ((metric: ProgressionMetric) => void) | undefined;
  testID?: string | undefined;
}

const METRIC_COLOR: Record<ProgressionMetric, string> = {
  top_set: color.chart[0]!,
  e1rm: color.chart[3]!,
  volume: color.chart[1]!,
};

const METRIC_LABEL_KEY: Record<
  ProgressionMetric,
  | 'statistics.exerciseProgression.metric.topSet'
  | 'statistics.exerciseProgression.metric.e1rm'
  | 'statistics.exerciseProgression.metric.volume'
> = {
  top_set: 'statistics.exerciseProgression.metric.topSet',
  e1rm: 'statistics.exerciseProgression.metric.e1rm',
  volume: 'statistics.exerciseProgression.metric.volume',
};

/**
 * `statistics` feature component (section 10) - backs both the dedicated
 * `stats/exercise/[exerciseId]` screen and `ExerciseDetailScreen`'s
 * `progressChartSlot`. `onMetricChange` omitted renders the segmented
 * control read-only (the slot's compact inline use only shows `top_set`,
 * with no room for a second control competing with the exercise detail
 * screen's own affordances).
 */
export function ExerciseProgressionCard({
  data,
  isPending,
  metric,
  onMetricChange,
  testID,
}: ExerciseProgressionCardProps) {
  const points = (data ?? []).map((point) => ({ x: point.bucketStart, value: point.value }));
  const isEmpty = points.every((point) => point.value === null);
  const summary = summarizeSeries(points);
  const metricOptions: { value: ProgressionMetric; label: string }[] = [
    { value: 'top_set', label: t('statistics.exerciseProgression.metric.topSet') },
    { value: 'e1rm', label: t('statistics.exerciseProgression.metric.e1rm') },
    { value: 'volume', label: t('statistics.exerciseProgression.metric.volume') },
  ];

  return (
    <View style={{ gap: space[3] }}>
      {onMetricChange ? (
        <SegmentedControl options={metricOptions} value={metric} onChange={onMetricChange} />
      ) : null}
      <ChartCard
        title={t('statistics.exerciseProgression.screenTitle')}
        isPending={isPending}
        isEmpty={isEmpty}
        emptyIcon={<Ionicons name="trending-up-outline" size={32} color={color.textTertiary} />}
        emptyTitle={t('statistics.exerciseProgression.emptyTitle')}
        emptyMessage={t('statistics.exerciseProgression.emptyMessage')}
        contentAccessibilityLabel={
          summary
            ? t('statistics.exerciseProgression.accessibilityLabelTemplate', {
                metric: t(METRIC_LABEL_KEY[metric]),
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
          color={METRIC_COLOR[metric]}
          formatY={(value) => `${Math.round(value)}`}
        />
      </ChartCard>
    </View>
  );
}
