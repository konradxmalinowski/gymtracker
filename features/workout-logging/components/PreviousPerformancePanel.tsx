import { View } from 'react-native';

import { Column } from '@/components/layout';
import { Text } from '@/components/ui';
import { Skeleton } from '@/components/feedback';
import { Weight } from '@/domain/Weight';
import { t } from '@/i18n';
import { space } from '@/theme/tokens';

import type { PreviousPerformance } from '../repository/ExerciseHistoryRepository';

export interface PreviousPerformancePanelProps {
  previousPerformance: PreviousPerformance | null;
  isPending: boolean;
  testID?: string | undefined;
}

/** `en-US` short date - no shared date formatter exists yet in this codebase (`formatElapsed.ts` is elapsed-duration only, a different kind of value). */
function formatShortDate(timestampMs: number): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(timestampMs),
  );
}

/**
 * ARCHITECTURE.md section 10.3's "previous session's sets" half of
 * `SessionExerciseCard`'s composition, backed for real as of P8 by
 * `usePreviousPerformance` (`SessionExerciseCard.tsx` calls the hook and
 * passes the result down - this component stays presentational, matching
 * `ExerciseHeader`/`SetRow`'s existing prop-driven shape). Renders a genuine
 * "no data yet" state when there is no prior session, the same treatment
 * `ExerciseDetailScreen`'s own performance sections use.
 */
export function PreviousPerformancePanel({
  previousPerformance,
  isPending,
  testID,
}: PreviousPerformancePanelProps) {
  if (isPending) {
    return (
      <View style={{ paddingVertical: space[1] }} testID={testID}>
        <Skeleton width="60%" height={14} />
      </View>
    );
  }

  if (!previousPerformance || previousPerformance.sets.length === 0) {
    return (
      <View style={{ paddingVertical: space[1] }} testID={testID}>
        <Text variant="footnote" color="tertiary">
          {t('workoutLogging.previousPerformance.emptyMessage')}
        </Text>
      </View>
    );
  }

  return (
    <View testID={testID}>
      <Column gap={1} style={{ paddingVertical: space[1] }}>
        <Text variant="footnote" color="secondary">
          {t('workoutLogging.previousPerformance.lastSessionLabelTemplate', {
            date: formatShortDate(previousPerformance.performedAt),
          })}
        </Text>
        {previousPerformance.sets.map((set, index) =>
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
  );
}
