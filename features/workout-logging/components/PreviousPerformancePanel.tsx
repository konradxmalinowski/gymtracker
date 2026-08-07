import { View } from 'react-native';

import { Text } from '@/components/ui';
import { t } from '@/i18n';
import { space } from '@/theme/tokens';

export interface PreviousPerformancePanelProps {
  testID?: string | undefined;
}

/**
 * ARCHITECTURE.md section 10.3 names this panel "previous session's sets,
 * best set, suggested progression" as part of `SessionExerciseCard`'s
 * composition. The progression-suggestion half is explicit P8 scope per this
 * phase's brief. The "previous session's sets" half needs a read path this
 * phase's backend pass did not build - `WorkoutSessionRepository` has no
 * "find this exercise's most recent prior session" query, and
 * `ExerciseHistoryRepository` belongs to a later phase per CLAUDE.md's module
 * dependency graph - so rather than inventing a new repository method outside
 * this phase's owned files, this panel renders a genuine "no data yet" state
 * (the same "genuinely empty, not a stub" treatment `ExerciseDetailScreen`'s
 * own performance sections already use pending P8). Flagged in the P6
 * handoff report as a scoping gap for whoever builds the read path next.
 */
export function PreviousPerformancePanel({ testID }: PreviousPerformancePanelProps) {
  return (
    <View style={{ paddingVertical: space[1] }} testID={testID}>
      <Text variant="footnote" color="tertiary">
        {t('workoutLogging.previousPerformance.emptyMessage')}
      </Text>
    </View>
  );
}
