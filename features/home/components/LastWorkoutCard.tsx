import { Ionicons } from '@expo/vector-icons';

import { Column, Row } from '@/components/layout';
import { Card, Text } from '@/components/ui';
import { EmptyState } from '@/components/feedback';
import { formatAchievedDate } from '@/features/records';
import { Weight } from '@/domain/Weight';
import { t } from '@/i18n';
import { color } from '@/theme/tokens';

import type { HomeLastSessionDto } from '../repository/HomeDashboardRepository';
import { formatHomeDurationSeconds } from './formatHomeDuration';

export interface LastWorkoutCardProps {
  lastSession: HomeLastSessionDto | null;
  onPress: (sessionId: string) => void;
  testID?: string | undefined;
}

/** Home's "last workout" card - taps through to `routes.history.detail`. */
export function LastWorkoutCard({ lastSession, onPress, testID }: LastWorkoutCardProps) {
  if (!lastSession) {
    return (
      <Card variant="elevated" testID={testID}>
        <EmptyState
          illustration={<Ionicons name="time-outline" size={40} color={color.textTertiary} />}
          title={t('home.lastWorkout.emptyTitle')}
          message={t('home.lastWorkout.emptyMessage')}
          testID={testID ? `${testID}-empty` : undefined}
        />
      </Card>
    );
  }

  const dateLabel = formatAchievedDate(lastSession.finishedAt);
  const volumeLabel = Weight.fromKilograms(lastSession.totalVolumeKg).toDisplayString('kg');
  const durationLabel = formatHomeDurationSeconds(lastSession.durationSeconds);
  const accessibilityLabel = t('home.lastWorkout.accessibilityLabelTemplate', {
    title: lastSession.title,
    date: dateLabel,
    volume: volumeLabel,
    sets: lastSession.totalSets,
  });

  return (
    <Card
      variant="elevated"
      onPress={() => onPress(lastSession.id)}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Column gap={3}>
        <Text variant="label" color="secondary">
          {t('home.lastWorkout.title')}
        </Text>
        <Column gap={1}>
          <Text variant="title3" color="primary" numberOfLines={1}>
            {lastSession.title}
          </Text>
          <Text variant="footnote" color="secondary">
            {dateLabel}
          </Text>
        </Column>
        <Row gap={4}>
          <Column gap={1}>
            <Text variant="numeric" color="primary">
              {volumeLabel}
            </Text>
            <Text variant="caption" color="tertiary">
              {t('home.lastWorkout.volumeLabel')}
            </Text>
          </Column>
          <Column gap={1}>
            <Text variant="numeric" color="primary">
              {lastSession.totalSets}
            </Text>
            <Text variant="caption" color="tertiary">
              {t('home.lastWorkout.setsLabel')}
            </Text>
          </Column>
          <Column gap={1}>
            <Text variant="numeric" color="primary">
              {durationLabel}
            </Text>
            <Text variant="caption" color="tertiary">
              {t('home.lastWorkout.durationLabel')}
            </Text>
          </Column>
        </Row>
      </Column>
    </Card>
  );
}
