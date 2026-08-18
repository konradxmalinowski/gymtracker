import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { Column, Screen } from '@/components/layout';
import { ErrorState, Skeleton } from '@/components/feedback';
import { formatExerciseName } from '@/features/exercise-library';
import { t } from '@/i18n';
import { useContainer } from '@/services/container';
import { space } from '@/theme/tokens';

import { ExerciseProgressionCard } from '../components/ExerciseProgressionCard';
import { StatRangeSelector } from '../components/StatRangeSelector';
import type { StatRange } from '../domain/statRange';
import type { ProgressionMetric } from '../domain/exerciseProgressionReducer';
import { useExerciseProgression } from '../hooks/useExerciseProgression';

/** `app/(tabs)/stats/exercise/[exerciseId].tsx`'s screen body - the dedicated per-exercise progression view (`stats/exercise/[exerciseId]`, ARCHITECTURE.md section 10.1's route graph). */
export function ExerciseProgressionScreen() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  const { statisticsRepository, exerciseService, clock } = useContainer();
  const [range, setRange] = useState<StatRange>('1y');
  const [metric, setMetric] = useState<ProgressionMetric>('top_set');

  const { data: exercise, isPending: isExercisePending } = useQuery({
    queryKey: ['exercise', exerciseId],
    queryFn: () => exerciseService.getById(exerciseId!),
    enabled: exerciseId !== undefined,
  });
  const { data, isPending, isFetching, isError, refetch } = useExerciseProgression(
    statisticsRepository,
    clock,
    exerciseId,
    range,
    metric,
  );

  const exerciseName = exercise
    ? formatExerciseName({
        nameEn: exercise.nameEn,
        namePl: exercise.namePl,
        displayNameOverride: exercise.userData.displayNameOverride,
      })
    : undefined;

  useEffect(() => {
    if (isPending) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    }
  }, [isPending]);

  return (
    <Screen testID="exercise-progression-screen" scroll>
      <Stack.Screen
        options={{ title: exerciseName ?? t('statistics.exerciseProgression.screenTitle') }}
      />
      <Column gap={4} style={{ paddingVertical: space[4] }}>
        {isExercisePending || isPending ? (
          <Column gap={3}>
            <Skeleton width="60%" height={28} />
            <Skeleton width="100%" height={40} radius="xl" />
            <Skeleton width="100%" height={260} radius="xl" />
          </Column>
        ) : isError ? (
          <ErrorState
            error={t('statistics.exerciseProgression.loadErrorMessage')}
            onRetry={() => refetch()}
          />
        ) : (
          <>
            <StatRangeSelector
              value={range}
              onChange={setRange}
              testID="exercise-progression-range-selector"
            />
            <ExerciseProgressionCard
              data={data}
              isPending={isFetching}
              metric={metric}
              onMetricChange={setMetric}
              testID="exercise-progression-card"
            />
          </>
        )}
      </Column>
    </Screen>
  );
}
