import { fireEvent, render } from '@testing-library/react-native';

import { LastWorkoutCard } from '@/features/home/components/LastWorkoutCard';
import type { HomeLastSessionDto } from '@/features/home/repository/HomeDashboardRepository';
import { formatAchievedDate } from '@/features/records';

jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

function makeSession(overrides: Partial<HomeLastSessionDto> = {}): HomeLastSessionDto {
  return {
    id: 'session-1',
    title: 'Push Day',
    localDate: '2026-08-18',
    totalVolumeKg: 480,
    totalSets: 12,
    durationSeconds: 3661,
    finishedAt: Date.UTC(2026, 7, 18, 12, 0, 0),
    ...overrides,
  };
}

describe('LastWorkoutCard', () => {
  it('renders the real empty state when there is no last session yet', async () => {
    const onPress = jest.fn();
    const { findByTestId, findByText } = await render(
      <LastWorkoutCard lastSession={null} onPress={onPress} testID="last-workout-card" />,
    );

    expect(await findByTestId('last-workout-card-empty')).toBeTruthy();
    expect(await findByText('No workouts yet')).toBeTruthy();
  });

  it('renders the session title, date, volume, sets and duration for a populated session', async () => {
    const session = makeSession();
    const { findByText } = await render(
      <LastWorkoutCard lastSession={session} onPress={jest.fn()} testID="last-workout-card" />,
    );

    expect(await findByText('Push Day')).toBeTruthy();
    expect(await findByText(formatAchievedDate(session.finishedAt))).toBeTruthy();
    expect(await findByText('480')).toBeTruthy();
    expect(await findByText('12')).toBeTruthy();
    expect(await findByText('1:01:01')).toBeTruthy(); // formatHomeDurationSeconds(3661)
  });

  it('fires onPress with the session id when tapped', async () => {
    const onPress = jest.fn();
    const session = makeSession({ id: 'session-42' });
    const { findByTestId } = await render(
      <LastWorkoutCard lastSession={session} onPress={onPress} testID="last-workout-card" />,
    );

    fireEvent.press(await findByTestId('last-workout-card'));

    expect(onPress).toHaveBeenCalledWith('session-42');
  });

  it('carries an accessibility label summarizing title, date, volume and set count', async () => {
    const session = makeSession();
    const { findByTestId } = await render(
      <LastWorkoutCard lastSession={session} onPress={jest.fn()} testID="last-workout-card" />,
    );

    const card = await findByTestId('last-workout-card');
    expect(card.props.accessibilityLabel).toBe(
      `Push Day, ${formatAchievedDate(session.finishedAt)}, 480, 12 sets`,
    );
  });
});
