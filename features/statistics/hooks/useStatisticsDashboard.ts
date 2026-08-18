import { useQuery } from '@tanstack/react-query';

import type { Clock } from '@/services/clock';

import { resolveStatRange, type StatRange } from '../domain/statRange';
import type {
  DayIntensity,
  MuscleVolumeSlice,
  StatisticsRepository,
  TimeBucket,
} from '../repository/StatisticsRepository';

/** ARCHITECTURE.md section 12.1's `['stats', metric, rangeKey]` query-key shape. */
export const statisticsKeys = {
  dashboard: (range: StatRange) => ['stats', 'dashboard', range] as const,
  exerciseProgression: (exerciseId: string, range: StatRange, metric: string) =>
    ['stats', 'exerciseProgression', exerciseId, range, metric] as const,
};

export interface StatisticsDashboardData {
  volume: TimeBucket[];
  frequency: TimeBucket[];
  duration: TimeBucket[];
  muscleVolume: MuscleVolumeSlice[];
  heatmap: DayIntensity[];
  heatmapYear: number;
}

/**
 * One `useQuery` per selected `range`, composing every card on the
 * Statistics tab's dashboard - the screen sees a single `isPending`/
 * `isError`/`refetch`, the same acceptance criterion P10's `useHomeDashboard`
 * already established for Home ("the whole dashboard loads in a single query
 * round trip"). The yearly heatmap always shows the current calendar year
 * regardless of `range` - it's its own independent time axis, not
 * range-scoped like the other four cards.
 */
export function useStatisticsDashboard(
  statisticsRepository: StatisticsRepository,
  clock: Clock,
  range: StatRange,
) {
  return useQuery({
    queryKey: statisticsKeys.dashboard(range),
    queryFn: async (): Promise<StatisticsDashboardData> => {
      const today = clock.localDate();
      const { localDateFrom, localDateTo, bucket } = resolveStatRange(range, today);
      const heatmapYear = Number(today.slice(0, 4));

      const [volume, frequency, duration, muscleVolume, heatmap] = await Promise.all([
        statisticsRepository.volumeByPeriod(localDateFrom, localDateTo, bucket),
        statisticsRepository.sessionFrequency(localDateFrom, localDateTo, bucket),
        statisticsRepository.durationTrend(localDateFrom, localDateTo, bucket),
        statisticsRepository.muscleGroupVolume(localDateFrom, localDateTo),
        statisticsRepository.yearlyHeatmap(heatmapYear),
      ]);

      return { volume, frequency, duration, muscleVolume, heatmap, heatmapYear };
    },
  });
}
