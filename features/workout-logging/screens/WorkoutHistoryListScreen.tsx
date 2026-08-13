import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useEffect, useMemo } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { Stack, router } from 'expo-router';

import { Column, Row, Screen } from '@/components/layout';
import { Card, Text } from '@/components/ui';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback';
import { PressScale } from '@/components/gestures/PressScale';
import { formatAchievedDate } from '@/features/records';
import { Weight } from '@/domain/Weight';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useContainer } from '@/services/container';
import { color, space } from '@/theme/tokens';

import {
  groupSessionHistoryByMonth,
  type HistoryListEntry,
} from '../components/groupSessionHistoryByMonth';
import { useSessionHistoryList } from '../hooks/useSessionHistory';
import type { SessionListItem } from '../repository/WorkoutSessionRepository';

/**
 * `app/profile/history.tsx`'s screen body - reached from `ProfileScreen`'s
 * "Training history" row, same `/profile/records` precedent P8 already set
 * (this route's own `<Stack.Screen>` override, no shared tab header). Month-
 * grouped via {@link groupSessionHistoryByMonth}, `FlashList`-backed and
 * `onEndReached`-paginated (`useSessionHistoryList`'s own `useInfiniteQuery`)
 * so a 2,500-session history never holds more than a fetched window of rows
 * in memory at once (this phase's own NFR) - grouping is recomputed over
 * every page fetched so far, not just the newest one, so scrolling further
 * never produces a duplicate month header.
 */
export function WorkoutHistoryListScreen() {
  const { sessionService } = useContainer();
  const { data, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSessionHistoryList(sessionService);

  const sessions: SessionListItem[] = useMemo(() => data?.pages.flat() ?? [], [data]);
  const entries = useMemo(() => groupSessionHistoryByMonth(sessions), [sessions]);
  const isEmpty = !isPending && !isError && sessions.length === 0;

  // Same rationale `PersonalRecordsScreen.tsx` documents for its own
  // pending/empty announcements: `Skeleton`/`EmptyState` don't announce
  // themselves, and the error branch is left alone because `ErrorState`
  // already announces its own message.
  useEffect(() => {
    if (isPending) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    } else if (isEmpty) {
      AccessibilityInfo.announceForAccessibility(t('workoutLogging.history.emptyTitle'));
    }
  }, [isPending, isEmpty]);

  return (
    <Screen testID="workout-history-list-screen" padded={false} edges={['top', 'bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t('workoutLogging.history.title'),
          headerStyle: { backgroundColor: color.background },
          headerTintColor: color.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <View style={{ flex: 1 }}>
        {isPending ? (
          <HistoryListSkeleton />
        ) : isError ? (
          <ErrorState
            error={t('workoutLogging.history.loadErrorMessage')}
            onRetry={() => refetch()}
          />
        ) : isEmpty ? (
          <EmptyState
            illustration={<Ionicons name="time-outline" size={48} color={color.textTertiary} />}
            title={t('workoutLogging.history.emptyTitle')}
            message={t('workoutLogging.history.emptyMessage')}
            testID="workout-history-empty-state"
          />
        ) : (
          <FlashList
            data={entries}
            keyExtractor={(entry) => entry.key}
            getItemType={(entry) => entry.type}
            contentContainerStyle={{ padding: space[4] }}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) {
                void fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={isFetchingNextPage ? <HistoryListFooterSkeleton /> : null}
            renderItem={({ item }: { item: HistoryListEntry }) =>
              item.type === 'header' ? (
                <Text
                  variant="label"
                  color="secondary"
                  style={{ paddingTop: space[4], paddingBottom: space[2] }}
                >
                  {item.label}
                </Text>
              ) : (
                <View style={{ marginBottom: space[3] }}>
                  <HistoryRow
                    session={item.session}
                    testID={`workout-history-row-${item.session.id}`}
                  />
                </View>
              )
            }
            testID="workout-history-list"
          />
        )}
      </View>
    </Screen>
  );
}

function HistoryRow({ session, testID }: { session: SessionListItem; testID?: string }) {
  const dateLabel = formatAchievedDate(session.startedAt);
  const volumeLabel = Weight.fromKilograms(session.totalVolumeKg).toDisplayString('kg');
  const accessibilityLabel = t('workoutLogging.history.rowAccessibilityLabelTemplate', {
    title: session.title,
    date: dateLabel,
    sets: session.totalSets,
    volume: volumeLabel,
  });

  return (
    <PressScale
      onPress={() => router.push(routes.history.detail(session.id))}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Card variant="elevated">
        <Row justify="space-between" align="center">
          <Column gap={1} style={{ flex: 1 }}>
            <Text variant="bodyMedium" color="primary" numberOfLines={1}>
              {session.title}
            </Text>
            <Text variant="footnote" color="secondary">
              {dateLabel}
            </Text>
          </Column>
          <Column gap={1} align="flex-end">
            <Text variant="numeric" color="primary">
              {t('workoutLogging.summary.volumeValueTemplate', { value: volumeLabel })}
            </Text>
            <Text variant="caption" color="tertiary">
              {t('workoutLogging.summary.setsValueTemplate', { count: session.totalSets })}
            </Text>
          </Column>
        </Row>
      </Card>
    </PressScale>
  );
}

function HistoryListSkeleton() {
  return (
    <Column gap={3} style={{ padding: space[4] }}>
      {[0, 1, 2, 3, 4].map((index) => (
        <Skeleton key={index} width="100%" height={72} radius="xl" />
      ))}
    </Column>
  );
}

function HistoryListFooterSkeleton() {
  return (
    <View style={{ paddingVertical: space[4] }}>
      <Skeleton width="100%" height={72} radius="xl" />
    </View>
  );
}
