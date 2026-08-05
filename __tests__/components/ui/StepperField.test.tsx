import { act, fireEvent, render } from '@testing-library/react-native';

import { StepperField } from '@/components/ui/StepperField';

const HOLD_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 80;

describe('StepperField', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('exposes increase/decrease buttons built from the field label', async () => {
    const { getByRole } = await render(
      <StepperField value={5} onChange={() => {}} accessibilityLabel="Reps" />,
    );

    expect(getByRole('button', { name: 'Increase Reps' })).toBeTruthy();
    expect(getByRole('button', { name: 'Decrease Reps' })).toBeTruthy();
  });

  it('increments by step on a single press', async () => {
    const onChange = jest.fn();
    const { getByRole } = await render(
      <StepperField value={5} onChange={onChange} accessibilityLabel="Reps" step={1} />,
    );

    await fireEvent(getByRole('button', { name: 'Increase Reps' }), 'pressIn');
    await fireEvent(getByRole('button', { name: 'Increase Reps' }), 'pressOut');

    expect(onChange).toHaveBeenCalledWith(6);
  });

  it('decrements by step on a single press', async () => {
    const onChange = jest.fn();
    const { getByRole } = await render(
      <StepperField value={5} onChange={onChange} accessibilityLabel="Reps" step={1} />,
    );

    await fireEvent(getByRole('button', { name: 'Decrease Reps' }), 'pressIn');
    await fireEvent(getByRole('button', { name: 'Decrease Reps' }), 'pressOut');

    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('does not fire when disabled', async () => {
    const onChange = jest.fn();
    const { getByRole } = await render(
      <StepperField value={5} onChange={onChange} accessibilityLabel="Reps" disabled />,
    );

    await fireEvent(getByRole('button', { name: 'Increase Reps' }), 'pressIn');
    await fireEvent(getByRole('button', { name: 'Increase Reps' }), 'pressOut');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not exceed max under a held-down repeat', async () => {
    const onChange = jest.fn();
    const { getByRole } = await render(
      <StepperField
        value={8}
        onChange={onChange}
        accessibilityLabel="Reps"
        step={1}
        min={0}
        max={10}
      />,
    );

    await fireEvent(getByRole('button', { name: 'Increase Reps' }), 'pressIn');
    await act(async () => {
      jest.advanceTimersByTime(HOLD_DELAY_MS + REPEAT_INTERVAL_MS * 20);
    });
    await fireEvent(getByRole('button', { name: 'Increase Reps' }), 'pressOut');

    const values = onChange.mock.calls.map((call) => call[0] as number);
    expect(Math.max(...values)).toBe(10);
    expect(values.every((value) => value <= 10)).toBe(true);
  });

  it('does not go below min under a held-down repeat', async () => {
    const onChange = jest.fn();
    const { getByRole } = await render(
      <StepperField
        value={2}
        onChange={onChange}
        accessibilityLabel="Reps"
        step={1}
        min={0}
        max={10}
      />,
    );

    await fireEvent(getByRole('button', { name: 'Decrease Reps' }), 'pressIn');
    await act(async () => {
      jest.advanceTimersByTime(HOLD_DELAY_MS + REPEAT_INTERVAL_MS * 20);
    });
    await fireEvent(getByRole('button', { name: 'Decrease Reps' }), 'pressOut');

    const values = onChange.mock.calls.map((call) => call[0] as number);
    expect(Math.min(...values)).toBe(0);
    expect(values.every((value) => value >= 0)).toBe(true);
  });
});
