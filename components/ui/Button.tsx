import type { ReactNode } from 'react';
import { ActivityIndicator, View, type ViewStyle } from 'react-native';

import { PressScale } from '@/components/gestures/PressScale';
import { color, hitSlop, radius, space } from '@/theme/tokens';

import { Text, type TextColor } from './Text';

// Mirrors Text.tsx's color map for the one case (the loading spinner) that
// needs a raw hex value instead of going through <Text>.
const TEXT_COLOR_HEX: Record<TextColor, string> = {
  primary: color.textPrimary,
  secondary: color.textSecondary,
  tertiary: color.textTertiary,
  accent: color.accentText,
  success: color.success,
  danger: color.danger,
  inverse: color.textInverse,
};

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface VariantStyle {
  background: string;
  disabledBackground: string;
  border?: string | undefined;
  disabledBorder?: string | undefined;
  textColor: 'inverse' | 'primary' | 'accent' | 'danger';
  disabledTextColor: 'tertiary';
}

// Disabled states use a distinct background *and* text color combination per
// variant, not a global opacity dim - on a near-black theme a 50%-opacity
// blue button and a full-opacity blue button read too close together to
// reliably signal "you can't press this" (an edge case this phase is
// expected to handle explicitly, demonstrated in the gallery's state
// matrix).
const VARIANT_STYLE: Record<ButtonVariant, VariantStyle> = {
  primary: {
    background: color.accent,
    disabledBackground: color.surfaceElevated,
    textColor: 'inverse',
    disabledTextColor: 'tertiary',
  },
  secondary: {
    background: color.surfaceElevated,
    disabledBackground: color.surface,
    border: color.border,
    disabledBorder: color.border,
    textColor: 'primary',
    disabledTextColor: 'tertiary',
  },
  ghost: {
    background: 'transparent',
    disabledBackground: 'transparent',
    textColor: 'accent',
    disabledTextColor: 'tertiary',
  },
  destructive: {
    background: color.dangerSubtle,
    disabledBackground: 'transparent',
    textColor: 'danger',
    disabledTextColor: 'tertiary',
  },
};

const SIZE_STYLE: Record<
  ButtonSize,
  { height: number; paddingHorizontal: number; textVariant: 'callout' | 'body' }
> = {
  sm: { height: 36, paddingHorizontal: space[3], textVariant: 'callout' },
  md: { height: 44, paddingHorizontal: space[4], textVariant: 'body' },
  lg: { height: 52, paddingHorizontal: space[5], textVariant: 'body' },
};

export interface ButtonProps {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  label: string;
  icon?: ReactNode | undefined;
  iconPosition?: 'leading' | 'trailing' | undefined;
  loading?: boolean | undefined;
  disabled?: boolean | undefined;
  fullWidth?: boolean | undefined;
  onPress: () => void;
  testID?: string | undefined;
}

export function Button({
  variant = 'primary',
  size = 'md',
  label,
  icon,
  iconPosition = 'leading',
  loading = false,
  disabled = false,
  fullWidth = false,
  onPress,
  testID,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const variantStyle = VARIANT_STYLE[variant];
  const sizeStyle = SIZE_STYLE[size];

  const containerStyle: ViewStyle = {
    height: sizeStyle.height,
    paddingHorizontal: sizeStyle.paddingHorizontal,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    backgroundColor: isDisabled ? variantStyle.disabledBackground : variantStyle.background,
    ...(fullWidth ? { alignSelf: 'stretch' as const } : { alignSelf: 'flex-start' as const }),
    ...((isDisabled ? variantStyle.disabledBorder : variantStyle.border)
      ? {
          borderWidth: 1,
          borderColor: isDisabled ? variantStyle.disabledBorder : variantStyle.border,
        }
      : null),
  };

  const textColor = isDisabled ? variantStyle.disabledTextColor : variantStyle.textColor;

  return (
    <PressScale
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      hitSlop={hitSlop.default}
      style={containerStyle}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator color={TEXT_COLOR_HEX[textColor]} />
      ) : (
        <>
          {icon && iconPosition === 'leading' ? <View>{icon}</View> : null}
          <Text variant={sizeStyle.textVariant} color={textColor} numberOfLines={1}>
            {label}
          </Text>
          {icon && iconPosition === 'trailing' ? <View>{icon}</View> : null}
        </>
      )}
    </PressScale>
  );
}
