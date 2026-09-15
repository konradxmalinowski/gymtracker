import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { Column, Row } from '@/components/layout';
import { Badge, Card, Checkbox, IconButton, Text } from '@/components/ui';
import { PressScale } from '@/components/gestures/PressScale';
import { t } from '@/i18n';
import { color, hitSlop, motion, radius, space } from '@/theme/tokens';

import { resolveGoalIconName } from './goalIcons';
import { isGoalComplete } from '../domain/goalCompletion';
import type { DailyGoalWithTodayEntry } from '../types/DailyGoal';

export interface TodayGoalRowProps {
  goalWithEntry: DailyGoalWithTodayEntry;
  /** Toggles between complete (`progressValue = 1`) and incomplete (`progressValue = 0`) - see `DailyGoalsScreen`'s own doc comment for why toggling back off is supported. */
  onToggleBoolean: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  onAddNumeric: () => void;
  isMutating?: boolean | undefined;
  testID?: string | undefined;
}

/**
 * `DailyGoalsScreen`'s row - one per active goal, each rendering exactly one
 * of three quick-action shapes based on `goal.goalType`, requiring no
 * navigation to update (this phase's own acceptance criterion). Built on
 * `Card` rather than `PressScale`/`ListRow` - there is no single "tap the
 * row" action here (every control on the row is its own independent target,
 * unlike `GoalCard`'s row-level "tap to edit").
 */
export function TodayGoalRow({
  goalWithEntry,
  onToggleBoolean,
  onIncrement,
  onDecrement,
  onAddNumeric,
  isMutating = false,
  testID,
}: TodayGoalRowProps) {
  const { goal, entry } = goalWithEntry;
  const progressValue = entry?.progressValue ?? 0;
  const complete = isGoalComplete(goal.goalType, goal.targetValue, progressValue);

  return (
    <Card variant="elevated" testID={testID}>
      <Row gap={3} align="center">
        <Ionicons name={resolveGoalIconName(goal.icon)} size={24} color={color.accentText} />
        <Column gap={1} style={{ flex: 1 }}>
          <Row gap={2} align="center">
            <Text variant="bodyMedium" color="primary" numberOfLines={1} style={{ flex: 1 }}>
              {goal.name}
            </Text>
            {complete ? (
              <Animated.View
                entering={ZoomIn.springify()
                  .damping(motion.spring.snappy.damping)
                  .stiffness(motion.spring.snappy.stiffness)
                  .mass(motion.spring.snappy.mass)}
              >
                <Badge label={t('dailyGoals.today.completedBadgeLabel')} tone="success" size="sm" />
              </Animated.View>
            ) : null}
          </Row>
          {goal.goalType !== 'boolean' ? (
            <Text variant="footnote" color="secondary">
              {t('dailyGoals.today.progressTemplate', {
                progress: progressValue,
                target: goal.targetValue ?? 0,
                unit: goal.unit ?? '',
              })}
            </Text>
          ) : null}
        </Column>

        {goal.goalType === 'boolean' ? (
          <Checkbox
            value={complete}
            onValueChange={onToggleBoolean}
            disabled={isMutating}
            accessibilityLabel={t(
              complete
                ? 'dailyGoals.today.booleanCompleteAccessibilityLabelTemplate'
                : 'dailyGoals.today.booleanIncompleteAccessibilityLabelTemplate',
              { name: goal.name },
            )}
            testID={testID ? `${testID}-checkbox` : undefined}
          />
        ) : null}

        {goal.goalType === 'counter' ? (
          <Row gap={1} align="center">
            <IconButton
              icon={<Ionicons name="remove" size={18} color={color.textPrimary} />}
              variant="default"
              size="sm"
              disabled={isMutating || progressValue <= 0}
              accessibilityLabel={t('dailyGoals.today.counterDecrementAccessibilityLabelTemplate', {
                name: goal.name,
              })}
              onPress={onDecrement}
              testID={testID ? `${testID}-decrement` : undefined}
            />
            <IconButton
              icon={<Ionicons name="add" size={18} color={color.textPrimary} />}
              variant="default"
              size="sm"
              disabled={isMutating}
              accessibilityLabel={t('dailyGoals.today.counterIncrementAccessibilityLabelTemplate', {
                name: goal.name,
              })}
              onPress={onIncrement}
              testID={testID ? `${testID}-increment` : undefined}
            />
          </Row>
        ) : null}

        {goal.goalType === 'numeric' ? (
          // Not `Button` - `Button`'s own accessibility label is always its
          // visible `label` text ("Add"), with no separate override, which
          // would leave every numeric goal's quick action announced
          // identically with no goal-name context once VoiceOver/TalkBack
          // moves focus off the row's own name text above it. Built directly
          // on `PressScale` (the same primitive `Button` composes) so this
          // one control can carry a real, goal-specific accessibility label
          // while keeping `Button`'s own "secondary, sm" visual shape.
          <PressScale
            onPress={onAddNumeric}
            disabled={isMutating}
            accessibilityRole="button"
            accessibilityLabel={t('dailyGoals.today.numericAddAccessibilityLabelTemplate', {
              name: goal.name,
            })}
            accessibilityState={{ disabled: isMutating }}
            hitSlop={hitSlop.default}
            style={{
              height: 36,
              paddingHorizontal: space[3],
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: color.border,
              backgroundColor: color.surfaceElevated,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: isMutating ? 0.6 : 1,
            }}
            testID={testID ? `${testID}-add` : undefined}
          >
            <Text variant="callout" color="primary">
              {t('dailyGoals.today.numericAddButtonLabel')}
            </Text>
          </PressScale>
        ) : null}
      </Row>
    </Card>
  );
}
