import { Stack } from 'expo-router';

import { t } from '@/i18n';
import { color } from '@/theme/tokens';

/**
 * Nested Stack for the Stats tab (ROADMAP.md P11: dashboard -> per-exercise
 * progression). `app/(tabs)/_layout.tsx` registers this whole directory as
 * `<Tabs.Screen name="stats" .../>` (a *folder* reference, not
 * `"stats/index"`) for the exact reason `app/(tabs)/plans/_layout.tsx`/
 * `app/(tabs)/exercises/_layout.tsx` already document for their own P4/P5
 * restructures: pointing a `Tabs.Screen` directly at a leaf file inside a
 * directory that also has its own `_layout.tsx` skips that nested navigator
 * entirely, which would break `router.push()` to `/stats/exercise/:exerciseId`
 * within this tab - there would be no Stack present to push onto.
 *
 * The list screen keeps `headerShown: false` (matches every other tab's
 * index screen). The per-exercise progression screen is pushed on top and
 * needs a real back affordance beyond an edge swipe, so it turns the header
 * back on - same split `exercises`/`plans` already use.
 */
export default function StatsLayout() {
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
      {/* No static `title` here - `ExerciseProgressionScreen` renders its own
          `<Stack.Screen options={{ title: <exercise name> }} />` once the
          exercise loads, the same per-instance dynamic header title pattern
          `ExerciseDetailScreen`/`PlanDetailScreen` establish. `headerShown:
          true` still has to be set here since that part *is* static. */}
      <Stack.Screen
        name="exercise/[exerciseId]"
        options={{ headerShown: true, title: t('tabs.stats') }}
      />
    </Stack>
  );
}
