import { fireEvent, render } from '@testing-library/react-native';

import { StatRangeSelector } from '@/features/statistics/components/StatRangeSelector';

describe('StatRangeSelector', () => {
  it('renders a tab per range option', async () => {
    const { getAllByRole } = await render(<StatRangeSelector value="3m" onChange={() => {}} />);

    expect(getAllByRole('tab')).toHaveLength(4);
  });

  it('marks the current range as selected', async () => {
    const { getByRole } = await render(<StatRangeSelector value="1y" onChange={() => {}} />);

    expect(getByRole('tab', { name: '1 year' }).props.accessibilityState.selected).toBe(true);
    expect(getByRole('tab', { name: '3 months' }).props.accessibilityState.selected).toBe(false);
  });

  it('fires onChange with the newly-tapped range', async () => {
    const onChange = jest.fn();
    const { getByRole } = await render(<StatRangeSelector value="3m" onChange={onChange} />);

    await fireEvent.press(getByRole('tab', { name: 'All time' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('does not fire onChange when the already-selected range is tapped again', async () => {
    const onChange = jest.fn();
    const { getByRole } = await render(<StatRangeSelector value="4w" onChange={onChange} />);

    await fireEvent.press(getByRole('tab', { name: '4 weeks' }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
