import { useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';

import { Row } from '@/components/layout';
import { Text } from '@/components/ui';
import type { WorkoutSet } from '@/features/workout-logging';
import { Weight } from '@/domain/Weight';
import { t } from '@/i18n';
import { kv } from '@/services/kv';
import { haptics } from '@/services/haptics';
import { color, hitSlop, radius, space } from '@/theme/tokens';

const HOLD_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 90;

/** FR-12 / ADR-0009's quick-adjust increment set, in display units - kg plates vs. the real lb plate increments, not a mechanical kg->lb conversion of the same numbers. */
const WEIGHT_INCREMENTS: Record<'kg' | 'lb', readonly number[]> = {
  kg: [1.25, 2.5, 5, 10],
  lb: [2.5, 5, 10, 25],
};

export interface QuickAdjustBarProps {
  focusedSet: WorkoutSet | null;
  onAdjustWeight: (nextWeightKg: number) => void;
  onAdjustReps: (nextReps: number) => void;
  testID?: string | undefined;
}

function applyWeightDeltaKg(currentKg: number, deltaDisplay: number, unit: 'kg' | 'lb'): number {
  const currentDisplay =
    unit === 'kg'
      ? Weight.fromKilograms(currentKg).toKilograms()
      : Weight.fromKilograms(currentKg).toPounds();
  const nextDisplay = Math.max(0, currentDisplay + deltaDisplay);
  const nextWeight =
    unit === 'kg' ? Weight.fromKilograms(nextDisplay) : Weight.fromPounds(nextDisplay);
  return Math.max(0, nextWeight.toKilograms());
}

/**
 * Bottom, context-sensitive to `focusedSet` (ARCHITECTURE.md section 10.3):
 * -1/+1 rep and the ADR-0009 weight increments for whichever display unit is
 * active, read synchronously from the `units.weight` MMKV mirror (the same
 * pattern every other render-time unit read in the app uses - see ADR-0008's
 * "why mirror units into MMKV at all"). Renders an inert hint instead of
 * controls when nothing is focused, rather than disabled buttons with
 * nothing to act on.
 */
export function QuickAdjustBar({
  focusedSet,
  onAdjustWeight,
  onAdjustReps,
  testID,
}: QuickAdjustBarProps) {
  const unit = kv.get('units.weight') ?? 'kg';
  const increments = WEIGHT_INCREMENTS[unit];

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: color.border,
        paddingHorizontal: space[4],
        paddingVertical: space[2],
        backgroundColor: color.backgroundElevated,
      }}
      testID={testID}
    >
      {!focusedSet ? (
        <Text variant="footnote" color="tertiary" align="center">
          {t('workoutLogging.quickAdjust.noFocusMessage')}
        </Text>
      ) : (
        <Row justify="space-between" align="center" gap={4}>
          <Row gap={2} align="center">
            <Text variant="footnote" color="secondary">
              {t('workoutLogging.quickAdjust.repsLabel')}
            </Text>
            <AdjustButton
              symbol="−"
              accessibilityLabel={`${t('common.decrease')} ${t('workoutLogging.quickAdjust.repsLabel')}`}
              onTick={() => onAdjustReps(Math.max(0, (focusedSet.reps ?? 0) - 1))}
              testID={testID ? `${testID}-rep-minus` : undefined}
            />
            <AdjustButton
              symbol="+"
              accessibilityLabel={`${t('common.increase')} ${t('workoutLogging.quickAdjust.repsLabel')}`}
              onTick={() => onAdjustReps((focusedSet.reps ?? 0) + 1)}
              testID={testID ? `${testID}-rep-plus` : undefined}
            />
          </Row>

          <Row gap={2} align="center" wrap>
            {increments.map((increment) => (
              <Row key={increment} gap={1}>
                <AdjustButton
                  symbol={`-${increment}`}
                  accessibilityLabel={`${t('common.decrease')} ${t('workoutLogging.quickAdjust.weightLabel')} ${increment} ${unit}`}
                  onTick={() =>
                    onAdjustWeight(applyWeightDeltaKg(focusedSet.weightKg ?? 0, -increment, unit))
                  }
                  compact
                  testID={testID ? `${testID}-weight-minus-${increment}` : undefined}
                />
                <AdjustButton
                  symbol={`+${increment}`}
                  accessibilityLabel={`${t('common.increase')} ${t('workoutLogging.quickAdjust.weightLabel')} ${increment} ${unit}`}
                  onTick={() =>
                    onAdjustWeight(applyWeightDeltaKg(focusedSet.weightKg ?? 0, increment, unit))
                  }
                  compact
                  testID={testID ? `${testID}-weight-plus-${increment}` : undefined}
                />
              </Row>
            ))}
          </Row>
        </Row>
      )}
    </View>
  );
}

/** Press-and-hold repeating button - same timing/acceleration shape as `StepperField`'s internal `StepButton`, duplicated rather than shared because this one fires an arbitrary caller-supplied tick rather than a fixed numeric step. */
function AdjustButton({
  symbol,
  accessibilityLabel,
  onTick,
  compact = false,
  testID,
}: {
  symbol: string;
  accessibilityLabel: string;
  onTick: () => void;
  compact?: boolean;
  testID?: string | undefined;
}) {
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

  function fire() {
    onTick();
    haptics.adjust();
  }

  function startPress() {
    fire();
    holdTimeoutRef.current = setTimeout(() => {
      repeatIntervalRef.current = setInterval(fire, REPEAT_INTERVAL_MS);
    }, HOLD_DELAY_MS);
  }

  return (
    <Pressable
      onPressIn={startPress}
      onPressOut={clearTimers}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={hitSlop.small}
      testID={testID}
      style={({ pressed }) => ({
        minWidth: compact ? 44 : 36,
        height: 36,
        paddingHorizontal: space[2],
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? color.surfacePressed : color.surfaceElevated,
      })}
    >
      <Text variant="footnote" color="primary" numberOfLines={1}>
        {symbol}
      </Text>
    </Pressable>
  );
}
