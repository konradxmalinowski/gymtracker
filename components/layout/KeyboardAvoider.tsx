import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, type StyleProp, type ViewStyle } from 'react-native';

export interface KeyboardAvoiderProps extends PropsWithChildren {
  style?: StyleProp<ViewStyle> | undefined;
  /** Extra offset (e.g. a sticky header's height) added on top of the safe-area inset. */
  offset?: number | undefined;
}

/**
 * `behavior` differs by platform because that's what actually works, not a
 * style preference: `padding` is the reliable option on iOS (`height`
 * fights the safe area); Android's default resize-on-focus behavior already
 * handles the keyboard, so no `behavior` is set there to avoid double-
 * compensating.
 */
export function KeyboardAvoider({ style, offset = 0, children }: KeyboardAvoiderProps) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={offset}
      style={[{ flex: 1 }, style]}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
