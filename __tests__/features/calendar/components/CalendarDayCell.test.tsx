import { fireEvent, render } from '@testing-library/react-native';

import {
  buildCalendarDayAccessibilityLabel,
  CalendarDayCell,
} from '@/features/calendar/components/CalendarDayCell';
import type { CalendarMonthDayCell } from '@/features/calendar/hooks/useCalendarMonth';

function buildCell(overrides: Partial<CalendarMonthDayCell> = {}): CalendarMonthDayCell {
  return {
    localDate: '2026-08-12',
    isCurrentMonth: true,
    level: 0,
    totalVolumeKg: 0,
    sessionIds: [],
    planDayNames: [],
    ...overrides,
  };
}

describe('buildCalendarDayAccessibilityLabel', () => {
  it('an outside-month cell describes itself as outside the month, regardless of training data', () => {
    const cell = buildCell({ isCurrentMonth: false, sessionIds: ['s1'], totalVolumeKg: 500 });
    expect(buildCalendarDayAccessibilityLabel(cell)).toBe('August 12, 2026, outside this month');
  });

  it('an untrained current-month cell describes itself as no training', () => {
    const cell = buildCell({ isCurrentMonth: true, sessionIds: [] });
    expect(buildCalendarDayAccessibilityLabel(cell)).toBe('August 12, 2026, no training');
  });

  it('a single session with a plan day names the plan day', () => {
    const cell = buildCell({
      sessionIds: ['s1'],
      planDayNames: ['Push Day'],
      totalVolumeKg: 3400,
    });
    expect(buildCalendarDayAccessibilityLabel(cell)).toBe('August 12, 2026, 3400 kg, Push Day');
  });

  it('a single session with no plan day (a quick-start/empty workout) omits the plan-day segment', () => {
    const cell = buildCell({ sessionIds: ['s1'], planDayNames: [null], totalVolumeKg: 500 });
    expect(buildCalendarDayAccessibilityLabel(cell)).toBe('August 12, 2026, 500 kg');
  });

  it('multiple sessions describe the workout count instead of naming a single plan day', () => {
    const cell = buildCell({
      sessionIds: ['s1', 's2'],
      planDayNames: ['Push Day', null],
      totalVolumeKg: 900,
    });
    expect(buildCalendarDayAccessibilityLabel(cell)).toBe('August 12, 2026, 900 kg, 2 workouts');
  });
});

describe('CalendarDayCell', () => {
  it('is a pressable button for a current-month, trained day and fires onPress with the cell', async () => {
    const onPress = jest.fn();
    const cell = buildCell({
      sessionIds: ['s1'],
      planDayNames: ['Push Day'],
      totalVolumeKg: 500,
      level: 2,
    });

    const { getByTestId } = await render(
      <CalendarDayCell cell={cell} onPress={onPress} testID="day-cell" />,
    );
    const node = getByTestId('day-cell');

    expect(node.props.accessibilityRole).toBe('button');
    await fireEvent.press(node);
    expect(onPress).toHaveBeenCalledWith(cell);
  });

  it('is a non-interactive, accessible node (not a button) for an untrained current-month day', async () => {
    const onPress = jest.fn();
    const cell = buildCell({ sessionIds: [] });

    const { getByTestId } = await render(
      <CalendarDayCell cell={cell} onPress={onPress} testID="day-cell" />,
    );
    const node = getByTestId('day-cell');

    // Not `fireEvent.press` + "not called": RNTL's press simulation walks
    // the *composite* ancestor chain for a prop literally named `onPress`
    // and invokes whatever it finds there, even when (as here) the branch
    // never wires that prop onto any host node - so a press on this node
    // would spuriously "succeed" regardless of this component's own
    // `isInteractive` gating. Asserting directly on the rendered host
    // node's own props is what actually proves the branch never attaches
    // one.
    expect(node.props.accessibilityRole).not.toBe('button');
    expect(node.props.accessible).toBe(true);
    expect(node.props.onPress).toBeUndefined();
  });

  it('is a non-interactive node for a trained but outside-month (leading/trailing filler) day', async () => {
    const onPress = jest.fn();
    const cell = buildCell({ isCurrentMonth: false, sessionIds: ['s1'], totalVolumeKg: 500 });

    const { getByTestId } = await render(
      <CalendarDayCell cell={cell} onPress={onPress} testID="day-cell" />,
    );
    const node = getByTestId('day-cell');

    expect(node.props.accessibilityRole).not.toBe('button');
    expect(node.props.onPress).toBeUndefined();
  });

  it('carries the real, data-summarizing accessibility label as its accessibilityLabel prop', async () => {
    const cell = buildCell({ sessionIds: ['s1'], planDayNames: ['Leg Day'], totalVolumeKg: 3400 });

    const { getByTestId } = await render(<CalendarDayCell cell={cell} testID="day-cell" />);

    expect(getByTestId('day-cell').props.accessibilityLabel).toBe(
      buildCalendarDayAccessibilityLabel(cell),
    );
  });
});
