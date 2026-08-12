import { fireEvent, render } from '@testing-library/react-native';

import { ProgressionHint } from '@/features/records/components/ProgressionHint';
import type { ProgressionSuggestion } from '@/features/records/domain/ProgressionAdvisor';

jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

describe('ProgressionHint', () => {
  it('renders nothing when suggestion is null - the caller has nothing to show yet', async () => {
    const { toJSON } = await render(
      <ProgressionHint suggestion={null} testID="progression-hint" />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders a "first time" message with no apply affordance for the first_time suggestion', async () => {
    const { findByText, queryByRole } = await render(
      <ProgressionHint suggestion={{ kind: 'first_time' }} testID="progression-hint" />,
    );

    expect(await findByText('Log this exercise to get a suggested next set.')).toBeTruthy();
    expect(queryByRole('button')).toBeNull();
  });

  it('renders the suggested weight/reps for a real suggestion', async () => {
    const suggestion: ProgressionSuggestion = {
      kind: 'increase_weight',
      weightKg: 62.5,
      reps: 8,
      usedRepRange: { targetRepMin: 6, targetRepMax: 8 },
    };
    const { findByText } = await render(
      <ProgressionHint suggestion={suggestion} testID="progression-hint" />,
    );

    expect(await findByText('Suggested: 62.5 kg x 8')).toBeTruthy();
  });

  it('renders the suggestion as plain (non-interactive) text when onApply is omitted', async () => {
    const suggestion: ProgressionSuggestion = {
      kind: 'repeat',
      weightKg: 60,
      reps: 8,
      usedRepRange: { targetRepMin: 6, targetRepMax: 8 },
    };
    const { findByTestId, queryByRole } = await render(
      <ProgressionHint suggestion={suggestion} testID="progression-hint" />,
    );

    await findByTestId('progression-hint');
    expect(queryByRole('button')).toBeNull();
  });

  it('calls onApply when tapped, with an accessibility label describing the suggestion', async () => {
    const onApply = jest.fn();
    const suggestion: ProgressionSuggestion = {
      kind: 'increase_reps',
      weightKg: 60,
      reps: 9,
      usedRepRange: { targetRepMin: 6, targetRepMax: 10 },
    };
    const { findByTestId } = await render(
      <ProgressionHint suggestion={suggestion} onApply={onApply} testID="progression-hint" />,
    );

    const control = await findByTestId('progression-hint');
    expect(control.props.accessibilityRole).toBe('button');
    expect(control.props.accessibilityLabel).toBe('Apply suggested 60 kilograms for 9 reps');

    fireEvent.press(control);
    expect(onApply).toHaveBeenCalledTimes(1);
  });
});
