import { render } from '@testing-library/react-native';

import { LineChartView } from '@/components/charts/LineChartView';
import { BarChartView } from '@/components/charts/BarChartView';

const DATA = [
  { x: '2026-08-01', value: 10 },
  { x: '2026-08-02', value: null },
  { x: '2026-08-03', value: 30 },
];

describe('LineChartView', () => {
  it('renders without crashing given a mix of real and null points', async () => {
    const { findByTestId } = await render(<LineChartView data={DATA} testID="line-chart" />);
    expect(await findByTestId('line-chart')).toBeTruthy();
  });
});

describe('BarChartView', () => {
  it('renders without crashing given a mix of real and null points', async () => {
    const { findByTestId } = await render(<BarChartView data={DATA} testID="bar-chart" />);
    expect(await findByTestId('bar-chart')).toBeTruthy();
  });
});
