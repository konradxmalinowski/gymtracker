import { useEffect, useState } from 'react';
import { AccessibilityInfo, RefreshControl } from 'react-native';

import { Column, Screen } from '@/components/layout';
import { Text } from '@/components/ui';
import { ErrorState, Skeleton } from '@/components/feedback';
import { t } from '@/i18n';
import { useContainer } from '@/services/container';
import { color, space } from '@/theme/tokens';

import { DurationTrendCard } from '../components/DurationTrendCard';
import { FrequencyChartCard } from '../components/FrequencyChartCard';
import { MuscleVolumeCard } from '../components/MuscleVolumeCard';
import { StatRangeSelector } from '../components/StatRangeSelector';
import { VolumeChartCard } from '../components/VolumeChartCard';
import { YearlyHeatmapCard } from '../components/YearlyHeatmapCard';
import type { StatRange } from '../domain/statRange';
import { useStatisticsDashboard } from '../hooks/useStatisticsDashboard';

/**
 * `app/(tabs)/stats/index.tsx`'s screen body - P11's real Statistics
 * dashboard, replacing the P6-era "not built yet" empty state wholesale
 * (mirrors P10's `HomeScreen` replacing its own P6 placeholder).
 *
 * One `StatRangeSelector` drives every time-bucketed card; the yearly
 * heatmap is its own independent time axis (always the current calendar
 * year) and ignores `range` entirely (`YearlyHeatmapCard`'s own doc
 * comment). `isFetching` (not just `isPending`) feeds each card's own
 * `isPending` prop so switching ranges shows a per-card skeleton without
 * blanking the whole screen - `isPending` alone only covers the very first
 * load.
 */
export function StatisticsScreen() {
  const { statisticsRepository, clock } = useContainer();
  const [range, setRange] = useState<StatRange>('3m');
  const { data, isPending, isError, isFetching, isRefetching, refetch } = useStatisticsDashboard(
    statisticsRepository,
    clock,
    range,
  );

  useEffect(() => {
    if (isPending) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    }
  }, [isPending]);

  if (isPending) {
    return (
      <Screen testID="statistics-screen" scroll>
        <StatisticsSkeleton />
      </Screen>
    );
  }

  if (isError || !data) {
    return (
      <Screen testID="statistics-screen">
        <ErrorState error={t('statistics.loadErrorMessage')} onRetry={() => refetch()} />
      </Screen>
    );
  }

  return (
    <Screen
      testID="statistics-screen"
      scroll
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          tintColor={color.textSecondary}
        />
      }
    >
      <Column gap={4} style={{ paddingVertical: space[4] }}>
        <Column gap={1}>
          <Text variant="display" color="primary">
            {t('statistics.screenTitle')}
          </Text>
        </Column>

        <StatRangeSelector value={range} onChange={setRange} testID="statistics-range-selector" />

        <VolumeChartCard
          data={data.volume}
          isPending={isFetching}
          testID="statistics-volume-card"
        />
        <FrequencyChartCard
          data={data.frequency}
          isPending={isFetching}
          testID="statistics-frequency-card"
        />
        <DurationTrendCard
          data={data.duration}
          isPending={isFetching}
          testID="statistics-duration-card"
        />
        <MuscleVolumeCard
          data={data.muscleVolume}
          isPending={isFetching}
          testID="statistics-muscle-volume-card"
        />
        <YearlyHeatmapCard
          data={data.heatmap}
          year={data.heatmapYear}
          isPending={isFetching}
          testID="statistics-heatmap-card"
        />
      </Column>
    </Screen>
  );
}

function StatisticsSkeleton() {
  return (
    <Column gap={4} style={{ paddingVertical: space[4] }}>
      <Skeleton width="50%" height={40} />
      <Skeleton width="100%" height={40} radius="xl" />
      {[0, 1, 2, 3, 4].map((index) => (
        <Skeleton key={index} width="100%" height={220} radius="xl" />
      ))}
    </Column>
  );
}
