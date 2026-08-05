import { Pressable } from 'react-native';

import { color, hitSlop, radius } from '@/theme/tokens';

import { Text } from './Text';

export interface CheckboxProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean | undefined;
  accessibilityLabel: string;
  testID?: string | undefined;
}

/**
 * RN core has no built-in cross-platform checkbox, so this is a hand-built
 * token-styled control rather than a wrapper (unlike `Switch`/`Slider`).
 * Disabled state uses both a dimmer border/fill *and* a distinct
 * (non-accent) checked color so it doesn't read as "just an unusual accent
 * shade" next to the enabled version.
 */
export function Checkbox({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  testID,
}: CheckboxProps) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, checked: value }}
      hitSlop={hitSlop.default}
      style={{
        width: 24,
        height: 24,
        borderRadius: radius.sm,
        borderWidth: value ? 0 : 1,
        borderColor: color.borderStrong,
        backgroundColor: value ? (disabled ? color.textDisabled : color.accent) : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled && !value ? 0.5 : 1,
      }}
      testID={testID}
    >
      {value ? (
        <Text
          variant="caption"
          color="inverse"
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {'✓'}
        </Text>
      ) : null}
    </Pressable>
  );
}
