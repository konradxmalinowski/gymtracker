import { fireEvent, render } from '@testing-library/react-native';

import { SegmentedControl } from '@/components/ui/SegmentedControl';

const OPTIONS = [
  { value: 'kg', label: 'Kilograms' },
  { value: 'lb', label: 'Pounds' },
] as const;

describe('SegmentedControl', () => {
  // NOTE: this assertion currently fails. The container `View` sets
  // `accessibilityRole="tablist"` but never `accessible={true}`, and RNTL's
  // `isAccessibilityElement` check (which real screen readers mirror -
  // TalkBack/VoiceOver only expose a plain `View`'s accessibility props once
  // it opts in via `accessible`) skips any host element that doesn't set
  // `accessible` and isn't itself a Text/TextInput/Switch. The individual
  // `tab` segments below are still reachable/correct (`Pressable` defaults
  // `accessible` to `true`), so this is scoped to the outer grouping role
  // only - reported separately, not a components/ui change this suite is
  // allowed to make.
  it('exposes the container with a tablist role', async () => {
    const { getByRole } = await render(
      <SegmentedControl options={OPTIONS} value="kg" onChange={() => {}} />,
    );

    expect(getByRole('tablist')).toBeTruthy();
  });

  it('exposes a tab per option', async () => {
    const { getAllByRole } = await render(
      <SegmentedControl options={OPTIONS} value="kg" onChange={() => {}} />,
    );

    expect(getAllByRole('tab')).toHaveLength(2);
  });

  it('reflects the selected option in accessibilityState', async () => {
    const { getByRole } = await render(
      <SegmentedControl options={OPTIONS} value="kg" onChange={() => {}} />,
    );

    expect(getByRole('tab', { name: 'Kilograms' }).props.accessibilityState.selected).toBe(true);
    expect(getByRole('tab', { name: 'Pounds' }).props.accessibilityState.selected).toBe(false);
  });

  it('fires onChange with the newly-pressed option value', async () => {
    const onChange = jest.fn();
    const { getByRole } = await render(
      <SegmentedControl options={OPTIONS} value="kg" onChange={onChange} />,
    );

    await fireEvent.press(getByRole('tab', { name: 'Pounds' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('lb');
  });

  it('does not fire onChange when pressing the already-selected option', async () => {
    const onChange = jest.fn();
    const { getByRole } = await render(
      <SegmentedControl options={OPTIONS} value="kg" onChange={onChange} />,
    );

    await fireEvent.press(getByRole('tab', { name: 'Kilograms' }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
