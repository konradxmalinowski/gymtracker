import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { color as colorTokens } from '@/theme/tokens';

export interface ProgressRingProps {
  /** 0..1, clamped. */
  progress: number;
  size: number;
  strokeWidth: number;
  color?: string | undefined;
  trackColor?: string | undefined;
  children?: ReactNode | undefined;
  testID?: string | undefined;
}

/**
 * Static SVG ring (no Reanimated shared-value animation on the stroke) -
 * `progress` re-renders are cheap and infrequent for this component's known
 * call sites (rest-timer ring, workout completion ring), so an
 * `useAnimatedProps`-driven Skia/SVG loop would be complexity this phase
 * doesn't need yet. `accessibilityRole="progressbar"` with `now`/`min`/`max`
 * gives screen readers a real percentage instead of just an unlabeled shape.
 */
export function ProgressRing({
  progress,
  size,
  strokeWidth,
  color = colorTokens.accent,
  trackColor = colorTokens.surfaceElevated,
  children,
  testID,
}: ProgressRingProps) {
  const clamped = Math.min(1, Math.max(0, progress));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped);

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      testID={testID}
    >
      <Svg
        width={size}
        height={size}
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </Svg>
      {children}
    </View>
  );
}
