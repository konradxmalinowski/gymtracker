import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

import { Badge } from '@/components/ui';
import { t } from '@/i18n';
import { color, space } from '@/theme/tokens';

export interface SupersetBracketProps extends PropsWithChildren {
  group: number;
  testID?: string | undefined;
}

/**
 * Visual bracket for a run of grouped `SessionExerciseCard`s - the same left
 * accent-bar-plus-badge treatment `features/plans/components/
 * SupersetGroupEditor.tsx` established for the plan day editor, deliberately
 * kept just as simple here (no accessibility-action merging: unlike
 * `PlanDayExerciseRow`, `SessionExerciseCard` is not itself a single
 * `Pressable` whose accessibility node this wrapper needs to preserve - it's
 * a `Card` containing several independent interactive children, each already
 * independently reachable). Grouping itself (`superset_group`, carried from
 * the plan day per this phase's roadmap entry) is read-only in P6 - no
 * in-workout "create/edit a superset" UI ships this phase, mirroring how
 * P6's brief scopes reordering to move-up/move-down rather than a full
 * multi-select regroup flow.
 */
export function SupersetBracket({ group, children, testID }: SupersetBracketProps) {
  return (
    <View
      style={{ borderLeftWidth: 3, borderLeftColor: color.accent, marginLeft: space[2] }}
      testID={testID}
    >
      <View style={{ paddingLeft: space[3], paddingTop: space[2], paddingBottom: space[1] }}>
        <Badge
          label={t('workoutLogging.active.supersetLabelTemplate', { group })}
          tone="accent"
          size="sm"
        />
      </View>
      {children}
    </View>
  );
}
