import { Stack } from 'expo-router';

import { color } from '@/theme/tokens';

/**
 * First `(modals)` route group in the app (ARCHITECTURE.md section 9's
 * folder tree, section 10.2's nav rule: "modals are used only for pickers
 * and single-purpose entry"). A plain `Stack` with `presentation: 'modal'`
 * on every screen it contains - the standard Expo Router pattern for a
 * route group that should always present as a modal regardless of which
 * screen inside it is pushed to first.
 */
export default function ModalsLayout() {
  return (
    <Stack
      screenOptions={{
        presentation: 'modal',
        headerShown: true,
        headerStyle: { backgroundColor: color.background },
        headerTintColor: color.textPrimary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: color.background },
      }}
    />
  );
}
