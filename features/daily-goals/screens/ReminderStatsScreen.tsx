import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Stack } from 'expo-router';

import { Column, Row, Screen } from '@/components/layout';
import { StatTile, Text } from '@/components/ui';
import { ErrorState, Skeleton } from '@/components/feedback';
import { formatLocalDate, ONE_DAY_MS, parseLocalDate } from '@/features/daily-goals';
import { t } from '@/i18n';
import { useContainer } from '@/services/container';
import { space } from '@/theme/tokens';

import { useReminder, useReminderStats } from '../hooks/useDailyReminders';

/** Last-30-days window, resolved once per mount from the injected `Clock` - the same "simple screen, no chart library, hardcoded reasonable window" scope this feature's own brief calls for, one deliberate notch simpler than `statistics`'s own `resolveStatRange` (a fixed range picker was judged unnecessary for a single done/not-done/ignored tally). */
const STATS_WINDOW_DAYS = 30;

export interface ReminderStatsScreenProps {
  reminderId: string;
}

export function ReminderStatsScreen({ reminderId }: ReminderStatsScreenProps) {
  const { clock } = useContainer();
  const today = clock.localDate();
  const dateRangeFrom = formatLocalDate(
    parseLocalDate(today) - (STATS_WINDOW_DAYS - 1) * ONE_DAY_MS,
  );

  const reminder = useReminder(reminderId);
  const stats = useReminderStats(reminderId, dateRangeFrom, today);

  const isPending = reminder.isPending || stats.isPending;
  const isError = reminder.isError || stats.isError;

  useEffect(() => {
    if (isPending) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    }
  }, [isPending]);

  return (
    <Screen testID="reminder-stats-screen" scroll>
      <Stack.Screen options={{ title: reminder.data?.name ?? t('dailyGoals.stats.screenTitle') }} />
      <Column gap={4} style={{ paddingVertical: space[4] }}>
        {isPending ? (
          <Column gap={3}>
            <Skeleton width="60%" height={20} />
            <Row gap={3}>
              <Skeleton width="30%" height={80} radius="lg" />
              <Skeleton width="30%" height={80} radius="lg" />
              <Skeleton width="30%" height={80} radius="lg" />
            </Row>
          </Column>
        ) : isError || !stats.data ? (
          <ErrorState
            error={t('dailyGoals.stats.loadErrorMessage')}
            onRetry={() => {
              void reminder.refetch();
              void stats.refetch();
            }}
          />
        ) : (
          <Column gap={4}>
            <Text variant="footnote" color="secondary">
              {t('dailyGoals.stats.rangeLabelTemplate', { days: STATS_WINDOW_DAYS })}
            </Text>
            <Row gap={3}>
              <StatTile
                label={t('dailyGoals.stats.doneLabel')}
                value={stats.data.done}
                testID="reminder-stats-done"
              />
              <StatTile
                label={t('dailyGoals.stats.notDoneLabel')}
                value={stats.data.notDone}
                testID="reminder-stats-not-done"
              />
              <StatTile
                label={t('dailyGoals.stats.ignoredLabel')}
                value={stats.data.ignored}
                testID="reminder-stats-ignored"
              />
            </Row>
          </Column>
        )}
      </Column>
    </Screen>
  );
}
