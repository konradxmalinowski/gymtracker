import { render } from '@testing-library/react-native';

import { WeeklySummaryCard } from '@/features/home/components/WeeklySummaryCard';
import type { HomeWeeklySummary } from '@/features/home/repository/HomeDashboardRepository';

jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

function makeSummary(overrides: Partial<HomeWeeklySummary> = {}): HomeWeeklySummary {
  return { workouts: 3, sets: 24, volumeKg: 1200, durationSeconds: 3723, ...overrides };
}

describe('WeeklySummaryCard', () => {
  it('renders the real empty state - zero workouts this week - not a row of zeroed stats', async () => {
    const { findByTestId, findByText, queryByText } = await render(
      <WeeklySummaryCard
        weeklySummary={makeSummary({ workouts: 0 })}
        testID="weekly-summary-card"
      />,
    );

    expect(await findByTestId('weekly-summary-card-empty')).toBeTruthy();
    expect(await findByText('No workouts this week')).toBeTruthy();
    // The stat row itself must not render underneath the empty state.
    expect(queryByText('Workouts')).toBeNull();
  });

  it('renders workouts/sets/volume/duration for a populated week', async () => {
    const { findByText } = await render(
      <WeeklySummaryCard weeklySummary={makeSummary()} testID="weekly-summary-card" />,
    );

    expect(await findByText('3')).toBeTruthy();
    expect(await findByText('24')).toBeTruthy();
    expect(await findByText('1200')).toBeTruthy(); // Weight.toDisplayString('kg'), no unit suffix - matches every other home card
    expect(await findByText('1:02:03')).toBeTruthy(); // formatHomeDurationSeconds(3723)
    expect(await findByText('Workouts')).toBeTruthy();
    expect(await findByText('Sets')).toBeTruthy();
    expect(await findByText('Volume')).toBeTruthy();
    expect(await findByText('Duration')).toBeTruthy();
  });
});
