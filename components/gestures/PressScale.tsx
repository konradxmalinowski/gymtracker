/**
 * `react-hooks/immutability` (part of eslint-config-expo's React Compiler
 * ruleset) flags every `sharedValue.value = ...` assignment in this file as
 * if it were a mutation of React state/props. Reanimated's `SharedValue` is
 * a deliberately mutable, ref-like container - `.value =` is its documented
 * API, not an accident the rule is right to catch - and the React Compiler
 * has no model of it. Disabled file-wide rather than line-by-line since
 * every shared-value write below is this same, legitimate pattern.
 */
/* eslint-disable react-hooks/immutability */
import type { PropsWithChildren } from 'react';
import {
  Pressable,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
  type AccessibilityRole,
  type AccessibilityState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { motion } from '@/theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Optional fields are widened with `| undefined` throughout this file (and
// every other `components/ui`/`components/gestures`/`components/feedback`
// props interface) because `tsconfig.json` has `exactOptionalPropertyTypes`
// on: under that flag `foo?: T` means "present with type T, or entirely
// absent" - NOT "present with type T | undefined". Callers routinely forward
// their own optional prop (already typed `T | undefined` after
// destructuring) straight into a child component's same-named prop, which
// only type-checks if the child's declared type explicitly includes
// `undefined`.
export interface PressScaleProps extends PropsWithChildren {
  onPress?: (() => void) | undefined;
  disabled?: boolean | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  scaleTo?: number | undefined;
  accessibilityRole?: AccessibilityRole | undefined;
  accessibilityLabel?: string | undefined;
  accessibilityHint?: string | undefined;
  accessibilityState?: AccessibilityState | undefined;
  /**
   * `accessible`/`accessibilityActions`/`onAccessibilityAction` - a caller
   * (or a wrapper composing this one, e.g. `DraggableList`'s `cloneElement`-
   * based accessibility-action merge) needs these to actually land on the
   * native `Pressable` this component renders, not be silently dropped by a
   * closed prop interface. `PressScale` had none of the three declared here
   * before P5's `DraggableList` accessibility fix shipped - every caller
   * built on it (`Button`, `IconButton`, `Card`, `Chip`, `ListRow`, and every
   * feature row component built on those) was an unreachable dead end for
   * cloned-on accessibility actions until this fix (found by an
   * accessibility review: the mechanism worked in isolation against a bare
   * `<Text>`, which forwards arbitrary props, but not against any real
   * component in the app).
   */
  accessible?: boolean | undefined;
  accessibilityActions?: readonly AccessibilityActionInfo[] | undefined;
  onAccessibilityAction?: ((event: AccessibilityActionEvent) => void) | undefined;
  hitSlop?: number | undefined;
  testID?: string | undefined;
}

/**
 * Wraps `children` in a 0.97-scale spring on press (ARCHITECTURE.md section
 * 11.7), built on `Pressable` rather than a raw Gesture Handler tap - a bare
 * `GestureDetector` never receives VoiceOver/TalkBack's synthetic "activate"
 * event (there is no real touch to recognize), so it would be invisible to
 * screen-reader users despite being fully operable by touch. `Pressable`
 * gets accessibility activation for free; the scale is still driven by a
 * Reanimated shared value/spring, just started from `onPressIn`/`onPressOut`
 * instead of a worklet gesture callback.
 *
 * A bare visual+press wrapper, not a labeled control on its own - it forwards
 * accessibility props but doesn't invent them. Components that compose it
 * (`Button`, `IconButton`, `Card`, `Chip`, `ListRow`) own their own role and
 * label.
 */
export function PressScale({
  children,
  onPress,
  disabled,
  style,
  scaleTo = 0.97,
  accessibilityRole,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  accessible,
  accessibilityActions,
  onAccessibilityAction,
  hitSlop,
  testID,
}: PressScaleProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => {
        scale.value = withSpring(scaleTo, motion.spring.snappy);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.spring.snappy);
      }}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, ...accessibilityState }}
      accessible={accessible}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      hitSlop={hitSlop}
      testID={testID}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
