import { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { color, hitSlop, motion, radius } from '@/theme/tokens';

import { Text } from './Text';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
 *
 * This is the set-completion checkbox on the app's busiest screen
 * (`SetRow`), so `accessibilityState.checked` flips the instant `value`
 * changes - ARCHITECTURE.md section 11.5 bans anything on that critical
 * path from delaying the state change. `progress`/`checkScale` only drive a
 * fill crossfade and a checkmark pop that play *over* the already-committed
 * change, never gate it (P15 polish pass - this control previously snapped
 * between states with no transition at all).
 */
export function Checkbox({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  testID,
}: CheckboxProps) {
  const progress = useSharedValue(value ? 1 : 0);
  const checkScale = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration: motion.duration.fast });
    checkScale.value = value
      ? withSpring(1, motion.spring.snappy)
      : withTiming(0, { duration: motion.duration.fast });
  }, [value, progress, checkScale]);

  const fillColor = disabled ? color.textDisabled : color.accent;

  const containerStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ['transparent', fillColor]),
    borderColor: interpolateColor(progress.value, [0, 1], [color.borderStrong, fillColor]),
    borderWidth: interpolate(progress.value, [0, 1], [1, 0]),
  }));

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, checked: value }}
      hitSlop={hitSlop.default}
      style={[
        {
          width: 24,
          height: 24,
          borderRadius: radius.sm,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled && !value ? 0.5 : 1,
        },
        containerStyle,
      ]}
      testID={testID}
    >
      <Animated.View style={checkStyle}>
        <Text
          variant="caption"
          color="inverse"
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {'✓'}
        </Text>
      </Animated.View>
    </AnimatedPressable>
  );
}
