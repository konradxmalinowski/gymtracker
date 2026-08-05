import { fireEvent, render } from '@testing-library/react-native';

import { Slider } from '@/components/ui/Slider';

describe('Slider', () => {
  // NOTE: this assertion currently fails. `components/ui/Slider.tsx` never
  // sets `accessibilityRole` on the underlying `RNCSlider` - unlike
  // `Switch`/`Checkbox`, which each set an explicit role, Slider relies on
  // `@react-native-community/slider`'s native component, which (confirmed by
  // rendering it under RNTL and inspecting the output tree) does not supply
  // one itself outside its web fallback. That's a real gap against this
  // phase's "every primitive has an accessibility role" acceptance
  // criterion, not a test-authoring issue - left failing intentionally
  // rather than weakened to `getByLabelText`, so it keeps surfacing until
  // `accessibilityRole="adjustable"` is added to the component. Reported
  // separately; not a components/ui change this suite is allowed to make.
  it('exposes an adjustable role with the accessibilityLabel as its accessible name', async () => {
    const { getByRole } = await render(
      <Slider value={5} onValueChange={() => {}} accessibilityLabel="Rest duration" />,
    );

    expect(getByRole('adjustable', { name: 'Rest duration' })).toBeTruthy();
  });

  it('reflects disabled in accessibilityState', async () => {
    const { getByLabelText } = await render(
      <Slider value={5} onValueChange={() => {}} accessibilityLabel="Rest duration" disabled />,
    );

    expect(getByLabelText('Rest duration').props.accessibilityState.disabled).toBe(true);
  });

  it('fires onValueChange when the native change event fires', async () => {
    const onValueChange = jest.fn();
    const { getByLabelText } = await render(
      <Slider value={5} onValueChange={onValueChange} accessibilityLabel="Rest duration" />,
    );

    await fireEvent(getByLabelText('Rest duration'), 'change', { nativeEvent: { value: 8 } });

    expect(onValueChange).toHaveBeenCalledWith(8);
  });
});
