import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Stack } from 'expo-router';

import { Column, Screen } from '@/components/layout';
import { ListRow } from '@/components/ui';
import { ConfirmDialog, EmptyState, ErrorState, Skeleton } from '@/components/feedback';
import { useStartWorkout } from '@/features/workout-logging';
import { t } from '@/i18n';
import { useContainer } from '@/services/container';
import { color, space } from '@/theme/tokens';

export interface PlanDayPickerScreenProps {
  planId: string;
}

/**
 * Home's "change day" flow body (`app/(modals)/plan-day-picker.tsx`'s thin
 * wrapper renders this - CLAUDE.md: "app/ never contains screen bodies").
 * Reached only when the active plan has more than one day - `ActivePlanCard`
 * hides the "change day" action otherwise, so this screen never needs a
 * redundant guard for that case.
 *
 * The plan itself is fetched with its own local `useQuery` (not `plans`'
 * `usePlan` hook, which isn't barrel-exported) going straight through
 * `planService.getPlan`, the same "go through the service, not another
 * feature's hook" shape `useHomeDashboard.ts` already uses for its own
 * active-plan read - both deliberately re-fetch rather than share `plans`'
 * own query cache, consistent with that existing precedent.
 *
 * Starts the workout with `{ navigation: 'replace' }`
 * (`useStartWorkout`'s navigation option, added for exactly this case)
 * rather than the default push: this screen is itself a pushed `(modals)`
 * route, and a plain push would leave it sitting on the stack underneath
 * `workout/active`, revealed again the moment the user later minimizes out
 * of the workout - a stale intermediate screen `ActiveWorkoutBanner`'s
 * "return to the tab bar" contract doesn't expect. `router.replace` swaps
 * this screen's own stack entry for `workout/active` in one atomic
 * navigation action instead (the same cross-group `replace` mechanism
 * `useFinishDiscardWorkout` already uses for `finish()`/`discard()`,
 * ADR-0007 rule 3), so there is no push-then-pop ordering to get right, and
 * no window where both screens are on the stack at once - applied to both
 * the direct-start action and the "Resume" choice on the blocked-session
 * dialog, since both paths call `useStartWorkout`'s `enterWorkout()`.
 */
export function PlanDayPickerScreen({ planId }: PlanDayPickerScreenProps) {
  const { planService, sessionService } = useContainer();
  const {
    data: plan,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['home', 'planDayPicker', planId],
    queryFn: () => planService.getPlan(planId),
  });
  const { startFromPlanDay, isStarting, blockedSession, dismissBlocked, resumeBlocked } =
    useStartWorkout(sessionService);
  const isEmpty = !isPending && !isError && !!plan && plan.days.length === 0;

  // Same `Skeleton`-hands-announcements-to-the-screen /
  // `EmptyState`-doesn't-self-announce contract `PersonalRecordsScreen.tsx`/
  // `WorkoutHistoryListScreen.tsx` already document and implement
  // (accessibility report A11Y-P8-003/A11Y-P9-002) - the error and
  // not-found branches are deliberately not duplicated here since
  // `ErrorState` already announces its own message (A11Y-002).
  useEffect(() => {
    if (isPending) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    } else if (isEmpty) {
      AccessibilityInfo.announceForAccessibility(t('home.planDayPicker.emptyTitle'));
    }
  }, [isPending, isEmpty]);

  return (
    <Screen testID="plan-day-picker-screen" padded={false} edges={['bottom']}>
      <Stack.Screen options={{ title: t('home.planDayPicker.title') }} />

      {isPending ? (
        <Column gap={3} style={{ padding: space[4] }}>
          <Skeleton width="100%" height={56} radius="lg" />
          <Skeleton width="100%" height={56} radius="lg" />
          <Skeleton width="100%" height={56} radius="lg" />
        </Column>
      ) : isError ? (
        <ErrorState error={t('home.planDayPicker.loadErrorMessage')} onRetry={() => refetch()} />
      ) : !plan ? (
        <ErrorState error={t('home.planDayPicker.notFoundMessage')} />
      ) : plan.days.length === 0 ? (
        <EmptyState
          illustration={<Ionicons name="list-outline" size={48} color={color.textTertiary} />}
          title={t('home.planDayPicker.emptyTitle')}
          message={t('home.planDayPicker.emptyMessage')}
          testID="plan-day-picker-empty-state"
        />
      ) : (
        <Column>
          {plan.days.map((day) => (
            <ListRow
              key={day.id}
              title={day.name}
              trailing={<Ionicons name="play" size={18} color={color.textSecondary} />}
              // `disabled` alone (not a nulled `onPress`) gates the tap -
              // `PressScale`/RN `Pressable` already refuse to fire `onPress`
              // once `disabled` is true, the same pattern `Button.tsx` uses
              // for its own `loading` state. Nulling `onPress` here instead
              // (as this screen did before this fix) took every row out of
              // `ListRow`'s `PressScale` branch entirely the moment
              // `isStarting` flipped true, silently discarding the
              // `accessibilityRole`/`accessibilityLabel`/`accessibilityState`
              // (including the `busy` flag set two lines below) that branch
              // is the only one that sets - confirmed via an RNTL prop dump
              // showing an empty `{}` for all three while a start was in
              // flight, see this phase's accessibility report.
              onPress={() => void startFromPlanDay(day.id, { navigation: 'replace' })}
              disabled={isStarting}
              busy={isStarting}
              testID={`plan-day-picker-row-${day.id}`}
            />
          ))}
        </Column>
      )}

      <ConfirmDialog
        visible={blockedSession !== null}
        title={t('workoutLogging.start.blockedTitle')}
        message={t('workoutLogging.start.blockedMessageTemplate', {
          title: blockedSession?.session.title ?? '',
        })}
        confirmLabel={t('workoutLogging.start.resumeButtonLabel')}
        onConfirm={() => resumeBlocked({ navigation: 'replace' })}
        onCancel={dismissBlocked}
        testID="plan-day-picker-start-blocked-dialog"
      />
    </Screen>
  );
}
