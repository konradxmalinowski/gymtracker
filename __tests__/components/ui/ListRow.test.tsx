import { fireEvent, render } from '@testing-library/react-native';

import { ListRow } from '@/components/ui/ListRow';

describe('ListRow', () => {
  it('renders as plain content (no button role) when onPress is not provided', async () => {
    const { queryByRole } = await render(<ListRow title="Bench press" />);

    expect(queryByRole('button')).toBeNull();
  });

  it('exposes a button role using the title as the accessible name', async () => {
    const { getByRole } = await render(<ListRow title="Bench press" onPress={() => {}} />);

    expect(getByRole('button', { name: 'Bench press' })).toBeTruthy();
  });

  it('combines title and subtitle into the accessible name when both are present', async () => {
    const { getByRole } = await render(
      <ListRow title="Bench press" subtitle="3 sets" onPress={() => {}} />,
    );

    expect(getByRole('button', { name: 'Bench press, 3 sets' })).toBeTruthy();
  });

  it('fires onPress on press and blocks it when disabled', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(<ListRow title="Bench press" onPress={onPress} disabled />);
    const row = getByRole('button', { name: 'Bench press' });

    expect(row.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(row);
    expect(onPress).not.toHaveBeenCalled();
  });
});
