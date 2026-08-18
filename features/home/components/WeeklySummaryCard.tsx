import { Ionicons } from '@expo/vector-icons';

import { Column, Row } from '@/components/layout';
import { Card, Text } from '@/components/ui';
import { EmptyState } from '@/components/feedback';
import { Weight } from '@/domain/Weight';
import { t } from '@/i18n';
import { color } from '@/theme/tokens';

import type { HomeWeeklySummary } from '../repository/HomeDashboardRepository';
import { formatHomeDurationSeconds } from './formatHomeDuration';

export interface WeeklySummaryCardProps {
  weeklySummary: HomeWeeklySummary;
  testID?: string | undefined;
}

/**
 * Home's "this week" card - `HomeDashboardData.weeklySummary`, a single-table
 * SQL aggregate over the current Monday-start week
 * (`useHomeDashboard`'s own `currentWeekStart` helper feeds
 * `getWeeklySummary`'s `[localDateFrom, localDateTo]` range). `workouts ===
 * 0` is the real empty state (no workouts this week yet), not a row of
 * zeroed stat columns - matching every other card's own "real, designed
 * empty state" rule rather than a shared generic placeholder.
 */
export function WeeklySummaryCard({ weeklySummary, testID }: WeeklySummaryCardProps) {
  if (weeklySummary.workouts === 0) {
    return (
      <Card variant="elevated" testID={testID}>
        <EmptyState
          illustration={<Ionicons name="calendar-outline" size={40} color={color.textTertiary} />}
          title={t('home.weeklySummary.emptyTitle')}
          message={t('home.weeklySummary.emptyMessage')}
          testID={testID ? `${testID}-empty` : undefined}
        />
      </Card>
    );
  }

  const volumeLabel = Weight.fromKilograms(weeklySummary.volumeKg).toDisplayString('kg');
  const durationLabel = formatHomeDurationSeconds(weeklySummary.durationSeconds);

  return (
    <Card variant="elevated" testID={testID}>
      <Column gap={3}>
        <Text variant="label" color="secondary">
          {t('home.weeklySummary.title')}
        </Text>
        <Row gap={4} wrap>
          <Column gap={1}>
            <Text variant="numeric" color="primary">
              {weeklySummary.workouts}
            </Text>
            <Text variant="caption" color="tertiary">
              {t('home.weeklySummary.workoutsLabel')}
            </Text>
          </Column>
          <Column gap={1}>
            <Text variant="numeric" color="primary">
              {weeklySummary.sets}
            </Text>
            <Text variant="caption" color="tertiary">
              {t('home.weeklySummary.setsLabel')}
            </Text>
          </Column>
          <Column gap={1}>
            <Text variant="numeric" color="primary">
              {volumeLabel}
            </Text>
            <Text variant="caption" color="tertiary">
              {t('home.weeklySummary.volumeLabel')}
            </Text>
          </Column>
          <Column gap={1}>
            <Text variant="numeric" color="primary">
              {durationLabel}
            </Text>
            <Text variant="caption" color="tertiary">
              {t('home.weeklySummary.durationLabel')}
            </Text>
          </Column>
        </Row>
      </Column>
    </Card>
  );
}
