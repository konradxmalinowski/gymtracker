import { render } from '@testing-library/react-native';

import { StreakCard } from '@/features/home/components/StreakCard';

jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

describe('StreakCard', () => {
  it('renders the zero-streak message as a real, non-error state (0 is valid, not empty)', async () => {
    const { findByText } = await render(<StreakCard streak={0} testID="streak-card" />);

    expect(await findByText('0')).toBeTruthy();
    expect(await findByText('Train today to start a streak')).toBeTruthy();
  });

  it('renders the active-streak message and pluralized unit for a non-zero streak', async () => {
    const { findByText } = await render(<StreakCard streak={5} testID="streak-card" />);

    expect(await findByText('5')).toBeTruthy();
    expect(await findByText('days')).toBeTruthy();
    expect(await findByText('Keep it going')).toBeTruthy();
  });

  it('singularizes the unit label for a streak of exactly 1', async () => {
    const { findByText } = await render(<StreakCard streak={1} testID="streak-card" />);

    expect(await findByText('day')).toBeTruthy();
  });
});
