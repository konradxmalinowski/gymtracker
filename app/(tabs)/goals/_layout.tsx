import { Stack } from 'expo-router';

import { t } from '@/i18n';
import { color } from '@/theme/tokens';

/**
 * Nested Stack for the Goals tab, moved here from a root-level `app/goals/`
 * (outside `(tabs)`) during the UI/UX polish sweep that added Goals as a 6th
 * bottom tab - same restructure `plans`/`exercises`/`stats` went through in
 * P4/P5. `app/(tabs)/_layout.tsx` registers this whole directory as
 * `<Tabs.Screen name="goals" .../>` (a folder reference, not
 * `"goals/index"`) for the same reason documented on those layouts: pointing
 * a `Tabs.Screen` directly at a leaf file inside a directory that also has
 * its own `_layout.tsx` skips this nested Stack entirely, breaking
 * `router.push()` to `manage`/`manage/create`/etc. within this tab. A route
 * group in parentheses contributes nothing to the URL, so every
 * `routes.goals.*` helper in `navigation/routes.ts` still resolves to the
 * exact same path (`/goals`, `/goals/manage`, ...) as before the move -
 * `home`'s `TodaysGoalsCard` needed no change.
 *
 * `manage/reminders/index`/`manage/reminders/[reminderId]/stats` use
 * slash-joined `name`s the same way `app/(tabs)/plans/_layout.tsx`'s
 * `"[planId]/day/[dayId]"` entry already establishes works for an
 * arbitrarily nested route with no extra `_layout.tsx` files needed in
 * between.
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
      {/* headerShown: false, matching every other tab's index screen - the
          tab bar is the only chrome. `DailyGoalsScreen` already renders its
          own in-content title row (title2 "Today" + a settings gear button
          into `manage`), so there is nothing to duplicate by turning the
          native header off here. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
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
