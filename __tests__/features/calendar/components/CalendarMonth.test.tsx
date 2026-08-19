import { fireEvent, render } from '@testing-library/react-native';

import { CalendarMonth } from '@/features/calendar/components/CalendarMonth';
import { generateMonthGrid } from '@/features/calendar/domain/monthGrid';
import type { CalendarMonthDayCell } from '@/features/calendar/hooks/useCalendarMonth';

function buildCells(year: number, month: number): CalendarMonthDayCell[] {
  return generateMonthGrid(year, month).map((cell) => ({
    ...cell,
    level: 0,
    totalVolumeKg: 0,
    sessionIds: [],
    planDayNames: [],
  }));
}

describe('CalendarMonth', () => {
  it('renders exactly 7 weekday headers (Mon-Sun)', async () => {
    const { getByText } = await render(
      <CalendarMonth cells={buildCells(2026, 8)} onDayPress={jest.fn()} />,
    );

    for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(getByText(label)).toBeTruthy();
    }
  });

  it('renders exactly one day cell per grid cell (42 for a 6-week month)', async () => {
    const cells = buildCells(2026, 8);
    const { getByTestId } = await render(
      <CalendarMonth cells={cells} onDayPress={jest.fn()} testID="calendar-month-grid" />,
    );

    expect(cells).toHaveLength(42);
    for (const cell of cells) {
      expect(getByTestId(`calendar-month-grid-day-${cell.localDate}`)).toBeTruthy();
    }
  });

  it('renders exactly one day cell per grid cell (35 for a 5-week month)', async () => {
    const cells = buildCells(2026, 2);
    const { getByTestId } = await render(
      <CalendarMonth cells={cells} onDayPress={jest.fn()} testID="calendar-month-grid" />,
    );

    expect(cells).toHaveLength(35);
    for (const cell of cells) {
      expect(getByTestId(`calendar-month-grid-day-${cell.localDate}`)).toBeTruthy();
    }
  });

  /**
   * Regression coverage for A11Y-P12-001 (`reports/accessibility-2026-08-19-p12.md`):
   * the weekday header row was previously seven separately-focusable "Mon"/
   * "Tue"/... stops with no indication they're calendar column headers. The
   * fix collapses the whole row into one `accessible` node carrying a single
   * summary label - the same shape `CalendarLegend.tsx`'s own swatch strip
   * already uses. `getByText('Mon')` still finds the individual weekday
   * `Text` node in the render tree (RNTL's static prop-tree inspection can't
   * simulate the native accessibility engine's actual subtree collapsing,
   * the same caveat this codebase's other `SwipeableRow`-collapse findings
   * already document) - what's checkable, and what actually distinguishes
   * "collapsed under one label" from "seven independent stops," is that the
   * individual day-name node carries no accessibility semantics of its own
   * (no `accessible`/`accessibilityRole`/`accessibilityLabel`), so it has
   * nothing to expose as an independent element even if it were reachable.
   */
  it('collapses the weekday header row into one accessible summary node (A11Y-P12-001 regression)', async () => {
    const { getByLabelText, getByText } = await render(
      <CalendarMonth cells={buildCells(2026, 8)} onDayPress={jest.fn()} />,
    );

    const header = getByLabelText('Days of the week, Monday through Sunday');
    expect(header.props.accessible).toBe(true);

    const monNode = getByText('Mon');
    expect(monNode.props.accessible).toBeUndefined();
    expect(monNode.props.accessibilityRole).toBeUndefined();
    expect(monNode.props.accessibilityLabel).toBeUndefined();
  });

  it('forwards a day tap to onDayPress with the pressed cell', async () => {
    const onDayPress = jest.fn();
    const cells = buildCells(2026, 8).map((cell) =>
      cell.localDate === '2026-08-12' ? { ...cell, sessionIds: ['s1'] } : cell,
    );

    const { getByTestId } = await render(
      <CalendarMonth cells={cells} onDayPress={onDayPress} testID="calendar-month-grid" />,
    );

    await fireEvent.press(getByTestId('calendar-month-grid-day-2026-08-12'));

    expect(onDayPress).toHaveBeenCalledWith(cells.find((cell) => cell.localDate === '2026-08-12'));
  });
});
