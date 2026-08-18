import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Column } from '@/components/layout';
import { Button, Section, Surface, Text } from '@/components/ui';
import { EmptyState, Skeleton } from '@/components/feedback';
import { Weight } from '@/domain/Weight';
import { ExerciseDetailScreen } from '@/features/exercise-library/screens/ExerciseDetailScreen';
import { formatRecordValue, recordTypeLabel, useCurrentRecords } from '@/features/records';
import { ExerciseProgressionCard, useExerciseProgression } from '@/features/statistics';
import { usePreviousPerformance } from '@/features/workout-logging';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useContainer } from '@/services/container';
import { color, space } from '@/theme/tokens';

/** `en-US` short date - matches `PreviousPerformancePanel.tsx`'s own local formatter; no shared date utility exists yet in this codebase. */
function formatShortDate(timestampMs: number): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(timestampMs),
  );
}

/**
 * Fills `ExerciseDetailScreen`'s two P8 slots (`previousPerformanceSlot`/
 * `personalRecordsSlot`) with real data from `records`/`workout-logging`'s
 * hooks - the composition `exercise-library` itself cannot do without
 * breaking its "dependency-free leaf" rule (ARCHITECTURE.md section 9.1).
 * `app/` files may compose feature barrels even though they can't reach into
 * a repository directly (CLAUDE.md's "app/ never contains screen bodies"
 * rule is about screen *bodies*, not slot composition like this).
 */
export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <ExerciseDetailScreen
      previousPerformanceSlot={<PreviousPerformanceSlot exerciseId={id} />}
      personalRecordsSlot={<PersonalRecordsSlot exerciseId={id} />}
      progressChartSlot={<ProgressChartSlot exerciseId={id} />}
    />
  );
}

function PreviousPerformanceSlot({ exerciseId }: { exerciseId: string | undefined }) {
  const { exerciseHistoryRepository } = useContainer();
  const { data, isPending } = usePreviousPerformance(exerciseHistoryRepository, exerciseId);

  return (
    <Section title={t('exerciseLibrary.detail.previousPerformanceTitle')}>
      <Surface level={1} radius="lg">
        {isPending ? (
          <Column gap={2} style={{ padding: space[4] }}>
            <Skeleton width="50%" height={14} />
            <Skeleton width="70%" height={14} />
          </Column>
        ) : !data || data.sets.length === 0 ? (
          <EmptyState
            illustration={<Ionicons name="time-outline" size={32} color={color.textTertiary} />}
            title={t('exerciseLibrary.detail.previousPerformanceEmptyTitle')}
            message={t('exerciseLibrary.detail.previousPerformanceEmptyMessage')}
            testID="exercise-detail-previous-performance"
          />
        ) : (
          <View testID="exercise-detail-previous-performance">
            <Column gap={2} style={{ padding: space[4] }}>
              <Text variant="footnote" color="secondary">
                {t('records.exerciseSlot.previousPerformanceLastLoggedTemplate', {
                  date: formatShortDate(data.performedAt),
                })}
              </Text>
              <Text variant="footnote" color="tertiary">
                {t('records.exerciseSlot.previousPerformanceSetsSummary', {
                  count: data.sets.length,
                })}
              </Text>
              {data.sets.map((set, index) =>
                set.weightKg !== null && set.reps !== null ? (
                  <Text key={set.id} variant="caption" color="tertiary">
                    {t('workoutLogging.previousPerformance.setLineTemplate', {
                      number: index + 1,
                      weight: Weight.fromKilograms(set.weightKg).toDisplayString('kg'),
                      reps: set.reps,
                    })}
                  </Text>
                ) : null,
              )}
            </Column>
          </View>
        )}
      </Surface>
    </Section>
  );
}

/**
 * P11: fills `ExerciseDetailScreen`'s third slot, empty since P4. A compact,
 * read-only `top_set`-over-3-months inline chart (no metric selector -
 * `onMetricChange` omitted) plus a link to the dedicated
 * `stats/exercise/[exerciseId]` screen for range/metric control, mirroring
 * how a summary card links out to its own full screen elsewhere in this app
 * (e.g. Home's `LastWorkoutCard` -> `history/[sessionId]`).
 */
function ProgressChartSlot({ exerciseId }: { exerciseId: string | undefined }) {
  const { statisticsRepository, clock } = useContainer();
  const { data, isPending } = useExerciseProgression(
    statisticsRepository,
    clock,
    exerciseId,
    '3m',
    'top_set',
  );

  return (
    <Column gap={3}>
      {/* `ExerciseProgressionCard` already renders its own titled `Section`
          via `ChartCard` (`statistics.exerciseProgression.screenTitle`) - no
          second outer `Section` here, unlike the previous-performance/
          personal-records slots above, which wrap plain untitled `Surface`s
          and need their own title. */}
      <ExerciseProgressionCard
        data={data}
        isPending={isPending}
        metric="top_set"
        testID="exercise-detail-progress-chart"
      />
      {exerciseId ? (
        <Button
          variant="secondary"
          label={t('statistics.exerciseProgression.viewFullButtonLabel')}
          onPress={() => router.push(routes.stats.exercise(exerciseId))}
          testID="exercise-detail-view-full-progression-button"
        />
      ) : null}
    </Column>
  );
}

function PersonalRecordsSlot({ exerciseId }: { exerciseId: string | undefined }) {
  const { recordService } = useContainer();
  const { data: records, isPending } = useCurrentRecords(recordService, exerciseId);

  return (
    <Section title={t('exerciseLibrary.detail.personalRecordsTitle')}>
      <Surface level={1} radius="lg">
        {isPending ? (
          <Column gap={2} style={{ padding: space[4] }}>
            <Skeleton width="60%" height={14} />
            <Skeleton width="40%" height={14} />
          </Column>
        ) : !records || records.length === 0 ? (
          <EmptyState
            illustration={<Ionicons name="trophy-outline" size={32} color={color.textTertiary} />}
            title={t('exerciseLibrary.detail.personalRecordsEmptyTitle')}
            message={t('exerciseLibrary.detail.personalRecordsEmptyMessage')}
            testID="exercise-detail-personal-records"
          />
        ) : (
          <View testID="exercise-detail-personal-records">
            <Column gap={3} style={{ padding: space[4] }}>
              {records.map((record) => (
                <Column key={record.id} gap={0}>
                  <Text variant="bodyMedium" color="primary">
                    {recordTypeLabel(record.recordType, record.repBucket)}
                  </Text>
                  <Text variant="footnote" color="secondary">
                    {formatRecordValue(record)}
                  </Text>
                </Column>
              ))}
            </Column>
          </View>
        )}
      </Surface>
    </Section>
  );
}
