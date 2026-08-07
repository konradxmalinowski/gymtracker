import { Stack } from 'expo-router';

import { color } from '@/theme/tokens';

/**
 * ADR-0007's root-level workout stack: `fullScreenModal`, gestures disabled,
 * sliding up from the bottom - "the workout is a mode the user entered, not
 * a page they browsed to." A single screen (`active.tsx`) today;
 * `workout/summary/[sessionId]` is P9 and deliberately not added here.
 *
 * The Android hardware-back interception ADR-0007 rule 1 also calls for
 * lives in `ActiveWorkoutScreen` itself (via `BackHandler`), not here -
 * `gestureEnabled: false` only covers iOS's edge-swipe gesture; the Android
 * back *button* is a physical-key event a `Stack` layout has no hook for,
 * and the exit choice it triggers needs `sessionService`/the store, which
 * this router-config file has no business holding. This file stays a thin
 * navigation config, per CLAUDE.md's "`app/` never contains screen bodies."
 */
export default function WorkoutLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: 'fullScreenModal',
        gestureEnabled: false,
        animation: 'slide_from_bottom',
        contentStyle: { backgroundColor: color.background },
      }}
    >
      <Stack.Screen name="active" />
    </Stack>
  );
}
