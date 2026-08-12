import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useEffect } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { Stack } from 'expo-router';

import { Column, Row, Screen } from '@/components/layout';
import { Card, Text } from '@/components/ui';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback';
import { t } from '@/i18n';
import { useContainer } from '@/services/container';
import { color, space } from '@/theme/tokens';

import {
  formatAchievedDate,
  formatRecordValue,
  recordTypeLabel,
} from '../components/personalRecordFormatting';
import { useRecordExerciseNames } from '../hooks/useRecordExerciseNames';
import { useRecentRecords } from '../hooks/useRecords';
import type { PersonalRecord } from '../repository/PersonalRecordRepository';

/** Generous enough to show a real lifter's full current-record set (8 record types x however many exercises they've trained) without paging - `PersonalRecordService.listRecent`'s own cap is 500. */
const RECENT_RECORDS_LIMIT = 200;

/**
 * `app/profile/records.tsx`'s screen body - the first screen in
 * `features/records/screens/`. Lists every current PR, most recently
 * achieved first (`listRecent`'s own ordering - ADR-0015 Decision 3).
 *
 * `/profile/records` has no dedicated `_layout.tsx` (unlike `app/profile/
 * settings/`, which needs one because it groups three screens under one
 * header style) - the root `<Stack>` in `app/_layout.tsx` sets
 * `headerShown: false` globally, so this screen declares its own
 * `<Stack.Screen>` override, the same per-instance-options pattern
 * `ExerciseDetailScreen.tsx` already uses for its dynamic title.
 */
export function PersonalRecordsScreen() {
  const { recordService } = useContainer();
  const {
    data: records,
    isPending,
    isError,
    refetch,
  } = useRecentRecords(recordService, RECENT_RECORDS_LIMIT);
  const exerciseIds = records?.map((record) => record.exerciseId) ?? [];
  const { names } = useRecordExerciseNames(exerciseIds);
  const isEmpty = !isPending && !isError && (!records || records.length === 0);

  // Skeleton.tsx's own contract explicitly hands loading announcements off to
  // the screen (per-skeleton announcements aren't meaningful), so `isPending`
  // needs one here - the same `common.loading` announcement
  // `ProgressionSettingsScreen.tsx`/`UnitsSettingsScreen.tsx`/`ProfileScreen.tsx`
  // already fire. Likewise for the empty state: `EmptyState` (unlike
  // `ErrorState`) has no built-in announcement of its own, so a silent
  // pending->empty transition would otherwise never reach a screen-reader
  // user (accessibility report A11Y-P8-003). The error branch is
  // deliberately not duplicated here - `ErrorState.tsx` already announces its
  // own message via its own `useEffect` (A11Y-002), so adding a second
  // explicit announcement for `isError` would just double-fire.
  useEffect(() => {
    if (isPending) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    } else if (isEmpty) {
      AccessibilityInfo.announceForAccessibility(t('records.list.emptyTitle'));
    }
  }, [isPending, isEmpty]);

  return (
    <Screen testID="personal-records-screen" padded={false} edges={['top', 'bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t('records.list.title'),
          headerStyle: { backgroundColor: color.background },
          headerTintColor: color.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <View style={{ flex: 1 }}>
        {isPending ? (
          <RecordsListSkeleton />
        ) : isError ? (
          <ErrorState error={t('records.list.loadErrorMessage')} onRetry={() => refetch()} />
        ) : isEmpty ? (
          <EmptyState
            illustration={<Ionicons name="trophy-outline" size={48} color={color.textTertiary} />}
            title={t('records.list.emptyTitle')}
            message={t('records.list.emptyMessage')}
            testID="personal-records-empty-state"
          />
        ) : (
          <FlashList
            data={records}
            keyExtractor={(record) => record.id}
            contentContainerStyle={{ padding: space[4] }}
            renderItem={({ item }) => (
              <View style={{ marginBottom: space[3] }}>
                <PersonalRecordCard
                  record={item}
                  exerciseName={names.get(item.exerciseId) ?? null}
                  testID={`personal-record-${item.id}`}
                />
              </View>
            )}
            testID="personal-records-list"
          />
        )}
      </View>
    </Screen>
  );
}

function PersonalRecordCard({
  record,
  exerciseName,
  testID,
}: {
  record: PersonalRecord;
  exerciseName: string | null;
  testID?: string | undefined;
}) {
  const typeLabel = recordTypeLabel(record.recordType, record.repBucket);
  const valueLabel = formatRecordValue(record);
  const dateLabel = formatAchievedDate(record.achievedAt);
  const name = exerciseName ?? t('records.list.title');

  return (
    <View
      accessible
      accessibilityLabel={t('records.list.rowAccessibilityLabelTemplate', {
        exercise: name,
        recordType: typeLabel,
        value: valueLabel,
        date: dateLabel,
      })}
    >
      <Card variant="elevated" testID={testID}>
        <Row justify="space-between" align="center">
          <Column gap={1} style={{ flex: 1 }}>
            <Text variant="bodyMedium" color="primary" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="footnote" color="secondary">
              {typeLabel}
            </Text>
            <Text variant="caption" color="tertiary">
              {t('records.list.achievedAtLabelTemplate', { date: dateLabel })}
            </Text>
          </Column>
          <Text variant="numeric" color="accent">
            {valueLabel}
          </Text>
        </Row>
      </Card>
    </View>
  );
}

function RecordsListSkeleton() {
  return (
    <Column gap={3} style={{ padding: space[4] }}>
      {[0, 1, 2, 3, 4].map((index) => (
        <Skeleton key={index} width="100%" height={72} radius="xl" />
      ))}
    </Column>
  );
}
