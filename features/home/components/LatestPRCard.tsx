import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { Column, Row } from '@/components/layout';
import { Card, Text } from '@/components/ui';
import { EmptyState } from '@/components/feedback';
import { formatAchievedDate, formatRecordValue, recordTypeLabel } from '@/features/records';
import type { PersonalRecord } from '@/features/records';
import { t } from '@/i18n';
import { color } from '@/theme/tokens';

export interface LatestPRCardProps {
  latestRecord: PersonalRecord | null;
  /** Already resolved by `useHomeDashboard` (its own `exerciseService.getById` lookup) - this card never fetches its own name. `null` when the exercise lookup itself came back empty (e.g. a deleted custom exercise). */
  exerciseName: string | null;
  testID?: string | undefined;
}

/**
 * Home's "latest PR" card - the single most recent current personal record
 * (`HomeDashboardData.latestRecord`, `recordService.listRecent(1)`'s own
 * most-recently-achieved-first ordering, ADR-0015 Decision 3) plus its
 * already-resolved exercise name. Formatting delegates to
 * `records`' own `recordTypeLabel`/`formatRecordValue`/`formatAchievedDate`
 * (`personalRecordFormatting.ts`) so this card never disagrees with
 * `PersonalRecordsScreen`/the exercise-detail PR slot on what a record type
 * or value reads as - the same barrel those two surfaces already use.
 *
 * No tap target: records aren't independently routable from Home per this
 * phase's plan (`ActivePlanCard`/`LastWorkoutCard` are the only two cards
 * with a navigation action). `Card` has no `onPress` here, so the
 * accessibility label is carried by an outer `accessible` `View` instead -
 * mirroring `PersonalRecordsScreen`'s own `PersonalRecordCard` inner
 * component, which does the same for the identical "informational card,
 * not a button" reason.
 */
export function LatestPRCard({ latestRecord, exerciseName, testID }: LatestPRCardProps) {
  if (!latestRecord) {
    return (
      <Card variant="elevated" testID={testID}>
        <EmptyState
          illustration={<Ionicons name="trophy-outline" size={40} color={color.textTertiary} />}
          title={t('home.latestPR.emptyTitle')}
          message={t('home.latestPR.emptyMessage')}
          testID={testID ? `${testID}-empty` : undefined}
        />
      </Card>
    );
  }

  const name = exerciseName ?? t('home.latestPR.title');
  const typeLabel = recordTypeLabel(latestRecord.recordType, latestRecord.repBucket);
  const valueLabel = formatRecordValue(latestRecord);
  const dateLabel = formatAchievedDate(latestRecord.achievedAt);
  const accessibilityLabel = t('home.latestPR.accessibilityLabelTemplate', {
    exercise: name,
    recordType: typeLabel,
    value: valueLabel,
    date: dateLabel,
  });

  return (
    <View accessible accessibilityLabel={accessibilityLabel}>
      <Card variant="elevated" testID={testID}>
        <Column gap={3}>
          <Text variant="label" color="secondary">
            {t('home.latestPR.title')}
          </Text>
          <Column gap={1}>
            <Text variant="title3" color="primary" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="footnote" color="secondary">
              {typeLabel}
            </Text>
          </Column>
          <Row justify="space-between" align="center">
            <Text variant="numeric" color="accent">
              {valueLabel}
            </Text>
            <Text variant="caption" color="tertiary">
              {t('home.latestPR.achievedAtLabelTemplate', { date: dateLabel })}
            </Text>
          </Row>
        </Column>
      </Card>
    </View>
  );
}
