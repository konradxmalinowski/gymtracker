import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { router } from 'expo-router';

import { Column, Row, Screen } from '@/components/layout';
import { Button, Card, IconButton, StatTile, Text } from '@/components/ui';
import { ErrorState, Skeleton } from '@/components/feedback';
import { PRBadge } from '@/features/records';
import { Weight } from '@/domain/Weight';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useContainer } from '@/services/container';
import { useToastStore } from '@/stores/toastStore';
import { color, space } from '@/theme/tokens';

import { ShareableSummaryCard } from '../components/ShareableSummaryCard';
import { formatSessionDurationSeconds } from '../components/formatSessionDuration';
import { useSessionDetail, useSessionSummary } from '../hooks/useSessionHistory';

export interface WorkoutSummaryScreenProps {
  sessionId: string;
}

/**
 * `workout/summary/[sessionId]`'s screen body (ARCHITECTURE.md's route
 * graph: `SUM --> HOME`, nothing routes back into it). Reached only from
 * `useFinishDiscardWorkout`'s `finish()`, which already seeded
 * `useSessionSummary`'s query cache with the real `SessionSummary` before
 * navigating here - see that hook's own doc comment for the cold-cache
 * fallback this screen still has to render correctly (a `getSession()`-backed
 * summary with an empty `newPRs` array) for the rare case that seed is gone.
 *
 * `useSessionDetail` runs alongside `useSessionSummary` (not chained after
 * it) purely for `exercises.length` - `SessionSummary` itself has no
 * exercise-count field (see that type's own doc comment) - so both requests
 * are in flight together rather than one waiting on the other.
 */
