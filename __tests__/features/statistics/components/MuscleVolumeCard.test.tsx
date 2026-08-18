import { render } from '@testing-library/react-native';

import { MuscleVolumeCard } from '@/features/statistics/components/MuscleVolumeCard';

jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

const TEST_ID = 'muscle-volume-card';

describe('MuscleVolumeCard', () => {
  it('renders the loading skeleton while isPending', async () => {
    const { findByText, queryByTestId } = await render(
      <MuscleVolumeCard data={undefined} isPending testID={TEST_ID} />,
    );

    expect(await findByText('Muscle group volume')).toBeTruthy();
    expect(queryByTestId(TEST_ID)).toBeNull();
  });

  it('renders a real empty state for an empty slice list', async () => {
    const { findByTestId, findByText } = await render(
      <MuscleVolumeCard data={[]} isPending={false} testID={TEST_ID} />,
    );

    expect(await findByTestId(`${TEST_ID}-empty`)).toBeTruthy();
    expect(await findByText('No volume yet')).toBeTruthy();
  });

  it('renders the stacked bar chart with a known body-part label once data has loaded', async () => {
    const { findByTestId, findByText } = await render(
      <MuscleVolumeCard
        data={[
          { bodyPart: 'upper', volumeKg: 700 },
          { bodyPart: 'other', volumeKg: 100 },
        ]}
        isPending={false}
        testID={TEST_ID}
      />,
    );

    expect(await findByTestId(TEST_ID)).toBeTruthy();
    expect(await findByText('Upper body')).toBeTruthy();
  });

  it('falls back to the raw body_part string for an unrecognized value', async () => {
    const { findByText } = await render(
      <MuscleVolumeCard
        data={[{ bodyPart: 'exotic', volumeKg: 50 }]}
        isPending={false}
        testID={TEST_ID}
      />,
    );

    expect(await findByText('exotic')).toBeTruthy();
  });
});
