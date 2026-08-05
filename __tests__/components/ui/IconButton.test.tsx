import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { IconButton } from '@/components/ui/IconButton';

describe('IconButton', () => {
  it('exposes a button role using the required accessibilityLabel verbatim', async () => {
    const { getByRole } = await render(
      <IconButton icon={<Text>{'x'}</Text>} accessibilityLabel="Delete set" onPress={() => {}} />,
    );

    expect(getByRole('button', { name: 'Delete set' })).toBeTruthy();
  });

  it('fires onPress on press', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(
      <IconButton icon={<Text>{'x'}</Text>} accessibilityLabel="Delete set" onPress={onPress} />,
    );

    await fireEvent.press(getByRole('button', { name: 'Delete set' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reflects disabled in accessibilityState and blocks onPress', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(
      <IconButton
        icon={<Text>{'x'}</Text>}
        accessibilityLabel="Delete set"
        onPress={onPress}
        disabled
      />,
    );
    const button = getByRole('button', { name: 'Delete set' });

    expect(button.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('reflects loading as busy and blocks onPress', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(
      <IconButton
        icon={<Text>{'x'}</Text>}
        accessibilityLabel="Delete set"
        onPress={onPress}
        loading
      />,
    );
    const button = getByRole('button', { name: 'Delete set' });

    expect(button.props.accessibilityState.busy).toBe(true);
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});
