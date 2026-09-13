import { useEffect } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';

import { GoalProgressEntryScreen } from '@/features/daily-goals/screens/GoalProgressEntryScreen';
import { t } from '@/i18n';

/**
 * Thin wrapper into `GoalProgressEntryScreen` (CLAUDE.md: "app/ never
 * contains screen bodies"), built on the same conventions as
 * `rest-timer-settings.tsx`/`plan-day-picker.tsx` - `goalId` as a plain
 * route param (a single, cheap round trip, unlike `exercise-picker`'s
 * unbounded-list store).
 */
export default function GoalProgressEntry() {
  const { goalId } = useLocalSearchParams<{ goalId: string }>();

  // Defensive only, mirroring `rest-timer-settings.tsx`'s own "reached some
  // other way than the real in-app flow" guard.
  useEffect(() => {
    if (!goalId && router.canGoBack()) {
      router.back();
    }
  }, [goalId]);

  if (!goalId) {
    return null;
  }

  return (
    <>
      <Stack.Screen options={{ title: t('dailyGoals.progressEntry.screenTitle') }} />
      <GoalProgressEntryScreen goalId={goalId} />
    </>
  );
}
