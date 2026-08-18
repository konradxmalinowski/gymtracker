import { Ionicons } from '@expo/vector-icons';

import { ChartCard, HeatmapView, type HeatmapDay } from '@/components/charts';
import { t } from '@/i18n';
import { color } from '@/theme/tokens';

import type { DayIntensity } from '../repository/StatisticsRepository';

export interface YearlyHeatmapCardProps {
  data: readonly DayIntensity[] | undefined;
  year: number;
  isPending: boolean;
  testID?: string | undefined;
}

/**
 * `statistics` feature component (beyond section 10's literal list - this
 * phase's plan). Roadmap P11's "yearly activity heatmap," quantile-binned
 * per Step 0 decision 3.
 */
export function YearlyHeatmapCard({ data, year, isPending, testID }: YearlyHeatmapCardProps) {
  const days: HeatmapDay[] = (data ?? []).map((day) => ({
    localDate: day.localDate,
    level: day.level,
  }));
  const isEmpty = days.length === 0 || days.every((day) => day.level === 0);
  const activeDayCount = days.filter((day) => day.level > 0).length;
  const accessibilityLabel = t('statistics.heatmap.accessibilityLabel', {
    year: String(year),
    count: activeDayCount,
  });

  return (
    <ChartCard
      title={t('statistics.heatmap.titleTemplate', { year: String(year) })}
      isPending={isPending}
      isEmpty={isEmpty}
      emptyIcon={<Ionicons name="grid-outline" size={32} color={color.textTertiary} />}
      emptyTitle={t('statistics.heatmap.emptyTitle')}
      emptyMessage={t('statistics.heatmap.emptyMessage')}
      contentAccessibilityLabel={isEmpty ? undefined : accessibilityLabel}
      testID={testID}
    >
      <HeatmapView days={days} accessibilityLabel={accessibilityLabel} />
    </ChartCard>
  );
}
