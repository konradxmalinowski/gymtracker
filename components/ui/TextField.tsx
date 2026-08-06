import { useEffect, useId, useState, type ReactNode } from 'react';
import { AccessibilityInfo, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { color, font, radius, space } from '@/theme/tokens';

import { Text } from './Text';

export interface TextFieldProps {
  label?: string | undefined;
  value: string;
  onChangeText: (value: string) => void;
  onBlur?: (() => void) | undefined;
  error?: string | undefined;
  helper?: string | undefined;
  leading?: ReactNode | undefined;
  trailing?: ReactNode | undefined;
  keyboardType?: KeyboardTypeOptions | undefined;
  maxLength?: number | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  secureTextEntry?: boolean | undefined;
  testID?: string | undefined;
}

/**
 * `error` takes priority over `helper` when both are present - a field
 * never shows stale help text underneath an active error. The error message
 * is wired as `accessibilityLiveRegion="polite"` so an Android TalkBack user
 * hears it as soon as it appears, without having to re-focus the field.
 * `accessibilityLiveRegion` has no iOS equivalent, so the effect below also
 * calls `AccessibilityInfo.announceForAccessibility` directly - otherwise a
 * VoiceOver user typing into this field would never hear a validation error
 * appear (accessibility audit, reports/accessibility-2026-08-05-p1.md,
 * A11Y-002).
 */
export function TextField({
  label,
  value,
  onChangeText,
  onBlur,
  error,
  helper,
  leading,
  trailing,
  keyboardType,
  maxLength,
  placeholder,
  disabled = false,
  secureTextEntry,
  testID,
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const inputId = useId();
  const hasError = Boolean(error);

  useEffect(() => {
    if (error) {
      AccessibilityInfo.announceForAccessibility(error);
    }
  }, [error]);

  const borderColor = hasError ? color.danger : focused ? color.accent : color.border;

  return (
    <View style={{ gap: space['0.5'] }}>
      {label ? (
        <Text variant="label" color="secondary" nativeID={`${inputId}-label`}>
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[2],
          borderWidth: 1,
          borderColor,
          borderRadius: radius.md,
          paddingHorizontal: space[3],
          minHeight: 48,
          backgroundColor: disabled ? color.surface : color.surfaceElevated,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {leading}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          editable={!disabled}
          placeholder={placeholder}
          placeholderTextColor={color.textTertiary}
          keyboardType={keyboardType}
          maxLength={maxLength}
          secureTextEntry={secureTextEntry}
          accessibilityLabel={label}
          accessibilityLabelledBy={label ? `${inputId}-label` : undefined}
          accessibilityState={{ disabled }}
          style={{
            flex: 1,
            fontSize: font.size.body,
            fontFamily: font.family.sans,
            color: disabled ? color.textDisabled : color.textPrimary,
            paddingVertical: space[2],
          }}
          testID={testID}
        />
        {trailing}
      </View>
      {hasError ? (
        <Text
          variant="caption"
          color="danger"
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {error}
        </Text>
      ) : helper ? (
        <Text variant="caption" color="tertiary">
          {helper}
        </Text>
      ) : null}
    </View>
  );
}
