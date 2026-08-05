import { fireEvent, render } from '@testing-library/react-native';

import { TextField } from '@/components/ui/TextField';

describe('TextField', () => {
  it('links the visible label to the input via accessibilityLabelledBy', async () => {
    const { getByLabelText } = await render(
      <TextField label="Exercise name" value="" onChangeText={() => {}} />,
    );

    expect(getByLabelText('Exercise name')).toBeTruthy();
  });

  it('fires onChangeText with the typed value', async () => {
    const onChangeText = jest.fn();
    const { getByLabelText } = await render(
      <TextField label="Exercise name" value="" onChangeText={onChangeText} />,
    );

    await fireEvent.changeText(getByLabelText('Exercise name'), 'Bench press');

    expect(onChangeText).toHaveBeenCalledWith('Bench press');
  });

  it('reflects disabled in accessibilityState and is not editable', async () => {
    const { getByLabelText } = await render(
      <TextField label="Exercise name" value="" onChangeText={() => {}} disabled />,
    );
    const input = getByLabelText('Exercise name');

    expect(input.props.accessibilityState.disabled).toBe(true);
    expect(input.props.editable).toBe(false);
  });

  it('announces an error message via accessibilityRole="alert"', async () => {
    const { getByRole } = await render(
      <TextField label="Exercise name" value="" onChangeText={() => {}} error="Name is required" />,
    );

    expect(getByRole('alert')).toHaveTextContent('Name is required');
  });
});
