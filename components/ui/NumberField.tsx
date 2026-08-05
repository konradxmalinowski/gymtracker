import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { color, font, radius, space } from '@/theme/tokens';

import { Text } from './Text';

export interface NumberFieldProps {
  value: number | null;
  onChange: (value: number | null) => void;
  step?: number | undefined;
  min?: number | undefined;
  max?: number | undefined;
  precision?: number | undefined;
  unitSuffix?: string | undefined;
  selectOnFocus?: boolean | undefined;
  disabled?: boolean | undefined;
  accessibilityLabel: string;
  testID?: string | undefined;
}

function clamp(raw: number, min: number | undefined, max: number | undefined): number {
  let result = raw;
  if (min !== undefined) {
    result = Math.max(min, result);
  }
  if (max !== undefined) {
    result = Math.min(max, result);
  }
  return result;
}

function formatValue(value: number | null, precision: number): string {
  if (value === null) {
    return '';
  }
  return value.toFixed(precision);
}

/**
 * A numeric-only text field. `value`/`onChange` are the source of truth;
 * intermediate keystrokes (e.g. a lone `"-"` or a trailing `"."`) are kept
 * in local text state and only resolved - clamped to `[min, max]`, rounded
 * to `precision` - on blur, so a boundary value (typing "150" for a `max:
 * 100` field) doesn't get clamped mid-keystroke and fight the user's typing.
 * A fully cleared field commits `null`, not `0` - "no value entered" and
 * "zero" are different states for a weight/rep field.
 */
export function NumberField({
  value,
  onChange,
  min,
  max,
  precision = 0,
  unitSuffix,
  selectOnFocus = false,
  disabled = false,
  accessibilityLabel,
  testID,
}: NumberFieldProps) {
  const [text, setText] = useState(() => formatValue(value, precision));
  const [focused, setFocused] = useState(false);
  // Mirrors `value` so the render below can detect "the prop changed since
  // our last render" and re-derive `text` - the React-recommended way to
  // adjust state in response to a prop change is doing it during render,
  // not in a `useEffect` (an effect here would mean an extra render pass on
  // every external value change, e.g. every quick-adjust +/- tap).
  const [lastSyncedValue, setLastSyncedValue] = useState(value);

  if (!focused && value !== lastSyncedValue) {
    setLastSyncedValue(value);
    setText(formatValue(value, precision));
  }

  const allowedPattern = precision > 0 ? /^-?\d*\.?\d*$/ : /^-?\d*$/;

  function handleChangeText(next: string) {
    if (next !== '' && !allowedPattern.test(next)) {
      return;
    }
    setText(next);
    if (next === '' || next === '-' || next === '.') {
      onChange(null);
      return;
    }
    const parsed = Number(next);
    if (!Number.isNaN(parsed)) {
      onChange(parsed);
    }
  }

  function handleBlur() {
    setFocused(false);
    if (text === '' || text === '-' || text === '.') {
      setText('');
      onChange(null);
      return;
    }
    const parsed = Number(text);
    if (Number.isNaN(parsed)) {
      setText(formatValue(value, precision));
      return;
    }
    const clamped = clamp(parsed, min, max);
    const rounded = Number(clamped.toFixed(precision));
    setText(formatValue(rounded, precision));
    onChange(rounded);
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[1],
        borderWidth: 1,
        borderColor: focused ? color.accent : color.border,
        borderRadius: radius.md,
        paddingHorizontal: space[3],
        height: 48,
        minWidth: 72,
        backgroundColor: disabled ? color.surface : color.surfaceElevated,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <TextInput
        value={text}
        onChangeText={handleChangeText}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        editable={!disabled}
        keyboardType={precision > 0 ? 'decimal-pad' : 'number-pad'}
        selectTextOnFocus={selectOnFocus}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        style={{
          flex: 1,
          textAlign: 'right',
          fontSize: font.size.body,
          fontFamily: font.family.sans,
          fontVariant: ['tabular-nums'],
          color: disabled ? color.textDisabled : color.textPrimary,
        }}
        testID={testID}
      />
      {unitSuffix ? (
        <Text
          variant="footnote"
          color="tertiary"
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {unitSuffix}
        </Text>
      ) : null}
    </View>
  );
}
