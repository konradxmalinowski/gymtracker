import { View } from 'react-native';

import { Text } from '@/components/ui';
import { color, radius, space } from '@/theme/tokens';

import type { CategorySlice } from './types';

export interface StackedBarChartViewProps {
  slices: readonly CategorySlice[];
  formatValue?: ((value: number) => string) | undefined;
  testID?: string | undefined;
}

/**
 * ADR-0010's `StackedBarChartView` adapter, for muscle-group volume - custom
 * `View`-drawn proportional-width rows, not `victory-native`'s `StackedBar`
 * (this phase's plan decision 7: `StackedBar`'s stacked keys are a static
 * generic type parameter, and a runtime-variable category list like
 * `body_part` slices doesn't fit that shape without an `any` escape hatch).
 * `HeatmapView` already sets the precedent that not every adapter file needs
 * to touch Victory internals, only isolate them.
 */
export function StackedBarChartView({ slices, formatValue, testID }: StackedBarChartViewProps) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <View testID={testID} style={{ gap: space[3] }}>
      {slices.map((slice) => {
        const share = total === 0 ? 0 : slice.value / total;
        return (
          <View key={slice.label} style={{ gap: space[1] }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="footnote" color="primary">
                {slice.label}
              </Text>
              <Text variant="footnote" color="secondary">
                {formatValue ? formatValue(slice.value) : String(slice.value)}
              </Text>
            </View>
            <View
              style={{
                height: 8,
                borderRadius: radius.full,
                backgroundColor: color.chartGrid,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: '100%',
                  width: `${Math.max(share * 100, share > 0 ? 2 : 0)}%`,
                  borderRadius: radius.full,
                  backgroundColor: slice.color,
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}
