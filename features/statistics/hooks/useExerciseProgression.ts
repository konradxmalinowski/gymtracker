import { useQuery } from '@tanstack/react-query';

import type { Clock } from '@/services/clock';
import type { EntityId } from '@/repositories/contracts/repository';

import { resolveStatRange, type StatRange } from '../domain/statRange';
import type {
  ProgressionMetric,
  SeriesPoint,
  StatisticsRepository,
} from '../repository/StatisticsRepository';
import { statisticsKeys } from './useStatisticsDashboard';

/**
 * Backs `ExerciseProgressionScreen` (the dedicated `stats/exercise/[exerciseId]`
 * route) and `ExerciseDetailScreen`'s `progressChartSlot`. `enabled: false`
 * for an as-yet-unresolved `exerciseId` mirrors `usePreviousPerformance`'s
 * own guard for exactly the same "route param not hydrated yet" case.
 */
export function useExerciseProgression(
  statisticsRepository: StatisticsRepository,
  clock: Clock,
  exerciseId: EntityId | undefined,
  range: StatRange,
  metric: ProgressionMetric,
) {
  return useQuery({
    queryKey: statisticsKeys.exerciseProgression(exerciseId ?? '', range, metric),
    enabled: exerciseId !== undefined,
    queryFn: async (): Promise<SeriesPoint[]> => {
      const today = clock.localDate();
      const { localDateFrom, localDateTo, bucket } = resolveStatRange(range, today);
      return statisticsRepository.exerciseProgression(
        exerciseId!,
        localDateFrom,
        localDateTo,
        bucket,
        metric,
      );
    },
  });
}
