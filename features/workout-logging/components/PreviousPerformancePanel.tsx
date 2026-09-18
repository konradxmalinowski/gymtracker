import { View } from 'react-native';

import { Text } from '@/components/ui';
import { Skeleton } from '@/components/feedback';
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
 *
 * Reference-layout pass: this panel used to also list every previous set's
 * weight/reps below the date line - that's now shown inline, per row, in
 * each `SetRow`'s own "Previous" column (`formatPreviousSetValue`), so
 * repeating the same values here a second time would just be visual noise.
 * What's left is the one thing no single row can show on its own: *when*
 * that previous session happened. The pending/empty states are unchanged.
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
    <View style={{ paddingVertical: space[1] }} testID={testID}>
      <Text variant="footnote" color="secondary">
        {t('workoutLogging.previousPerformance.lastSessionLabelTemplate', {
          date: formatShortDate(previousPerformance.performedAt),
        })}
      </Text>
    </View>
  );
}
