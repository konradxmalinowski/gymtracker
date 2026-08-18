import { View } from 'react-native';

import { Text } from '@/components/ui';
import { radius, space } from '@/theme/tokens';

export interface ChartLegendSeries {
  label: string;
  color: string;
}

export interface ChartLegendProps {
  series: readonly ChartLegendSeries[];
  testID?: string | undefined;
}

/** ADR-0010's `ChartLegend` adapter - a wrapped row of color-swatch + label pairs. */
export function ChartLegend({ series, testID }: ChartLegendProps) {
  return (
    <View
      testID={testID}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[4] }}
      accessibilityRole="none"
    >
      {series.map((entry) => (
        <View
          key={entry.label}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: radius.full,
              backgroundColor: entry.color,
            }}
          />
          <Text variant="footnote" color="secondary">
            {entry.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