export function WorkoutSummaryScreen({ sessionId }: WorkoutSummaryScreenProps) {
  const { sessionService } = useContainer();
  const queryClient = useQueryClient();
  const {
    data: summary,
    isPending: isSummaryPending,
    isError: isSummaryError,
  } = useSessionSummary(sessionService, queryClient, sessionId);
  const { data: session } = useSessionDetail(sessionService, sessionId);

  const shareCardRef = useRef<View>(null);
  const [isCardReady, setIsCardReady] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // Same rationale `WorkoutHistoryListScreen.tsx`/`PersonalRecordsScreen.tsx`
  // document for their own pending announcements: `WorkoutSummarySkeleton`
  // doesn't announce itself, and the error branch is left alone because
  // `ErrorState` already announces its own message (A11Y-P9-002).
  useEffect(() => {
    if (isSummaryPending) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    }
  }, [isSummaryPending]);

  function handleDone() {
    router.replace(routes.tabs.home());
  }

  async function handleShare() {
    if (!summary || !isCardReady || !shareCardRef.current) {
      // Edge case (this phase's own brief): a tap before the off-screen
      // share card has finished its first layout pass. `captureRef` against
      // an unlaid-out view can produce a zero-size or garbage image, so this
      // no-ops rather than risking that - the button is disabled for the
      // same reason (see the `disabled` prop below), this guard only covers
      // the narrow window between "disabled state hasn't re-rendered yet"
      // and "tap event already in flight."
      return;
    }
    setIsSharing(true);
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        // Never throws (matches `RestTimerNotificationService`'s "degrade to
        // a no-op rather than fail the flow that triggered it" discipline
        // for a different native capability this codebase already
        // established) - a device/build without a share sheet available
        // still leaves the rest of the summary screen fully usable.
        useToastStore
          .getState()
          .show({ message: t('workoutLogging.summary.shareUnavailableMessage') });
        return;
      }
      const uri = await captureRef(shareCardRef, { format: 'png', quality: 1 });
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: t('workoutLogging.summary.shareDialogTitle'),
      });
    } catch {
      useToastStore.getState().show({ message: t('workoutLogging.summary.shareErrorMessage') });
    } finally {
      setIsSharing(false);
    }
  }

  return (
    <Screen scroll testID="workout-summary-screen">
      <Column gap={6} style={{ paddingVertical: space[6] }}>
        <Row justify="space-between" align="center">
          <Text variant="title1" color="primary">
            {t('workoutLogging.summary.title')}
          </Text>
          <IconButton
            icon={<Ionicons name="share-outline" size={20} color={color.textPrimary} />}
            variant="ghost"
            accessibilityLabel={t('workoutLogging.summary.shareAccessibilityLabel')}
            onPress={() => void handleShare()}
            disabled={!summary || !isCardReady || isSharing}
            loading={isSharing}
            testID="workout-summary-share-button"
          />
        </Row>

        {isSummaryPending ? (
          <WorkoutSummarySkeleton />
        ) : isSummaryError || !summary ? (
          <ErrorState error={t('workoutLogging.summary.loadErrorMessage')} />
        ) : (
          <Column gap={6}>
            <Column gap={1}>
              <Text variant="title2" color="primary" numberOfLines={1}>
                {summary.title}
              </Text>
              <Text variant="footnote" color="secondary">
                {summary.localDate}
              </Text>
            </Column>

            {summary.newPRs.length > 0 ? (
              <PRBadge records={summary.newPRs} testID="workout-summary-pr-badge" />
            ) : null}

            <Card variant="elevated" padding={4}>
              <Row gap={3} wrap>
                <StatTile
                  label={t('workoutLogging.summary.durationLabel')}
                  value={formatSessionDurationSeconds(summary.durationSeconds)}
                  testID="workout-summary-duration"
                />
                <StatTile
                  label={t('workoutLogging.summary.exercisesLabel')}
                  value={session?.exercises.length ?? 0}
                  testID="workout-summary-exercise-count"
                />
                <StatTile
                  label={t('workoutLogging.summary.setsLabel')}
                  value={summary.totalSets}
                  testID="workout-summary-sets"
                />
                <StatTile
                  label={t('workoutLogging.summary.repsLabel')}
                  value={summary.totalReps}
                  testID="workout-summary-reps"
                />
                <StatTile
                  label={t('workoutLogging.summary.volumeLabel')}
                  value={Weight.fromKilograms(summary.totalVolumeKg).toDisplayString('kg')}
                  unit={t('workoutLogging.summary.volumeUnitSuffix')}
                  testID="workout-summary-volume"
                />
                {summary.estimatedKcal !== null ? (
                  <StatTile
                    label={t('workoutLogging.summary.caloriesLabel')}
                    value={summary.estimatedKcal}
                    unit={t('workoutLogging.summary.caloriesUnitSuffix')}
                    testID="workout-summary-calories"
                  />
                ) : null}
              </Row>
            </Card>

            <Button
              variant="primary"
              label={t('workoutLogging.summary.doneButtonLabel')}
              onPress={handleDone}
              fullWidth
              testID="workout-summary-done-button"
            />
          </Column>
        )}
      </Column>

      {/* Off-screen capture target for the Share action (Step 0 decision 2) -
          laid out normally (so `captureRef` has real content to snapshot)
          but positioned far outside the viewport and inert to touch, never
          meant to be seen directly. See `ShareableSummaryCard`'s own doc
          comment for why this is a separate layout from the on-screen body
          above rather than a capture of that body. */}
      {summary ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', top: -9999, left: 0, opacity: 0 }}
        >
          <ShareableSummaryCard
            ref={shareCardRef}
            title={summary.title}
            localDate={summary.localDate}
            durationSeconds={summary.durationSeconds}
            totalVolumeKg={summary.totalVolumeKg}
            totalSets={summary.totalSets}
            totalReps={summary.totalReps}
            estimatedKcal={summary.estimatedKcal}
            exerciseCount={session?.exercises.length ?? 0}
            newPRCount={summary.newPRs.length}
            onLayout={() => setIsCardReady(true)}
            testID="workout-summary-share-card"
          />
        </View>
      ) : null}
    </Screen>
  );
}

function WorkoutSummarySkeleton() {
  return (
    <Column gap={4}>
      <Skeleton width="60%" height={28} />
      <Skeleton width="100%" height={160} radius="xl" />
    </Column>
  );
}
