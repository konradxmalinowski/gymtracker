import { fireEvent, render } from '@testing-library/react-native';

import { Switch } from '@/components/ui/Switch';

describe('Switch', () => {
  it('exposes a switch role with checked mirroring value', async () => {
    const { getByRole } = await render(
      <Switch value onValueChange={() => {}} accessibilityLabel="Haptics" />,
    );

    const control = getByRole('switch', { name: 'Haptics' });
    expect(control.props.accessibilityState.checked).toBe(true);
  });

  it('reflects disabled in accessibilityState', async () => {
    const { getByRole } = await render(
      <Switch value={false} onValueChange={() => {}} accessibilityLabel="Haptics" disabled />,
    );

    expect(getByRole('switch', { name: 'Haptics' }).props.accessibilityState.disabled).toBe(true);
  });

  it('fires onValueChange with the flipped value', async () => {
    const onValueChange = jest.fn();
    const { getByRole } = await render(
      <Switch value={false} onValueChange={onValueChange} accessibilityLabel="Haptics" />,
    );

    await fireEvent(getByRole('switch', { name: 'Haptics' }), 'valueChange', true);

    expect(onValueChange).toHaveBeenCalledWith(true);
  });
});
