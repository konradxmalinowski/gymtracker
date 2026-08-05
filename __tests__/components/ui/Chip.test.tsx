import { fireEvent, render } from '@testing-library/react-native';

import { Chip } from '@/components/ui/Chip';

describe('Chip', () => {
  it('renders as plain content (no button role) when onPress is not provided', async () => {
    const { queryByRole } = await render(<Chip label="Chest" />);

    expect(queryByRole('button', { name: 'Chest' })).toBeNull();
  });

  it('exposes a button role with selected reflected in accessibilityState when pressable', async () => {
    const { getByRole } = await render(<Chip label="Chest" selected onPress={() => {}} />);
    const chip = getByRole('button', { name: 'Chest' });

    expect(chip.props.accessibilityState.selected).toBe(true);
  });

  it('fires onPress on press and blocks it when disabled', async () => {
    const onPress = jest.fn();
    const { getByRole, rerender } = await render(<Chip label="Chest" onPress={onPress} />);

    await fireEvent.press(getByRole('button', { name: 'Chest' }));
    expect(onPress).toHaveBeenCalledTimes(1);

    await rerender(<Chip label="Chest" onPress={onPress} disabled />);
    const disabledChip = getByRole('button', { name: 'Chest' });
    expect(disabledChip.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(disabledChip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders a remove control with a distinct label that fires independently of onPress', async () => {
    const onPress = jest.fn();
    const onRemove = jest.fn();
    const { getByRole } = await render(
      <Chip label="Chest" onPress={onPress} onRemove={onRemove} />,
    );

    await fireEvent.press(getByRole('button', { name: 'Remove Chest' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });
});
