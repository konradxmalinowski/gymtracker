import { fireEvent, render } from '@testing-library/react-native';

import { Checkbox } from '@/components/ui/Checkbox';

describe('Checkbox', () => {
  it('exposes a checkbox role with checked mirroring value', async () => {
    const { getByRole } = await render(
      <Checkbox value onValueChange={() => {}} accessibilityLabel="Include warm-up sets" />,
    );

    expect(
      getByRole('checkbox', { name: 'Include warm-up sets' }).props.accessibilityState.checked,
    ).toBe(true);
  });

  it('reflects disabled in accessibilityState and blocks toggling', async () => {
    const onValueChange = jest.fn();
    const { getByRole } = await render(
      <Checkbox
        value={false}
        onValueChange={onValueChange}
        accessibilityLabel="Include warm-up sets"
        disabled
      />,
    );
    const control = getByRole('checkbox', { name: 'Include warm-up sets' });

    expect(control.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(control);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('fires onValueChange with the toggled boolean on press', async () => {
    const onValueChange = jest.fn();
    const { getByRole } = await render(
      <Checkbox
        value={false}
        onValueChange={onValueChange}
        accessibilityLabel="Include warm-up sets"
      />,
    );

    await fireEvent.press(getByRole('checkbox', { name: 'Include warm-up sets' }));

    expect(onValueChange).toHaveBeenCalledWith(true);
  });
});
