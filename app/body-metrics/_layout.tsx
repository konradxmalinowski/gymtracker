import { Stack } from 'expo-router';

import { t } from '@/i18n';
import { color } from '@/theme/tokens';

/**
 * P13's own root-level Stack (`app/body-metrics/`, outside `(tabs)`) - not
 * one of the 5 tabs, reached from `ProfileScreen`'s "Body measurements" row
 * the same way `app/history/[sessionId].tsx`/`app/profile/*` are reached,
 * but given a dedicated `_layout.tsx` (unlike those single-screen entry
 * points) since this flow has materially more screens: list, per-metric
 * history, photo grid, photo detail, compare. Same restructure shape
 * `app/(tabs)/exercises/_layout.tsx` uses for its own list -> detail ->
 * create/edit stack, just outside the tab bar.
 *
 * `index`/`photos/index` keep static titles here; `[metric]` overrides its
 * title dynamically once the route param resolves (`MetricHistoryScreen`'s
 * own `<Stack.Screen>`), same per-instance-options pattern
 * `ExercisesLayout`'s `[id]` entry already establishes.
 */
export default function BodyMetricsLayout() {
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
      <Stack.Screen name="index" options={{ title: t('bodyMetrics.list.screenTitle') }} />
      <Stack.Screen name="[metric]" options={{ title: t('bodyMetrics.list.screenTitle') }} />
      <Stack.Screen name="photos/index" options={{ title: t('bodyMetrics.photos.screenTitle') }} />
      <Stack.Screen
        name="photos/[photoId]"
        options={{ title: t('bodyMetrics.photoDetail.screenTitle') }}
      />
      <Stack.Screen
        name="photos/compare"
        options={{ title: t('bodyMetrics.compare.screenTitle') }}
      />
    </Stack>
  );
}
