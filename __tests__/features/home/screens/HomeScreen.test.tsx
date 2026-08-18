import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import type { DatabaseContext } from '@/repositories/contracts/database';
import { HomeScreen } from '@/features/home/screens/HomeScreen';
import { ContainerProvider, createContainer, type AppContainer } from '@/services/container';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn() },
}));

jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

const START = Date.UTC(2026, 7, 18, 12, 0, 0);

async function insertExercise(db: DatabaseContext, id = 'ex-1'): Promise<string> {
  await db.run(
    `INSERT INTO exercise (id, source, name_en, name_search, tracking_type, created_at, updated_at)
     VALUES (?, 'catalog', 'Bench Press', 'bench press', 'weight_reps', ?, ?)`,
    [id, START, START],
  );
  return id;
}

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

let activeQueryClient: QueryClient | undefined;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient?.unmount();
  activeQueryClient = undefined;
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

  return render(<HomeScreen />, { wrapper: Wrapper });
}

describe('HomeScreen', () => {
  it('announces loading, then transitions from the skeleton to the populated dashboard', async () => {
    const container = createContainer(createTestDatabase());
    const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

    const { findByTestId, queryByTestId } = await renderScreen(container);

    expect(announceSpy).toHaveBeenCalledWith('Loading');

    await waitFor(() => expect(queryByTestId('home-active-plan-card')).toBeTruthy());
    expect(await findByTestId('home-last-workout-card')).toBeTruthy();
    expect(await findByTestId('home-streak-card')).toBeTruthy();
    expect(await findByTestId('home-latest-pr-card')).toBeTruthy();
    expect(await findByTestId('home-weekly-summary-card')).toBeTruthy();
  });

  it('shows an error state with retry when the dashboard query fails, and refetches on retry', async () => {
    const container = createContainer(createTestDatabase());
    const getTrainingLocalDatesSpy = jest
      .spyOn(container.homeDashboardRepository, 'getTrainingLocalDates')
      .mockRejectedValueOnce(new Error('boom'));

    const { findByText } = await renderScreen(container);

    expect(await findByText('Could not load your dashboard.')).toBeTruthy();

    await fireEvent.press(await findByText('Try again'));

    await waitFor(() => expect(getTrainingLocalDatesSpy).toHaveBeenCalledTimes(2));
  });

  it('wires pull-to-refresh (isRefetching, not the initial isPending) to a real refetch', async () => {
    const container = createContainer(createTestDatabase());
    const getTrainingLocalDatesSpy = jest.spyOn(
      container.homeDashboardRepository,
      'getTrainingLocalDates',
    );

    const { findByTestId } = await renderScreen(container);
    await findByTestId('home-active-plan-card');
    expect(getTrainingLocalDatesSpy).toHaveBeenCalledTimes(1);

    // `RefreshControl` is handed to `ScrollView` as a prop, not rendered as a
    // queryable host node with its own testID (RNTL's v14 host-only tree
    // renders it as an opaque `RCTRefreshControl` leaf with no props) - the
    // real React element (and its real `onRefresh` callback) lives on the
    // `ScrollView` host node's own `props.refreshControl` instead, one level
    // up. `home-screen`'s single host child is that `ScrollView`.
    const screen = await findByTestId('home-screen');
    const scrollView = screen.children[0];
    if (scrollView === undefined || typeof scrollView === 'string') {
      throw new Error('expected the Screen to render a ScrollView child');
    }
    const onRefresh = (scrollView.props.refreshControl as { props: { onRefresh: () => void } })
      .props.onRefresh;

    await act(async () => {
      onRefresh();
    });

    await waitFor(() => expect(getTrainingLocalDatesSpy).toHaveBeenCalledTimes(2));
  });

  it('renders a real active plan and last workout through the container, and navigates to the history detail route on tap', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const plan = await container.planService.createPlan({ name: 'Push Pull Legs' });
    const day = await container.planService.addDay(plan.id, { name: 'Push Day' });
    await container.planService.setActivePlan(plan.id);
    const sessionId = await finishASession(container, START, 'Push Day');

    const { findByText, findByTestId } = await renderScreen(container);

    expect(await findByText('Push Pull Legs')).toBeTruthy();
    // A single-day plan has no "change day" action; "Next up" names the only day.
    expect(await findByText(`Next up: ${day.name}`)).toBeTruthy();

    await fireEvent.press(await findByTestId('home-last-workout-card'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/history/[sessionId]',
      params: { sessionId },
    });
  });

  it('navigates to the plan detail route when "Open plan" is pressed for an active plan with zero days', async () => {
    const container = createContainer(createTestDatabase());
    const plan = await container.planService.createPlan({ name: 'Empty Plan' });
    await container.planService.setActivePlan(plan.id);

    const { findByText } = await renderScreen(container);

    expect(await findByText('Empty Plan has no days yet.')).toBeTruthy();
    await fireEvent.press(await findByText('Open plan'));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/plans/[planId]',
      params: { planId: plan.id },
    });
  });

  it('navigates to Plans when "Go to Plans" is pressed with no active plan', async () => {
    const container = createContainer(createTestDatabase());

    const { findByText } = await renderScreen(container);

    await fireEvent.press(await findByText('Go to Plans'));
    expect(router.push).toHaveBeenCalledWith('/plans');
  });
});
