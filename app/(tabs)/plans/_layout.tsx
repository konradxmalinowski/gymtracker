import { Stack } from 'expo-router';

import { t } from '@/i18n';
import { color } from '@/theme/tokens';

/**
 * Nested Stack for the Plans tab (ROADMAP.md P5: list -> detail -> day).
 * `app/(tabs)/_layout.tsx` registers this whole directory as
 * `<Tabs.Screen name="plans" .../>` (a *folder* reference, not
 * `"plans/index"`) for exactly the reason `app/(tabs)/exercises/_layout.tsx`
 * documents for its own P4 restructure: pointing a `Tabs.Screen` directly at
 * a leaf file inside a directory that also has its own `_layout.tsx` skips
 * that nested navigator entirely, which would break `router.push()` to a
 * sibling route (`/plans/:planId`, `/plans/:planId/day/:dayId`) within this
 * tab - there would be no Stack present to push onto. With this fix, every
 * screen in this folder shares one Stack, and the bottom tab bar stays
 * visible for all of them, including the pushed detail/day screens, not just
 * the list.
 *
 * The list screen keeps `headerShown: false` (matches every other tab's
 * index screen). Detail/day are pushed on top and need a real back
 * affordance beyond an edge swipe, so they turn the header back on - same
 * split as `app/(tabs)/exercises/_layout.tsx`.
 */
export default function PlansLayout() {
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
      {/* No static `title` here - `PlanDetailScreen` renders its own
          `<Stack.Screen options={{ title: <plan name> }} />` once the plan
          loads, the same per-instance dynamic header title pattern
          `ExerciseDetailScreen` establishes in P4. `headerShown: true` still
          has to be set here since that part *is* static. */}
      <Stack.Screen name="[planId]" options={{ headerShown: true, title: t('tabs.plans') }} />
      <Stack.Screen
        name="[planId]/day/[dayId]"
        options={{ headerShown: true, title: t('tabs.plans') }}
      />
    </Stack>
  );
}
