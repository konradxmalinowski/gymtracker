import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { Column } from '@/components/layout';
import { Section, Surface, Text } from '@/components/ui';
import { EmptyState, Skeleton } from '@/components/feedback';
import { Weight } from '@/domain/Weight';
import { ExerciseDetailScreen } from '@/features/exercise-library/screens/ExerciseDetailScreen';
import { formatRecordValue, recordTypeLabel, useCurrentRecords } from '@/features/records';
import { usePreviousPerformance } from '@/features/workout-logging';
import { t } from '@/i18n';
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
