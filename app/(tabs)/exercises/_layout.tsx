import { Stack } from 'expo-router';

import { t } from '@/i18n';
import { color } from '@/theme/tokens';

/**
 * Nested Stack for the Exercises tab (ROADMAP.md P4: list -> detail ->
 * create/edit). `app/(tabs)/_layout.tsx` registers this whole directory as
 * `<Tabs.Screen name="exercises" .../>` (a *folder* reference, not
 * `"exercises/index"`) precisely so it resolves to this `_layout.tsx` as a
 * nested navigator rather than bypassing it - pointing a `Tabs.Screen` directly
 * at a leaf file inside a directory that also has its own `_layout.tsx` skips
 * that nested navigator entirely, which is exactly what would break `router.
 * push()` to a sibling route (`/exercises/:id`, `/exercises/create`, ...): there
 * would be no Stack present to push onto within this tab. With this fix, every
 * screen in this folder shares one Stack, and - the standard Expo Router/React
 * Navigation behavior for a Stack nested inside a Tab - the bottom tab bar stays
 * visible for all of them, including the pushed detail/create/edit screens, not
 * just the list.
 *
 * The list screen keeps `headerShown: false` (matches every other tab's index
 * screen - no native header, the tab bar is the only chrome). Detail/create/edit
 * are pushed on top and need a real back affordance beyond an edge swipe, so
 * they turn the header back on - the same split `app/profile/settings/_layout.tsx`
 * already uses for a pushed stack (this one just also keeps its tab bar, since
 * it lives inside a tab rather than as a standalone top-level route).
 */
export default function ExercisesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: color.background },
        headerTintColor: color.textPrimary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: color.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      {/* No static `title` here - `ExerciseDetailScreen` renders its own
          `<Stack.Screen options={{ title: <exercise name> }} />` once the
          exercise loads, the standard Expo Router pattern for a per-instance
          dynamic header title (the exercise name isn't known until the query
          resolves). `headerShown: true` still has to be set here since that
          part *is* static. */}
      <Stack.Screen name="[id]" options={{ headerShown: true, title: t('tabs.exercises') }} />
      <Stack.Screen
        name="create"
        options={{ headerShown: true, title: t('exerciseLibrary.form.createTitle') }}
      />
      <Stack.Screen
        name="edit/[id]"
        options={{ headerShown: true, title: t('exerciseLibrary.form.editTitle') }}
      />
    </Stack>
  );
}
