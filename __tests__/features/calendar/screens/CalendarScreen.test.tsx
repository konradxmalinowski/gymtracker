import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import type { DatabaseContext } from '@/repositories/contracts/database';
import { CalendarScreen } from '@/features/calendar/screens/CalendarScreen';
import type { CalendarRepository } from '@/features/calendar/repository/CalendarRepository';
import { ContainerProvider, createContainer, type AppContainer } from '@/services/container';
import { FixedClock } from '@/services/clock';
import { useSheetStore } from '@/stores/sheetStore';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
}));

jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

// Noon UTC on 2026-08-15 - the screen's initial month anchor derives from
// this via `clock.localDate()`, so every test lands on August 2026 by
// default with no month-navigation needed.
const TODAY = Date.UTC(2026, 7, 15, 12, 0, 0);

async function insertExercise(db: DatabaseContext, id = 'ex-1'): Promise<string> {
  await db.run(
    `INSERT INTO exercise (id, source, name_en, name_search, tracking_type, created_at, updated_at)
     VALUES (?, 'catalog', 'Bench Press', 'bench press', 'weight_reps', ?, ?)`,
    [id, TODAY, TODAY],
  );
  return id;
}

/** Starts, logs one real completed set on, and finishes a session at `startedAt` - mirrors `HomeScreen.test.tsx`'s own `finishASession` helper, since `CalendarRepository` (like `HomeDashboardRepository`) reads real session/set data through `v_session_summary`, not a denormalized override. */
async function finishASession(container: AppContainer, startedAt: number, title: string) {
  const started = await container.sessionService.startEmpty(startedAt, title);
  if (started.outcome !== 'started') {
    throw new Error('unreachable - fresh test database');
  }
  const sessionExercise = await container.sessionService.addExercise(started.session.id, 'ex-1');
  const workoutSet = await container.sessionService.appendSet(sessionExercise.id, {
    weightKg: 60,
    reps: 8,
  });
  await container.sessionService.completeSet(workoutSet.id, { weightKg: 60, reps: 8 });
  await container.sessionService.finish(started.session.id, startedAt + 60_000);
  return started.session.id;
}

function buildContainer(): AppContainer {
  return createContainer(createTestDatabase(), { clock: new FixedClock(TODAY) });
}

/** A fake repository whose both methods resolve empty - deterministic month AND year emptiness with no fixture seeding, mirroring `StatisticsScreen.test.tsx`'s own `buildFakeStatisticsRepository` pattern. */
function buildEmptyCalendarRepository(): jest.Mocked<CalendarRepository> {
  return {
    monthOverview: jest.fn().mockResolvedValue([]),
    yearOverview: jest.fn().mockResolvedValue([]),
  };
}

let activeQueryClient: QueryClient | undefined;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient?.unmount();
  activeQueryClient = undefined;
  useSheetStore.setState({ current: null, queue: [] });
  jest.clearAllMocks();
});

async function renderScreen(container: AppContainer) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  activeQueryClient = queryClient;

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ContainerProvider container={container}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ContainerProvider>
    );
  }

  return render(<CalendarScreen />, { wrapper: Wrapper });
}

describe('CalendarScreen', () => {
  it('announces loading, then the empty-month title, when the current month has zero trained days', async () => {
    const container = buildContainer();
    const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

    const { findByTestId } = await renderScreen(container);

    expect(announceSpy).toHaveBeenCalledWith('Loading');

    expect(await findByTestId('calendar-month-empty-state')).toBeTruthy();
    await waitFor(() => expect(announceSpy).toHaveBeenCalledWith('No training this month'));
  });

  it('still renders the full month grid alongside the empty state (not a blank grid)', async () => {
    const container = buildContainer();

    const { findByTestId } = await renderScreen(container);

    expect(await findByTestId('calendar-month-grid')).toBeTruthy();
    expect(await findByTestId('calendar-month-empty-state')).toBeTruthy();
  });

  it('does not show the empty state once the month has at least one trained day', async () => {
    const db = createTestDatabase();
    const container = createContainer(db, { clock: new FixedClock(TODAY) });
    await insertExercise(db);
    await finishASession(container, Date.UTC(2026, 7, 12, 9, 0, 0), 'Push Day');

    const { findByTestId, queryByTestId } = await renderScreen(container);

    await findByTestId('calendar-month-grid');
    await waitFor(() => expect(queryByTestId('calendar-month-empty-state')).toBeNull());
  });

  it('routes directly to the history detail screen when a day has exactly one completed session', async () => {
    const db = createTestDatabase();
    const container = createContainer(db, { clock: new FixedClock(TODAY) });
    await insertExercise(db);
    const sessionId = await finishASession(container, Date.UTC(2026, 7, 12, 9, 0, 0), 'Push Day');

    const { findByTestId } = await renderScreen(container);

    const dayCell = await findByTestId('calendar-month-grid-day-2026-08-12');
    await fireEvent.press(dayCell);

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/history/[sessionId]',
        params: { sessionId },
      }),
    );
    expect(useSheetStore.getState().current).toBeNull();
  });

  /**
   * Regression coverage for A11Y-P12-002 (`reports/accessibility-2026-08-19-p12.md`):
   * `CalendarScreen` previously announced the month-empty state but never
   * the year-empty one, so switching to "Year" view on a calendar with no
   * training data left VoiceOver/TalkBack silent instead of announcing
   * `CalendarYearHeatmapCard`'s own empty state. Uses a fake `CalendarRepository`
   * (both `monthOverview`/`yearOverview` resolving `[]`) rather than a real
   * container/fixture, since both queries need to be deterministically empty
   * with no session-seeding involved - the exact scenario the accessibility
   * review's own scratch test used to catch and confirm-fix the gap.
   */
  it('announces the year-empty title when switching to Year view on an empty calendar (A11Y-P12-002 regression)', async () => {
    const calendarRepository = buildEmptyCalendarRepository();
    const container = createContainer(createTestDatabase(), {
      clock: new FixedClock(TODAY),
      calendarRepository,
    });
    const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

    const { findByTestId, getByRole } = await renderScreen(container);

    await findByTestId('calendar-month-empty-state');
    announceSpy.mockClear();

    await fireEvent.press(getByRole('tab', { name: 'Year' }));

    expect(await findByTestId('calendar-year-heatmap-card-empty')).toBeTruthy();
    await waitFor(() => expect(announceSpy).toHaveBeenCalledWith('No training yet'));
  });

  it('opens the day-session picker sheet when a day has more than one completed session', async () => {
    const db = createTestDatabase();
    const container = createContainer(db, { clock: new FixedClock(TODAY) });
    await insertExercise(db);
    await finishASession(container, Date.UTC(2026, 7, 12, 9, 0, 0), 'Morning Push');
    await finishASession(container, Date.UTC(2026, 7, 12, 18, 0, 0), 'Evening Push');

    const { findByTestId } = await renderScreen(container);

    const dayCell = await findByTestId('calendar-month-grid-day-2026-08-12');
    await fireEvent.press(dayCell);

    await waitFor(() => expect(useSheetStore.getState().current?.id).toBe('calendar-day-sessions'));
    expect(router.push).not.toHaveBeenCalled();
  });
});
