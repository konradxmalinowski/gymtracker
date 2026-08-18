import { View } from 'react-native';
import { Bar, CartesianChart } from 'victory-native';

import { color as tokenColor } from '@/theme/tokens';

import type { SeriesPoint } from './types';

export interface BarChartViewProps {
  data: readonly SeriesPoint[];
  formatX?: ((x: string) => string) | undefined;
  formatY?: ((value: number) => string) | undefined;
  color?: string | undefined;
  testID?: string | undefined;
}

/** ADR-0010's `BarChartView` adapter. `null` values render as zero-height bars (a bar chart has no meaningful "gap," unlike a line). */
export function BarChartView({
  data,
  formatX,
  formatY,
  color = tokenColor.chart[0],
  testID,
}: BarChartViewProps) {
  const chartData = data.map((point) => ({ x: point.x, value: point.value ?? 0 }));

  return (
    <View testID={testID} style={{ height: 200 }}>
      <CartesianChart
        data={chartData}
        xKey="x"
        yKeys={['value']}
        orientation="vertical"
        domainPadding={{ left: 16, right: 16, top: 16, bottom: 8 }}
        axisOptions={{
          labelColor: tokenColor.chartAxis,
          lineColor: tokenColor.chartGrid,
          ...(formatX ? { formatXLabel: formatX } : {}),
          ...(formatY ? { formatYLabel: (label: number) => formatY(label) } : {}),
        }}
      >
        {({ points, chartBounds }) => (
          <Bar
            points={points.value}
            chartBounds={chartBounds}
            color={color}
            roundedCorners={{ topLeft: 4, topRight: 4 }}
          />
        )}
      </CartesianChart>
    </View>
  );
}
