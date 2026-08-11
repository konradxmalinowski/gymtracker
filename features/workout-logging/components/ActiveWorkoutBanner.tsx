import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Row } from '@/components/layout';
import { Text } from '@/components/ui';
import { PressScale } from '@/components/gestures/PressScale';
import { formatRestSeconds, useRestTimerTick } from '@/features/rest-timer';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useContainer } from '@/services/container';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { selectRemainingSeconds, useRestTimerStore } from '@/stores/restTimerStore';
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
 * above the tab bar, showing elapsed time and rest countdown." The rest
 * countdown half is P7's addition - a compact `m:ss` next to the elapsed
 * time, visible only while a timer is running, reusing the very deadline
 * `ActiveWorkoutScreen`'s own `RestTimerBar` reads (`restTimerStore` is a
 * single, session-wide value, not one instance per screen). Visible whenever
 * `activeWorkoutStore` holds a session and the current route is not
 * `workout/active` itself (i.e. the user minimized). Tapping it returns to
 * the workout. Reads the store through a selector (ADR-0008 rule 5), so a
 * set completing elsewhere never re-renders this banner beyond its own
 * second-by-second tick.
 *
 * `useRestTimerTick(clock)` is mounted here rather than assuming
 * `ActiveWorkoutScreen`'s own instance is still driving it - the two are
 * never mounted at the same time (`workout/active` is a root-level route
 * outside `(tabs)`, so this banner is unmounted whenever that screen is on
 * screen), so whichever of the two is currently visible has to own ticking
 * for itself.
 */
export function ActiveWorkoutBanner() {
  const { clock } = useContainer();
  const session = useActiveWorkoutStore((state) => state.session);
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(() => clock.now());

  useRestTimerTick(clock);
  const restTimerDeadlineAt = useRestTimerStore((state) => state.deadlineAt);
  const restTimerTotalSeconds = useRestTimerStore((state) => state.totalSeconds);
  const restTimerNow = useRestTimerStore((state) => state.now);

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
  // `restTimerStore`'s own exported formula (code review finding, P7 pass 3
  // follow-up) - `RestTimerBar.tsx` reads the same selector rather than
  // each reimplementing the clamp/rounding math inline.
  const restRemainingSeconds =
    restTimerDeadlineAt === null
      ? null
      : selectRemainingSeconds({
          deadlineAt: restTimerDeadlineAt,
          totalSeconds: restTimerTotalSeconds,
          now: restTimerNow,
        });

  const accessibilityLabel =
    restRemainingSeconds === null
      ? t('workoutLogging.banner.accessibilityLabelTemplate', { title: session.title, elapsed })
      : t('workoutLogging.banner.accessibilityLabelWithRestTemplate', {
          title: session.title,
          elapsed,
          rest: formatRestSeconds(restRemainingSeconds),
        });

  return (
    <PressScale
      onPress={() => router.push(routes.workout.active())}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
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
        <Row gap={2} align="center">
          {restRemainingSeconds !== null ? (
            <View testID="active-workout-banner-rest">
              <Row gap={1} align="center">
                <Ionicons name="time-outline" size={16} color={color.textInverse} />
                <Text variant="numeric" color="inverse">
                  {formatRestSeconds(restRemainingSeconds)}
                </Text>
              </Row>
            </View>
          ) : null}
          <Text variant="numeric" color="inverse">
            {elapsed}
          </Text>
        </Row>
      </Row>
    </PressScale>
  );
}
