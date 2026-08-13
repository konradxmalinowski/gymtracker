import { fireEvent, render } from '@testing-library/react-native';

import { ShareableSummaryCard } from '@/features/workout-logging/components/ShareableSummaryCard';

jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

function baseProps() {
  return {
    title: 'Push Day',
    localDate: '2026-08-06',
    durationSeconds: 3661,
    totalVolumeKg: 1500,
    totalSets: 12,
    totalReps: 84,
    estimatedKcal: null as number | null,
    exerciseCount: 4,
    newPRCount: 0,
    testID: 'share-card',
  };
}

describe('ShareableSummaryCard', () => {
  it('renders the session title, date and every core stat', async () => {
    const { findByText } = await render(<ShareableSummaryCard {...baseProps()} />);

    expect(await findByText('Push Day')).toBeTruthy();
    expect(await findByText('2026-08-06')).toBeTruthy();
    expect(await findByText('1:01:01')).toBeTruthy();
    expect(await findByText('4')).toBeTruthy();
    expect(await findByText('12')).toBeTruthy();
    expect(await findByText('84')).toBeTruthy();
    expect(await findByText('1500 kg')).toBeTruthy();
  });

  it('omits the calories stat entirely when estimatedKcal is null', async () => {
    const { queryByText } = await render(
      <ShareableSummaryCard {...baseProps()} estimatedKcal={null} />,
    );

    expect(queryByText('Calories')).toBeNull();
  });

  it('renders the calories stat when estimatedKcal is a real value', async () => {
    const { findByText } = await render(
      <ShareableSummaryCard {...baseProps()} estimatedKcal={320} />,
    );

    expect(await findByText('Calories')).toBeTruthy();
    expect(await findByText('320')).toBeTruthy();
  });

  it('omits the new-PR pill when newPRCount is zero', async () => {
    const { queryByText } = await render(<ShareableSummaryCard {...baseProps()} newPRCount={0} />);

    expect(queryByText(/new PR/)).toBeNull();
  });

  it('renders a pluralized new-PR pill when newPRCount is greater than one', async () => {
    const { findByText } = await render(<ShareableSummaryCard {...baseProps()} newPRCount={3} />);

    expect(await findByText('3 new PRs!')).toBeTruthy();
  });

  it('fires onLayout on its own first layout pass, the signal WorkoutSummaryScreen waits on before capturing', async () => {
    const onLayout = jest.fn();
    const { findByTestId } = await render(
      <ShareableSummaryCard {...baseProps()} onLayout={onLayout} />,
    );

    const card = await findByTestId('share-card');
    fireEvent(card, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 400 } } });

    expect(onLayout).toHaveBeenCalledTimes(1);
  });
});
