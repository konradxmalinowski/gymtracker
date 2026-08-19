import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';

import { CalendarDaySessionPicker } from '@/features/calendar/components/CalendarDaySessionPicker';
import { useSheetStore } from '@/stores/sheetStore';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

afterEach(() => {
  jest.clearAllMocks();
  useSheetStore.setState({ current: null, queue: [] });
});

describe('CalendarDaySessionPicker', () => {
  it('renders one row per session id', async () => {
    const { getByTestId } = await render(
      <CalendarDaySessionPicker
        localDate="2026-08-12"
        sessionIds={['s1', 's2']}
        planDayNames={['Push Day', null]}
        testID="picker"
      />,
    );

    expect(getByTestId('picker-row-s1')).toBeTruthy();
    expect(getByTestId('picker-row-s2')).toBeTruthy();
  });

  it("uses the session's plan day name as the row title, and falls back to a generic label when it has none", async () => {
    const { getByText } = await render(
      <CalendarDaySessionPicker
        localDate="2026-08-12"
        sessionIds={['s1', 's2']}
        planDayNames={['Push Day', null]}
      />,
    );

    expect(getByText('Push Day')).toBeTruthy();
    expect(getByText('Workout')).toBeTruthy();
  });

  it("tapping a row dismisses the sheet and navigates to that session's history detail route", async () => {
    useSheetStore.setState({
      current: { id: 'calendar-day-sessions', content: null },
      queue: [],
    });

    const { getByTestId } = await render(
      <CalendarDaySessionPicker
        localDate="2026-08-12"
        sessionIds={['s1', 's2']}
        planDayNames={['Push Day', null]}
        testID="picker"
      />,
    );

    await fireEvent.press(getByTestId('picker-row-s2'));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/history/[sessionId]',
      params: { sessionId: 's2' },
    });
    expect(useSheetStore.getState().current).toBeNull();
  });
});
