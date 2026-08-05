import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { PressScale } from '@/components/gestures/PressScale';

describe('PressScale', () => {
  it('forwards accessibilityRole and accessibilityLabel to the underlying pressable verbatim', async () => {
    const { getByRole } = await render(
      <PressScale
        accessibilityRole="button"
        accessibilityLabel="Start rest timer"
        onPress={() => {}}
      >
        <Text>{'Start'}</Text>
      </PressScale>,
    );

    expect(getByRole('button', { name: 'Start rest timer' })).toBeTruthy();
  });

  it('does not swallow onPress', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(
      <PressScale
        accessibilityRole="button"
        accessibilityLabel="Start rest timer"
        onPress={onPress}
      >
        <Text>{'Start'}</Text>
      </PressScale>,
    );

    await fireEvent.press(getByRole('button', { name: 'Start rest timer' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('merges disabled into accessibilityState and blocks onPress when disabled', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(
      <PressScale
        accessibilityRole="button"
        accessibilityLabel="Start rest timer"
        onPress={onPress}
        disabled
      >
        <Text>{'Start'}</Text>
      </PressScale>,
    );
    const pressable = getByRole('button', { name: 'Start rest timer' });

    expect(pressable.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(pressable);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('merges a caller-provided accessibilityState alongside disabled', async () => {
    const { getByRole } = await render(
      <PressScale
        accessibilityRole="tab"
        accessibilityLabel="Kilograms"
        accessibilityState={{ selected: true }}
        onPress={() => {}}
      >
        <Text>{'Kilograms'}</Text>
      </PressScale>,
    );
    const pressable = getByRole('tab', { name: 'Kilograms' });

    expect(pressable.props.accessibilityState.selected).toBe(true);
    expect(pressable.props.accessibilityState.disabled).toBeFalsy();
  });
});
