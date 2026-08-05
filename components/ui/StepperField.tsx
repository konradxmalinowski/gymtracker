import { useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';

import { haptics } from '@/services/haptics';
import { t } from '@/i18n';
import { color, hitSlop, radius } from '@/theme/tokens';

import { NumberField, type NumberFieldProps } from './NumberField';
import { Text } from './Text';

const HOLD_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 80;
const ACCELERATE_EVERY_N_TICKS = 10;

export type StepperFieldProps = NumberFieldProps & { step?: number };

/**
 * `NumberField` plus press-and-hold `-`/`+` buttons (ARCHITECTURE.md
 * section 11.7). Acceleration state (`ticksRef`, `stepRef`) and the "what is
 * the current value" read (`valueRef`) all live in refs updated
 * synchronously, not in the `value` prop closed over by the interval
 * callback - a `setInterval` callback created on press-down captures
 * whatever `value` was at that instant, so reading `props.value` directly
 * inside it would replay a stale number on every tick once a step commits
 * and the prop hasn't re-rendered back down yet. Reading `valueRef.current`
 * (updated every render via the effect below) avoids that race.
 */
export function StepperField({ step = 1, min, max, ...numberFieldProps }: StepperFieldProps) {
  const { value, onChange, precision = 0, disabled, accessibilityLabel } = numberFieldProps;

  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimers() {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (repeatIntervalRef.current) {
      clearInterval(repeatIntervalRef.current);
      repeatIntervalRef.current = null;
    }
  }

  useEffect(() => clearTimers, []);

  function commitStep(direction: 1 | -1, magnitude: number): boolean {
    const base = valueRef.current ?? 0;
    let next = base + direction * magnitude;
    if (min !== undefined) {
      next = Math.max(min, next);
    }
    if (max !== undefined) {
      next = Math.min(max, next);
    }
    const rounded = Number(next.toFixed(precision));
    const changed = rounded !== valueRef.current;
    valueRef.current = rounded;
    onChange(rounded);
    haptics.adjust();
    // At the min/max boundary further ticks would be a no-op - stopping the
    // repeat loop there means a held-down button doesn't keep firing haptics
    // and onChange calls once the value can no longer move.
    return changed;
  }

  function startPress(direction: 1 | -1) {
    if (disabled) {
      return;
    }
    commitStep(direction, step);
    holdTimeoutRef.current = setTimeout(() => {
      let magnitude = step;
      let ticks = 0;
      repeatIntervalRef.current = setInterval(() => {
        ticks += 1;
        if (ticks % ACCELERATE_EVERY_N_TICKS === 0) {
          magnitude *= 2;
        }
        const changed = commitStep(direction, magnitude);
        if (!changed) {
          clearTimers();
        }
      }, REPEAT_INTERVAL_MS);
    }, HOLD_DELAY_MS);
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <StepButton
        symbol="−"
        accessibilityLabel={
          t('common.decrease') + (accessibilityLabel ? ` ${accessibilityLabel}` : '')
        }
        disabled={disabled ?? false}
        onPressIn={() => startPress(-1)}
        onPressOut={clearTimers}
      />
      <NumberField {...numberFieldProps} min={min} max={max} />
      <StepButton
        symbol="+"
        accessibilityLabel={
          t('common.increase') + (accessibilityLabel ? ` ${accessibilityLabel}` : '')
        }
        disabled={disabled ?? false}
        onPressIn={() => startPress(1)}
        onPressOut={clearTimers}
      />
    </View>
  );
}

function StepButton({
  symbol,
  accessibilityLabel,
  disabled,
  onPressIn,
  onPressOut,
}: {
  symbol: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
}) {
  return (
    <Pressable
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={hitSlop.default}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? color.surfacePressed : color.surfaceElevated,
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <Text variant="title3" color="primary">
        {symbol}
      </Text>
    </Pressable>
  );
}
