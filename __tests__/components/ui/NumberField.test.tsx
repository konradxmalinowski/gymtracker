import { fireEvent, render } from '@testing-library/react-native';

import { NumberField } from '@/components/ui/NumberField';

describe('NumberField', () => {
  it('exposes the required accessibilityLabel on the input', async () => {
    const { getByLabelText } = await render(
      <NumberField value={100} onChange={() => {}} accessibilityLabel="Weight" />,
    );

    expect(getByLabelText('Weight')).toBeTruthy();
  });

  it('reflects disabled in accessibilityState and is not editable', async () => {
    const { getByLabelText } = await render(
      <NumberField value={100} onChange={() => {}} accessibilityLabel="Weight" disabled />,
    );
    const input = getByLabelText('Weight');

    expect(input.props.accessibilityState.disabled).toBe(true);
    expect(input.props.editable).toBe(false);
  });

  it('commits null, not 0, when the field is fully cleared', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await render(
      <NumberField value={100} onChange={onChange} accessibilityLabel="Weight" />,
    );
    const input = getByLabelText('Weight');

    await fireEvent.changeText(input, '');

    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('commits null on blur when only a lone minus sign was typed', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await render(
      <NumberField value={null} onChange={onChange} accessibilityLabel="Weight" />,
    );
    const input = getByLabelText('Weight');

    await fireEvent.changeText(input, '-');
    await fireEvent(input, 'blur');

    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('clamps the committed value to [min, max] on blur', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await render(
      <NumberField
        value={null}
        onChange={onChange}
        accessibilityLabel="Weight"
        min={0}
        max={100}
      />,
    );
    const input = getByLabelText('Weight');

    await fireEvent.changeText(input, '150');
    await fireEvent(input, 'blur');

    expect(onChange).toHaveBeenLastCalledWith(100);
  });
});
