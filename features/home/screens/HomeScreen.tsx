import { useEffect } from 'react';
import { AccessibilityInfo, RefreshControl } from 'react-native';
import { router } from 'expo-router';

import { Column, Screen } from '@/components/layout';
import { Button, Text } from '@/components/ui';
import { ConfirmDialog, ErrorState, Skeleton } from '@/components/feedback';
// Relative, same-feature imports rather than this feature's own
// `@/features/home` barrel - mirrors `PlanDetailScreen`/`PersonalRecordsScreen`'s
// existing precedent (a feature's own screen reaches its own components/hooks
// directly; the barrel exists for *other* features to import from).
import { ActivePlanCard } from '../components/ActivePlanCard';
import { LastWorkoutCard } from '../components/LastWorkoutCard';
import { LatestPRCard } from '../components/LatestPRCard';
import { StreakCard } from '../components/StreakCard';
import { WeeklySummaryCard } from '../components/WeeklySummaryCard';
import { useHomeDashboard } from '../hooks/useHomeDashboard';
// P6/P10: `useStartWorkout` is `workout-logging`'s one deliberate
// presentation-layer barrel export (see that barrel's own doc comment) -
// Home shares a single instance of it between Quick Start and
// `ActivePlanCard`'s suggested-day "Start" action, the same
// one-instance-per-screen shape `PlanDetailScreen` already established for
// its own two start entry points (day card "Start" + the plan-level blocked
// dialog).
import { useStartWorkout } from '@/features/workout-logging';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useContainer } from '@/services/container';
import { color, space } from '@/theme/tokens';

/**
 * `app/(tabs)/index.tsx`'s screen body - P10's real Home dashboard,
 * replacing the P6-era wordmark-plus-Quick-Start placeholder wholesale.
 * `useHomeDashboard` composes every card's data into one query (this
 * phase's own acceptance criterion: the screen sees a single
 * `isPending`/`isError`, not five staggered per-card ones); each card still
 * owns its own real empty state internally, so a loaded-but-mostly-empty
 * dashboard (fresh install) never looks broken or blank.
 *
 * `isRefetching` (not `isFetching`) backs pull-to-refresh deliberately -
 * `isFetching` is also `true` during the very first load, which would leave
 * `Screen`'s `refreshControl` spinning underneath the skeleton branch below
 * on initial mount; `isRefetching` is only ever true for a manual pull once
 * data already exists.
 */
export function HomeScreen() {
  const container = useContainer();
  const { data, isPending, isError, isRefetching, refetch } = useHomeDashboard({
    homeDashboardRepository: container.homeDashboardRepository,
    planService: container.planService,
    recordService: container.recordService,
    exerciseService: container.exerciseService,
    clock: container.clock,
  });
  const {
    startEmpty,
    startFromPlanDay,
    isStarting,
    blockedSession,
    dismissBlocked,
    resumeBlocked,
  } = useStartWorkout(container.sessionService);

  // Skeleton.tsx hands loading announcements off to the screen (per-skeleton
  // announcements aren't meaningful) - the same `common.loading`
  // announcement `PersonalRecordsScreen`/`ProgressionSettingsScreen` already
  // fire (accessibility report A11Y-P8-003). No separate empty-dashboard
  // announcement: unlike a list screen, this dashboard always renders real
  // content (every card owns its own empty state), so there is no
  // pending->empty transition here to announce.
  useEffect(() => {
    if (isPending) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    }
  }, [isPending]);

  if (isPending) {
    return (
      <Screen testID="home-screen" scroll>
        <HomeSkeleton />
      </Screen>
    );
  }

  if (isError || !data) {
    return (
      <Screen testID="home-screen">
        <ErrorState error={t('home.loadErrorMessage')} onRetry={() => refetch()} />
      </Screen>
    );
  }

  return (
    <Screen
      testID="home-screen"
      scroll
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          tintColor={color.textSecondary}
        />
      }
    >
      <Column gap={4} style={{ paddingVertical: space[4] }}>
        <Column gap={1}>
          <Text variant="display" color="primary">
            {t('home.title')}
          </Text>
          <Text variant="body" color="secondary">
            {t('home.tagline')}
          </Text>
        </Column>

        <Button
          variant="primary"
          label={t('workoutLogging.quickStartButtonLabel')}
          onPress={() => void startEmpty()}
          loading={isStarting}
          fullWidth
          testID="home-quick-start-button"
        />

        <ActivePlanCard
          activePlan={data.activePlan}
          suggestedDay={data.suggestedDay}
          onStart={(planDayId) => void startFromPlanDay(planDayId)}
          isStarting={isStarting}
          onChangeDay={(planId) => router.push(routes.modals.planDayPicker(planId))}
          onOpenPlan={(planId) => router.push(routes.plans.detail(planId))}
          onGoToPlans={() => router.push(routes.tabs.plans())}
          testID="home-active-plan-card"
        />

        <LastWorkoutCard
          lastSession={data.lastSession}
          onPress={(sessionId) => router.push(routes.history.detail(sessionId))}
          testID="home-last-workout-card"
        />

        <StreakCard streak={data.streak} testID="home-streak-card" />

        <LatestPRCard
          latestRecord={data.latestRecord}
          exerciseName={data.latestRecordExerciseName}
          testID="home-latest-pr-card"
        />

        <WeeklySummaryCard weeklySummary={data.weeklySummary} testID="home-weekly-summary-card" />
      </Column>

      {/* Shared by Quick Start and `ActivePlanCard`'s "Start" action - both
          go through the one `useStartWorkout` instance above, so a session
          already in progress shows this same resume/cancel prompt no matter
          which of the two entry points triggered it. */}
      <ConfirmDialog
        visible={blockedSession !== null}
        title={t('workoutLogging.start.blockedTitle')}
        message={t('workoutLogging.start.blockedMessageTemplate', {
          title: blockedSession?.session.title ?? '',
        })}
        confirmLabel={t('workoutLogging.start.resumeButtonLabel')}
        onConfirm={resumeBlocked}
        onCancel={dismissBlocked}
        testID="home-start-blocked-dialog"
      />
    </Screen>
  );
}

function HomeSkeleton() {
  return (
    <Column gap={4} style={{ paddingVertical: space[4] }}>
      <Skeleton width="60%" height={40} />
      <Skeleton width="100%" height={48} radius="xl" />
      {[0, 1, 2, 3, 4].map((index) => (
        <Skeleton key={index} width="100%" height={120} radius="xl" />
      ))}
    </Column>
  );
}
