import { Stack } from 'expo-router';

import { t } from '@/i18n';
import { color } from '@/theme/tokens';

/**
 * P17's own root-level Stack (`app/goals/`, outside `(tabs)`) - mirrors
 * `app/body-metrics/_layout.tsx` exactly, the closest precedent for a
 * multi-screen root-level feature reached from elsewhere in the app (there,
 * `ProfileScreen`'s "Body measurements" row; here, `home`'s
 * `TodaysGoalsCard`). `manage/reminders/index`/`manage/reminders/
[reminderId]/stats` use slash-joined `name`s the same way
 * `app/(tabs)/plans/_layout.tsx`'s `"[planId]/day/[dayId]"` entry already
 * establishes works for an arbitrarily nested route with no extra
 * `_layout.tsx` files needed in between.
 */
export default function GoalsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: color.background },
        headerTintColor: color.textPrimary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: color.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('dailyGoals.today.screenTitle') }} />
      <Stack.Screen name="manage/index" options={{ title: t('dailyGoals.manage.screenTitle') }} />
      <Stack.Screen name="manage/create" options={{ title: t('dailyGoals.form.createTitle') }} />
      <Stack.Screen
        name="manage/edit/[goalId]"
        options={{ title: t('dailyGoals.form.editTitle') }}
      />
      <Stack.Screen
        name="manage/reminders/index"
        options={{ title: t('dailyGoals.reminders.screenTitle') }}
      />
      {/* `ReminderStatsScreen` overrides this with the reminder's own name
          once it loads, the same per-instance dynamic-title pattern
          `MetricHistoryScreen`/`PlanDetailScreen` already establish. */}
      <Stack.Screen
        name="manage/reminders/[reminderId]/stats"
        options={{ title: t('dailyGoals.stats.screenTitle') }}
      />
    </Stack>
  );
}
