import { fireEvent, render } from '@testing-library/react-native';

import { Button } from '@/components/ui/Button';

describe('Button', () => {
  it('exposes a button role with the label as its accessible name', async () => {
    const { getByRole } = await render(<Button label="Save workout" onPress={() => {}} />);

    expect(getByRole('button', { name: 'Save workout' })).toBeTruthy();
  });

  it('fires onPress exactly once per press', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(<Button label="Save workout" onPress={onPress} />);

    await fireEvent.press(getByRole('button', { name: 'Save workout' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reflects disabled in accessibilityState and blocks onPress', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(<Button label="Save workout" onPress={onPress} disabled />);
    const button = getByRole('button', { name: 'Save workout' });

    expect(button.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('reflects loading as both disabled and busy, and blocks onPress', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(<Button label="Save workout" onPress={onPress} loading />);
    const button = getByRole('button', { name: 'Save workout' });

    expect(button.props.accessibilityState.disabled).toBe(true);
    expect(button.props.accessibilityState.busy).toBe(true);
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});
