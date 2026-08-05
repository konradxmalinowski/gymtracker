import type { PropsWithChildren } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { PressScale } from '@/components/gestures/PressScale';
import { color, elevation, radius, space } from '@/theme/tokens';

export type CardVariant = 'default' | 'elevated' | 'outlined';

const VARIANT_STYLE: Record<CardVariant, ViewStyle> = {
  default: { backgroundColor: color.surface },
  elevated: { backgroundColor: color.surfaceElevated, ...elevation.card },
  outlined: {
    backgroundColor: color.background,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
};

export interface CardProps extends PropsWithChildren {
  variant?: CardVariant | undefined;
  padding?: keyof typeof space | undefined;
  onPress?: (() => void) | undefined;
  disabled?: boolean | undefined;
  accessibilityLabel?: string | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  testID?: string | undefined;
}

/**
 * Cards default to `radius.xl` (20) per ARCHITECTURE.md section 11.3's
 * "large rounded corners" calibration. When `onPress` is provided the whole
 * card becomes a `button`-role control via `PressScale`; without it, it's a
 * plain (non-interactive) container and gets no accessibility role, so
 * screen readers don't announce it as "tappable" when it isn't.
 */
export function Card({
  variant = 'default',
  padding = 4,
  onPress,
  disabled,
  accessibilityLabel,
  style,
  testID,
  children,
}: CardProps) {
  const boxStyle: StyleProp<ViewStyle> = [
    { borderRadius: radius.xl, padding: space[padding] },
    VARIANT_STYLE[variant],
    disabled ? { opacity: 0.5 } : null,
    style,
  ];

  if (onPress) {
    return (
      <PressScale
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={boxStyle}
        testID={testID}
      >
        {children}
      </PressScale>
    );
  }

  return (
    <View style={boxStyle} testID={testID}>
      {children}
    </View>
  );
}
