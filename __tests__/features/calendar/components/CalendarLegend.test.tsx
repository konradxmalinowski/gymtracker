import { render } from '@testing-library/react-native';

import { CalendarLegend } from '@/features/calendar/components/CalendarLegend';

describe('CalendarLegend', () => {
  it('renders as one accessible summary node, not five separately-announced swatches', async () => {
    const { getByTestId } = await render(<CalendarLegend testID="calendar-legend" />);
    const node = getByTestId('calendar-legend');

    expect(node.props.accessible).toBe(true);
    expect(node.props.accessibilityLabel).toBe('Training intensity');
  });

  it('renders the Less/More labels', async () => {
    const { getByText } = await render(<CalendarLegend testID="calendar-legend" />);

    expect(getByText('Less')).toBeTruthy();
    expect(getByText('More')).toBeTruthy();
  });
});
