import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

import { color, radius as radiusTokens } from '@/theme/tokens';

export interface SkeletonProps {
  width: number | `${number}%`;
  height: number;
  radius?: keyof typeof radiusTokens | undefined;
  testID?: string | undefined;
}

/**
 * A shimmering placeholder for known-shape loading content - never a raw
 * spinner for content whose layout is already known (CLAUDE.md's "three
 * required states" rule). The shimmer is a looping opacity pulse driven by
 * a Reanimated shared value/worklet, not a `setInterval` + `useState` loop.
 * Hidden from screen readers entirely: a loading skeleton has no meaningful
 * content to announce, and the loading state itself is communicated at the
 * screen level (e.g. an `accessibilityLiveRegion` "Loading" announcement
 * from the containing view), not per-skeleton.
 */
export function Skeleton({ width, height, radius = 'sm', testID }: SkeletonProps) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
      style={[
        {
          width,
          height,
          borderRadius: radiusTokens[radius],
          backgroundColor: color.surfaceElevated,
        },
        animatedStyle,
      ]}
    />
  );
}
