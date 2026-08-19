import { Ionicons } from '@expo/vector-icons';

import { ChartCard, HeatmapView, type HeatmapDay } from '@/components/charts';
import { t } from '@/i18n';
import { color } from '@/theme/tokens';

import type { DayIntensity } from '../domain/intensityBinning';

export interface CalendarYearHeatmapCardProps {
  data: readonly DayIntensity[] | undefined;
  year: number;
  isPending: boolean;
  testID?: string | undefined;
}

/**
 * The compact year view - reuses `components/charts/HeatmapView` verbatim
 * (built in P11 for the Statistics tab's own yearly heatmap; this feature
 * does not build a second heatmap renderer, per this phase's Step 0 decision
 * 4/the brief's own instruction). Mirrors `features/statistics/components/
 * YearlyHeatmapCard.tsx`'s wiring almost exactly - same `ChartCard` shell,
 * same `summarizeSeries`-style count-aware accessibility label built from
 * this feature's own translated `calendar.yearHeatmap.*` keys rather than
 * reusing `statistics.heatmap.*` (a cross-feature string import that isn't
 * how `t()`'s catalog works, and would read oddly here anyway - "training
 * activity" vs. this card's own "training" wording).
 */
export function CalendarYearHeatmapCard({
  data,
  year,
  isPending,
  testID,
}: CalendarYearHeatmapCardProps) {
  const days: HeatmapDay[] = (data ?? []).map((day) => ({
    localDate: day.localDate,
    level: day.level,
  }));
  const isEmpty = days.length === 0 || days.every((day) => day.level === 0);
  const trainedDayCount = days.filter((day) => day.level > 0).length;
  const accessibilityLabel = t('calendar.yearHeatmap.accessibilityLabel', {
    year: String(year),
    count: trainedDayCount,
  });

  return (
    <ChartCard
      title={t('calendar.yearHeatmap.titleTemplate', { year: String(year) })}
      isPending={isPending}
      isEmpty={isEmpty}
      emptyIcon={<Ionicons name="grid-outline" size={32} color={color.textTertiary} />}
      emptyTitle={t('calendar.yearHeatmap.emptyTitle')}
      emptyMessage={t('calendar.yearHeatmap.emptyMessage')}
      contentAccessibilityLabel={isEmpty ? undefined : accessibilityLabel}
      testID={testID}
    >
      <HeatmapView days={days} accessibilityLabel={accessibilityLabel} />
    </ChartCard>
  );
}
