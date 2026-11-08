import Ionicons from '@expo/vector-icons/Ionicons';

import { ChartCard, ChartLegend, HeatmapView, type HeatmapDay } from '@/components/charts';
import { Column } from '@/components/layout';
import { t } from '@/i18n';
import { color } from '@/theme/tokens';

import type { DaySleep } from '../domain/sleepBinning';

export interface SleepHeatmapCardProps {
  data: readonly DaySleep[] | undefined;
  year: number;
  isPending: boolean;
  testID?: string | undefined;
}

/**
 * A fixed red/yellow/green scale rather than `HeatmapView`'s default
 * training-intensity green ramp (level 4 is unreachable here -
 * `computeSleepHeatmap` never emits it - and is included only to satisfy
 * `HeatmapViewProps.colors`'s `0-4` record shape).
 */
const SLEEP_LEVEL_COLORS: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: color.chartGrid,
  1: color.danger,
  2: color.warning,
  3: color.success,
  4: color.success,
};

/**
 * `statistics` feature component - the GitHub-contribution-graph-style
 * "sleep table" the user asked for, reusing `HeatmapView` verbatim (same
 * "no second heatmap renderer" precedent `YearlyHeatmapCard`/
 * `CalendarYearHeatmapCard` already establish) with a fixed 3-tier
 * red/yellow/green palette instead of the shared green intensity ramp -
 * `computeSleepHeatmap`'s thresholds are absolute (green >= 8h, yellow
 * [6, 8), red < 6h), not relative to the user's own year like the training
 * heatmap's quantile binning.
 */
export function SleepHeatmapCard({ data, year, isPending, testID }: SleepHeatmapCardProps) {
  const days: HeatmapDay[] = (data ?? []).map((day) => ({
    localDate: day.localDate,
    level: day.level,
  }));
  const isEmpty = days.length === 0 || days.every((day) => day.level === 0);
  const loggedNightCount = days.filter((day) => day.level > 0).length;
  const accessibilityLabel = t('statistics.sleep.accessibilityLabel', {
    year: String(year),
    count: loggedNightCount,
  });

  return (
    <Column gap={2}>
      <ChartCard
        title={t('statistics.sleep.titleTemplate', { year: String(year) })}
        isPending={isPending}
        isEmpty={isEmpty}
        emptyIcon={<Ionicons name="moon-outline" size={32} color={color.textTertiary} />}
        emptyTitle={t('statistics.sleep.emptyTitle')}
        emptyMessage={t('statistics.sleep.emptyMessage')}
        contentAccessibilityLabel={isEmpty ? undefined : accessibilityLabel}
        testID={testID}
      >
        <HeatmapView
          days={days}
          colors={SLEEP_LEVEL_COLORS}
          accessibilityLabel={accessibilityLabel}
        />
      </ChartCard>
      {isEmpty ? null : (
        <ChartLegend
          series={[
            { label: t('statistics.sleep.legend.poorLabel'), color: color.danger },
            { label: t('statistics.sleep.legend.okLabel'), color: color.warning },
            { label: t('statistics.sleep.legend.greatLabel'), color: color.success },
          ]}
          testID={testID ? `${testID}-legend` : undefined}
        />
      )}
    </Column>
  );
}
