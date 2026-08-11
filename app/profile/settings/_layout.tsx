import { Stack } from 'expo-router';

import { t } from '@/i18n';
import { color } from '@/theme/tokens';

/**
 * The root `<Stack>` in `app/_layout.tsx` sets `headerShown: false` globally
 * (matches the tab bar and onboarding, neither of which need a native
 * header). These three screens are pushed from the Profile tab with no tab
 * bar visible, so they need their own visible header - back navigation has
 * to be reachable by more than an edge swipe.
 */
export default function ProfileSettingsLayout() {
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
      <Stack.Screen name="index" options={{ title: t('profileSettings.title') }} />
      <Stack.Screen name="units" options={{ title: t('unitsSettings.title') }} />
      <Stack.Screen name="timers" options={{ title: t('restTimer.timerSettings.title') }} />
      <Stack.Screen name="about" options={{ title: t('about.title') }} />
    </Stack>
  );
}
