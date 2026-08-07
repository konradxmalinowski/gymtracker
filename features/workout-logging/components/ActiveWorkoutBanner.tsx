import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Row } from '@/components/layout';
import { Text } from '@/components/ui';
import { PressScale } from '@/components/gestures/PressScale';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useContainer } from '@/services/container';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { color, radius, space } from '@/theme/tokens';

import { formatElapsedSeconds } from './formatElapsed';

const TICK_MS = 1000;

/**
 * Platform default bottom-tab-bar content height (iOS: 49pt; Android
 * Material default: 56dp). `app/(tabs)/_layout.tsx` never overrides
 * `tabBarStyle.height`, so these are the real rendered heights - not an
 * arbitrary guess. A pixel-exact anchor would normally come from
 * `useBottomTabBarHeight()` (`@react-navigation/bottom-tabs`), but that
 * package is not an installed dependency here - Expo Router vendors its own
 * internal copy under `expo-router/build/react-navigation/*`, which is not a
 * public import surface to build on - and adding a new dependency for one
 * banner's positioning is out of proportion to the problem. `insets.bottom`
 * (the safe-area inset the tab bar itself also sits above) is added on top.
 */
const TAB_BAR_CONTENT_HEIGHT = Platform.select({ ios: 49, android: 56, default: 56 });

/**
 * ARCHITECTURE.md section 10.2: "a persistent `ActiveWorkoutBanner` docked
 * above the tab bar, showing elapsed time and rest countdown" (the rest
 * countdown half is P7 - nothing here renders one). Visible whenever
 * `activeWorkoutStore` holds a session and the current route is not
 * `workout/active` itself (i.e. the user minimized). Tapping it returns to
 * the workout. Reads the store through a selector (ADR-0008 rule 5), so a
 * set completing elsewhere never re-renders this banner beyond its own
 * second-by-second tick.
 */
export function ActiveWorkoutBanner() {
  const { clock } = useContainer();
  const session = useActiveWorkoutStore((state) => state.session);
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(() => clock.now());

  useEffect(() => {
    if (!session) {
      return;
    }
    const interval = setInterval(() => setNow(clock.now()), TICK_MS);
    return () => clearInterval(interval);
  }, [clock, session]);

  if (!session || pathname === '/workout/active') {
    return null;
  }

  const elapsed = formatElapsedSeconds(session.startedAt, session.pausedMs, now);

  return (
    <PressScale
      onPress={() => router.push(routes.workout.active())}
      accessibilityRole="button"
      accessibilityLabel={t('workoutLogging.banner.accessibilityLabelTemplate', {
        title: session.title,
        elapsed,
      })}
      style={{
        position: 'absolute',
        left: space[3],
        right: space[3],
        bottom: insets.bottom + TAB_BAR_CONTENT_HEIGHT + space[2],
        paddingHorizontal: space[4],
        paddingVertical: space[3],
        borderRadius: radius.lg,
        backgroundColor: color.accent,
      }}
      testID="active-workout-banner"
    >
      <Row justify="space-between" align="center">
        <Row gap={2} align="center" style={{ flex: 1 }}>
          <Ionicons name="barbell" size={18} color={color.textInverse} />
          <Text variant="bodyMedium" color="inverse" numberOfLines={1}>
            {session.title}
          </Text>
        </Row>
        <Text variant="numeric" color="inverse">
          {elapsed}
        </Text>
      </Row>
    </PressScale>
  );
}
