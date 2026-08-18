import { View } from 'react-native';
import { CartesianChart, Line } from 'victory-native';

import { color as tokenColor } from '@/theme/tokens';

import type { SeriesPoint } from './types';

export interface LineChartViewProps {
  data: readonly SeriesPoint[];
  formatX?: ((x: string) => string) | undefined;
  formatY?: ((value: number) => string) | undefined;
  color?: string | undefined;
  testID?: string | undefined;
}

/**
 * ADR-0010's `LineChartView` adapter - the only file in the app allowed to
 * import `CartesianChart`/`Line` directly. `SeriesPoint.value === null`
 * renders as a real gap (`connectMissingData: false`), not a dip to zero -
 * matches the domain layer's own "null means no eligible data" convention
 * (`exerciseProgressionReducer.ts`). No explicit `font` is passed to
 * `axisOptions` - Victory Native XL falls back to its own bundled default
 * Skia font when omitted, which is sufficient for this app's tick labels;
 * a custom typeface is out of scope here.
 */
export function LineChartView({
  data,
  formatX,
  formatY,
  color = tokenColor.chart[0],
  testID,
}: LineChartViewProps) {
  const chartData = data.map((point) => ({ x: point.x, value: point.value }));

  return (
    <View testID={testID} style={{ height: 200 }}>
      <CartesianChart
        data={chartData}
        xKey="x"
        yKeys={['value']}
        orientation="vertical"
        domainPadding={{ left: 12, right: 12, top: 16, bottom: 8 }}
        axisOptions={{
          labelColor: tokenColor.chartAxis,
          lineColor: tokenColor.chartGrid,
          ...(formatX ? { formatXLabel: formatX } : {}),
          ...(formatY
            ? { formatYLabel: (label: number | null) => (label === null ? '' : formatY(label)) }
            : {}),
        }}
      >
        {({ points }) => (
          <Line
            points={points.value}
            color={color}
            strokeWidth={2}
            curveType="natural"
            connectMissingData={false}
          />
        )}
      </CartesianChart>
    </View>
  );
}
