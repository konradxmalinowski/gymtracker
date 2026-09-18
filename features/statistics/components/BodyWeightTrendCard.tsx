import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';

import { ChartCard, LineChartView, summarizeSeries, type SeriesPoint } from '@/components/charts';
import { Column } from '@/components/layout';
import { Button } from '@/components/ui';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { color } from '@/theme/tokens';

import { RANGE_BUCKET, type StatRange } from '../domain/statRange';
import type { BodyWeightPoint } from '../repository/StatisticsRepository';
import { formatChartAxisLabel } from './formatChartAxisLabel';

export interface BodyWeightTrendCardProps {
  data: readonly BodyWeightPoint[] | undefined;
  isPending: boolean;
  /** Drives the x-axis tick format (day/week/month) - defaults to `'3m'` for callers (tests, mostly) that don't track a range selector. */
  range?: StatRange | undefined;
  testID?: string | undefined;
}

/**
 * `statistics` feature component - the single most commonly tracked
 * body-metric (body weight) surfaced directly on the Statistics dashboard,
 * backed by `StatisticsRepository.bodyWeightTrend`'s direct SQL read of
 * `body_metric_entry` (ADR-0019/ADR-0020 precedent - no `body-metrics`
 * import). Always shown in kg without a unit-setting conversion, matching
 * every other chart on this screen (`VolumeChartCard`/`RepMaxTableCard`'s
 * own hardcoded "kg") rather than a `units.weight`-aware read this card
 * would be the only one in `statistics` to have.
 *
 * The other 14 body-metrics (body fat %, circumferences, sleep, height)
 * aren't worth a second dashboard card each - the "see all measurements"
 * button below routes to `body-metrics`' own measurements list instead.
 */
export function BodyWeightTrendCard({
  data,
  isPending,
  range = '3m',
  testID,
}: BodyWeightTrendCardProps) {
  const router = useRouter();
  const bucket = RANGE_BUCKET[range];
  const unitSuffix = t('statistics.bodyWeight.unitSuffix');
  const points: SeriesPoint[] = (data ?? []).map((point) => ({
    x: point.localDate,
    value: point.valueKg,
  }));
  const isEmpty = points.length === 0;
  const summary = summarizeSeries(points);

  return (
    <Column gap={2}>
      <ChartCard
        title={t('statistics.bodyWeight.title')}
        subtitle={t('statistics.bodyWeight.subtitle')}
        isPending={isPending}
        isEmpty={isEmpty}
        emptyIcon={<Ionicons name="body-outline" size={32} color={color.textTertiary} />}
        emptyTitle={t('statistics.bodyWeight.emptyTitle')}
        emptyMessage={t('statistics.bodyWeight.emptyMessage')}
        unitLabel={unitSuffix}
        contentAccessibilityLabel={
          summary
            ? t('statistics.bodyWeight.accessibilityLabelTemplate', {
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
          formatY={(value) => `${Math.round(value)} ${unitSuffix}`}
          color={color.chart[3]}
        />
      </ChartCard>
      <Button
        variant="ghost"
        size="sm"
        label={t('statistics.bodyWeight.seeAllButtonLabel')}
        onPress={() => router.push(routes.bodyMetrics.list())}
        testID={testID ? `${testID}-see-all-button` : undefined}
      />
    </Column>
  );
}
