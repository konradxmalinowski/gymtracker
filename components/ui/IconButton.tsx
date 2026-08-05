import type { ReactNode } from 'react';
import { ActivityIndicator, type ViewStyle } from 'react-native';

import { PressScale } from '@/components/gestures/PressScale';
import { color, hitSlop, radius } from '@/theme/tokens';

export type IconButtonSize = 'sm' | 'md' | 'lg';
export type IconButtonVariant = 'default' | 'accent' | 'ghost';

const SIZE_PX: Record<IconButtonSize, number> = { sm: 32, md: 40, lg: 48 };

const VARIANT_STYLE: Record<IconButtonVariant, { background: string; disabledBackground: string }> =
  {
    default: { background: color.surfaceElevated, disabledBackground: color.surface },
    accent: { background: color.accentSubtle, disabledBackground: color.surface },
    ghost: { background: 'transparent', disabledBackground: 'transparent' },
  };

export interface IconButtonProps {
  icon: ReactNode;
  size?: IconButtonSize | undefined;
  variant?: IconButtonVariant | undefined;
  loading?: boolean | undefined;
  disabled?: boolean | undefined;
  /** Required - an icon-only control has no visible label for a screen reader to fall back on. */
  accessibilityLabel: string;
  onPress: () => void;
  testID?: string | undefined;
}

/**
 * An icon-only control is the case where a missing accessibility label is
 * most damaging (nothing else on screen describes what it does), so
 * `accessibilityLabel` is a required prop, not optional - there is no valid
 * way to render this component without one.
 */
export function IconButton({
  icon,
  size = 'md',
  variant = 'default',
  loading = false,
  disabled = false,
  accessibilityLabel,
  onPress,
  testID,
}: IconButtonProps) {
  const isDisabled = disabled || loading;
  const dimension = SIZE_PX[size];
  const variantStyle = VARIANT_STYLE[variant];

  // Visual size can be smaller than 44pt (e.g. `sm` at 32pt); `hitSlop`
  // makes up the difference so the effective touch target still clears the
  // 44x44pt minimum regardless of the chosen visual size.
  const style: ViewStyle = {
    width: dimension,
    height: dimension,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDisabled ? variantStyle.disabledBackground : variantStyle.background,
    opacity: isDisabled ? 0.5 : 1,
  };

  const slop = Math.max(hitSlop.small, (44 - dimension) / 2);

  return (
    <PressScale
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      hitSlop={slop}
      style={style}
      testID={testID}
    >
      {loading ? <ActivityIndicator size="small" color={color.textPrimary} /> : icon}
    </PressScale>
  );
}
