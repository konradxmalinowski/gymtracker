import { Ionicons } from '@expo/vector-icons';

import { Column, Row } from '@/components/layout';
import { Card, Text } from '@/components/ui';
import { summarizeTodaysGoals, type DailyGoalWithTodayEntry } from '@/features/daily-goals';
import { t } from '@/i18n';
import { color } from '@/theme/tokens';

export interface TodaysGoalsCardProps {
  todaysGoals: readonly DailyGoalWithTodayEntry[];
  /** Whether the user has configured any goal at all (enabled or not) - distinguishes "never set up a goal" from "goals exist, none scheduled today," the same two-empty-states rule `DailyGoalsScreen` itself follows. */
  hasAnyGoals: boolean;
  onPress: () => void;
  testID?: string | undefined;
}

/**
 * Home's summary card for P17 - the one allowed `home -> daily-goals`
 * dependency edge (read-only, one direction; nothing depends back on `home`,
 * matching every other card's own relationship to its feature). Imports
 * ONLY from `@/features/daily-goals`'s barrel (`summarizeTodaysGoals`, the
 * `DailyGoalWithTodayEntry` type) - never a deep path - so ESLint's
 * `crossFeatureBarrelZones` stays satisfied now that `daily-goals` is in the
 * `FEATURES` list.
 *
 * Built directly from `Text`/`Column`/`Row`, mirroring `LastWorkoutCard`'s
 * exact shape - not `StatTile` (`StreakCard`/`LatestPRCard`'s own choice),
 * since `StatTile` always wraps itself in its own `accessible` node with a
 * computed label, which would double up against this card's own
 * interactive `accessibilityLabel` the way `ActivePlanCard`/`LastWorkoutCard`
 * (this file's own precedent for "the only two cards with a navigation
 * action") already avoid by composing plain text instead. Three distinct
 * states, mirroring every other Home card's "real, designed empty state,
 * not a shared generic one" rule: never configured a goal at all, goals
 * exist but none are active today, and the ordinary "N of M done" summary.
 */
export function TodaysGoalsCard({
  todaysGoals,
  hasAnyGoals,
  onPress,
  testID,
}: TodaysGoalsCardProps) {
  const { completed, total } = summarizeTodaysGoals(todaysGoals);

  const accessibilityLabel =
    total === 0
      ? `${t('dailyGoals.homeCard.title')}, ${hasAnyGoals ? t('dailyGoals.homeCard.noneActiveMessage') : t('dailyGoals.homeCard.emptyMessage')}`
      : `${t('dailyGoals.homeCard.title')}, ${t('dailyGoals.homeCard.progressTemplate', { completed, total })}`;

  return (
    <Card
      variant="elevated"
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Row gap={3} align="center">
        <Ionicons name="flag-outline" size={22} color={color.accentText} />
        <Column gap={1} style={{ flex: 1 }}>
          <Text variant="label" color="secondary">
            {t('dailyGoals.homeCard.title')}
          </Text>
          {total === 0 ? (
            <Text variant="body" color="primary">
              {hasAnyGoals
                ? t('dailyGoals.homeCard.noneActiveMessage')
                : t('dailyGoals.homeCard.emptyMessage')}
            </Text>
          ) : (
            <Text variant="title3" color="primary">
              {t('dailyGoals.homeCard.progressTemplate', { completed, total })}
            </Text>
          )}
        </Column>
      </Row>
    </Card>
  );
}
