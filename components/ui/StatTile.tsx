import type { ReactNode } from 'react';
import { View } from 'react-native';

import { PressScale } from '@/components/gestures/PressScale';
import { color, radius, space } from '@/theme/tokens';

import { Text } from './Text';

export type StatTileTrend = 'up' | 'down' | 'flat';

const TREND_GLYPH: Record<StatTileTrend, string> = { up: '▲', down: '▼', flat: '▬' };
const TREND_COLOR: Record<StatTileTrend, 'success' | 'danger' | 'tertiary'> = {
  up: 'success',
  down: 'danger',
  flat: 'tertiary',
};

export interface StatTileProps {
  label: string;
  value: string | number;
  unit?: string | undefined;
  delta?: string | undefined;
  trend?: StatTileTrend | undefined;
  icon?: ReactNode | undefined;
  onPress?: (() => void) | undefined;
  testID?: string | undefined;
}

/**
 * `value` always renders through the `numericLarge` `<Text>` variant, so
 * tabular-nums applies here the same way it does in the rest timer and set
 * rows (ARCHITECTURE.md section 11.4) - a stat tile is exactly the kind of
 * number that jitters/misaligns without it.
 */
export function StatTile({
  label,
  value,
  unit,
  delta,
  trend,
  icon,
  onPress,
  testID,
}: StatTileProps) {
  const content = (
    <View
      style={{
        backgroundColor: color.surface,
        borderRadius: radius.xl,
        padding: space[4],
        gap: space[1],
        minWidth: 120,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="label" color="secondary" numberOfLines={1}>
          {label}
        </Text>
        {icon}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space['0.5'] }}>
        <Text variant="numericLarge" color="primary">
          {value}
        </Text>
        {unit ? (
          <Text variant="footnote" color="tertiary">
            {unit}
          </Text>
        ) : null}
      </View>
      {delta ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['0.5'] }}>
          {trend ? (
            <Text
              variant="caption"
              color={TREND_COLOR[trend]}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              {TREND_GLYPH[trend]}
            </Text>
          ) : null}
          <Text variant="caption" color={trend ? TREND_COLOR[trend] : 'tertiary'}>
            {delta}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const accessibilityLabel = [label, `${value}${unit ? ` ${unit}` : ''}`, delta]
    .filter(Boolean)
    .join(', ');

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {content}
    </PressScale>
  );
}
