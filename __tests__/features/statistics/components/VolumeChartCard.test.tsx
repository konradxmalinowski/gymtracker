import { render } from '@testing-library/react-native';

import { VolumeChartCard } from '@/features/statistics/components/VolumeChartCard';

jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

const TEST_ID = 'volume-chart-card';

describe('VolumeChartCard', () => {
  it('renders the loading skeleton and not the chart while isPending', async () => {
    const { findByText, queryByTestId } = await render(
      <VolumeChartCard data={undefined} isPending testID={TEST_ID} />,
    );

    expect(await findByText('Volume')).toBeTruthy();
    expect(queryByTestId(TEST_ID)).toBeNull();
  });

  it('renders a real empty state when every bucket is 0 or absent', async () => {
    const { findByTestId, findByText } = await render(
      <VolumeChartCard
        data={[
          { bucketStart: '2026-08-01', value: 0 },
          { bucketStart: '2026-08-02', value: 0 },
        ]}
        isPending={false}
        testID={TEST_ID}
      />,
    );

    expect(await findByTestId(`${TEST_ID}-empty`)).toBeTruthy();
    expect(await findByText('No volume yet')).toBeTruthy();
  });

  it('renders the chart once real, non-zero data has loaded', async () => {
    const { findByTestId, queryByTestId } = await render(
      <VolumeChartCard
        data={[
          { bucketStart: '2026-08-01', value: 500 },
          { bucketStart: '2026-08-02', value: 0 },
        ]}
        isPending={false}
        testID={TEST_ID}
      />,
    );

    expect(await findByTestId(TEST_ID)).toBeTruthy();
    expect(queryByTestId(`${TEST_ID}-empty`)).toBeNull();
  });
});
