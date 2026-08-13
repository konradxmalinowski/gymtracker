import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import { AccessibilityInfo } from 'react-native';
import type { ReactNode } from 'react';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import type { DatabaseContext } from '@/repositories/contracts/database';
import { WorkoutSummaryScreen } from '@/features/workout-logging/screens/WorkoutSummaryScreen';
import { sessionSummaryKeys } from '@/features/workout-logging/hooks/useSessionHistory';
import { ContainerProvider, createContainer, type AppContainer } from '@/services/container';
import { useToastStore } from '@/stores/toastStore';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
}));

jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(async () => 'file:///tmp/summary.png'),
}));

// `expo-sharing`'s exports are not writable/configurable (jest-expo's own
// module mocking freezes them), so `jest.spyOn(Sharing, ...)` throws
// "Cannot redefine property" - the whole module is replaced instead, the
// same way `react-native-view-shot` is above.
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

const START = Date.UTC(2026, 7, 6, 18, 0, 0);

async function insertExercise(db: DatabaseContext, id = 'ex-1'): Promise<string> {
  await db.run(
    `INSERT INTO exercise (id, source, name_en, name_search, tracking_type, created_at, updated_at)
     VALUES (?, 'catalog', 'Bench Press', 'bench press', 'weight_reps', ?, ?)`,
    [id, START, START],
  );
  return id;
}

/** A real finished session with one completed set that earns at least one PR. */
async function finishASessionWithAPR(container: AppContainer) {
  const started = await container.sessionService.startEmpty(START, 'Push Day');
  if (started.outcome !== 'started') {
    throw new Error('unreachable - fresh test database');
  }
  const sessionExercise = await container.sessionService.addExercise(started.session.id, 'ex-1');
  const workoutSet = await container.sessionService.appendSet(sessionExercise.id, {
    weightKg: 100,
    reps: 5,
  });
  await container.sessionService.completeSet(workoutSet.id, { weightKg: 100, reps: 5 });
  return { sessionId: started.session.id };
}

interface JsonNode {
  type?: string;
  props?: Record<string, unknown>;
  children?: (JsonNode | string)[] | null;
}

/**
 * Walks the rendered tree from root to the node with `testID`, returning
 * every node on that path (root first, target last) - the same "ancestor
 * chain" the A11Y-P9-001 finding's own RNTL prop-tree dump inspected, so a
 * hiding prop set anywhere above the target (not just on the target itself)
 * is detected.
 */
function findPathToTestID(
  node: JsonNode | string | null,
  testID: string,
  path: JsonNode[] = [],
): JsonNode[] | null {
  if (node == null || typeof node === 'string') {
    return null;
  }
  const nextPath = [...path, node];
  if (node.props?.testID === testID) {
    return nextPath;
  }
  for (const child of node.children ?? []) {
    const found = findPathToTestID(child, testID, nextPath);
    if (found) {
      return found;
    }
  }
  return null;
}

let activeQueryClient: QueryClient | undefined;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient?.unmount();
  activeQueryClient = undefined;
  useToastStore.setState({ current: null });
  jest.clearAllMocks();
});

async function renderSummaryScreen(container: AppContainer, sessionId: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 60_000 },
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

  const view = await render(<WorkoutSummaryScreen sessionId={sessionId} />, { wrapper: Wrapper });
  return { ...view, queryClient };
}

describe('WorkoutSummaryScreen', () => {
  it('renders the seeded SessionSummary totals and a PR badge with no extra request', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const { sessionId } = await finishASessionWithAPR(container);
    const summary = await container.sessionService.finish(sessionId, START + 60_000);
    const getSessionSpy = jest.spyOn(container.sessionService, 'getSession');

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 60_000 },
        mutations: { retry: false, gcTime: 0 },
      },
    });
    activeQueryClient = queryClient;
    queryClient.setQueryData(sessionSummaryKeys.detail(sessionId), summary);

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <ContainerProvider container={container}>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </ContainerProvider>
      );
    }

    const { findByTestId, findAllByText } = await render(
      <WorkoutSummaryScreen sessionId={sessionId} />,
      { wrapper: Wrapper },
    );

    await findByTestId('workout-summary-duration');
    // "Push Day" renders twice - once in the on-screen body, once in the
    // off-screen `ShareableSummaryCard` - so this asserts "at least one",
    // the same "several rows can share a label" precedent
    // `PersonalRecordsScreen.test.tsx` already established for its own
    // multi-match assertions.
    expect((await findAllByText('Push Day')).length).toBeGreaterThan(0);
    expect(summary.newPRs.length).toBeGreaterThan(0);
    expect(await findByTestId('workout-summary-pr-badge')).toBeTruthy();
    // `getSession` is still called once, in parallel, for the exercise
    // count (`SessionSummary` itself has no such field) - not zero times.
    await waitFor(() => expect(getSessionSpy).toHaveBeenCalledTimes(1));
  });

  it('falls back to getSession() with no PR badge when the cache is cold', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const { sessionId } = await finishASessionWithAPR(container);
    await container.sessionService.finish(sessionId, START + 60_000);

    const { findByTestId, queryByTestId } = await renderSummaryScreen(container, sessionId);

    await findByTestId('workout-summary-duration');
    expect(queryByTestId('workout-summary-pr-badge')).toBeNull();
  });

  it('"Done" replaces the route with Home', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const { sessionId } = await finishASessionWithAPR(container);
    await container.sessionService.finish(sessionId, START + 60_000);

    const { findByTestId } = await renderSummaryScreen(container, sessionId);
    await fireEvent.press(await findByTestId('workout-summary-done-button'));

    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('shares the captured image once the off-screen card has laid out', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const { sessionId } = await finishASessionWithAPR(container);
    await container.sessionService.finish(sessionId, START + 60_000);

    const shareSpy = Sharing.shareAsync as jest.Mock;
    shareSpy.mockResolvedValue(undefined);
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);

    const { findByTestId } = await renderSummaryScreen(container, sessionId);
    // A11Y-P9-001's fix hides this off-screen capture target from the
    // accessibility tree, which RNTL also excludes from default queries -
    // `includeHiddenElements` reaches it here the same way a real
    // `captureRef` call reaches it despite the hide.
    const card = await findByTestId('workout-summary-share-card', { includeHiddenElements: true });
    fireEvent(card, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 420 } },
    });

    await fireEvent.press(await findByTestId('workout-summary-share-button'));

    await waitFor(() => expect(captureRef).toHaveBeenCalled());
    await waitFor(() =>
      expect(shareSpy).toHaveBeenCalledWith('file:///tmp/summary.png', expect.any(Object)),
    );
  });

  it('degrades to a toast, never a thrown error, when sharing is unavailable on this device', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const { sessionId } = await finishASessionWithAPR(container);
    await container.sessionService.finish(sessionId, START + 60_000);

    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
    const shareSpy = Sharing.shareAsync as jest.Mock;

    const { findByTestId } = await renderSummaryScreen(container, sessionId);
    // A11Y-P9-001's fix hides this off-screen capture target from the
    // accessibility tree, which RNTL also excludes from default queries -
    // `includeHiddenElements` reaches it here the same way a real
    // `captureRef` call reaches it despite the hide.
    const card = await findByTestId('workout-summary-share-card', { includeHiddenElements: true });
    fireEvent(card, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 420 } },
    });

    await fireEvent.press(await findByTestId('workout-summary-share-button'));

    await waitFor(() => {
      expect(useToastStore.getState().current?.message).toBe(
        'Sharing is not available on this device.',
      );
    });
    expect(shareSpy).not.toHaveBeenCalled();
    expect(captureRef).not.toHaveBeenCalled();
  });

  it('degrades to a toast, never a thrown error, when capture itself fails', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const { sessionId } = await finishASessionWithAPR(container);
    await container.sessionService.finish(sessionId, START + 60_000);

    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (captureRef as jest.Mock).mockRejectedValueOnce(new Error('native capture failed'));

    const { findByTestId } = await renderSummaryScreen(container, sessionId);
    // A11Y-P9-001's fix hides this off-screen capture target from the
    // accessibility tree, which RNTL also excludes from default queries -
    // `includeHiddenElements` reaches it here the same way a real
    // `captureRef` call reaches it despite the hide.
    const card = await findByTestId('workout-summary-share-card', { includeHiddenElements: true });
    fireEvent(card, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 420 } },
    });

    await fireEvent.press(await findByTestId('workout-summary-share-button'));

    await waitFor(() => {
      expect(useToastStore.getState().current?.message).toBe(
        'Could not create a shareable image. Please try again.',
      );
    });
  });

  it('announces "Loading" for screen readers while the summary is still pending (A11Y-P9-002 regression)', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const { sessionId } = await finishASessionWithAPR(container);
    await container.sessionService.finish(sessionId, START + 60_000);

    const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

    const { findByTestId } = await renderSummaryScreen(container, sessionId);
    await findByTestId('workout-summary-duration');

    expect(announceSpy).toHaveBeenCalledWith('Loading');
  });

  it('hides the off-screen ShareableSummaryCard from the accessibility tree (A11Y-P9-001 regression)', async () => {
    // Regression test for A11Y-P9-001: the off-screen share-capture wrapper
    // had no accessibility-hiding prop anywhere in its ancestor chain, so a
    // VoiceOver/TalkBack user swiping through the screen would reach a full
    // second read-through of the same summary. See
    // reports/accessibility-2026-08-13-p9.md for the original finding.
    const db = createTestDatabase();
    const container = createContainer(db);
    await insertExercise(db);
    const { sessionId } = await finishASessionWithAPR(container);
    await container.sessionService.finish(sessionId, START + 60_000);

    const { findByTestId, queryByTestId, toJSON } = await renderSummaryScreen(container, sessionId);
    await findByTestId('workout-summary-duration');

    // RNTL (v14+) excludes elements hidden from the accessibility tree from
    // its default queries, so a plain lookup for the share card must now
    // come back empty - the same "unreachable" state a real VoiceOver/
    // TalkBack user would see. `includeHiddenElements: true` confirms the
    // node is still present (a hide, not a delete) - `captureRef` still
    // needs it laid out and rendered.
    expect(queryByTestId('workout-summary-share-card')).toBeNull();
    expect(
      queryByTestId('workout-summary-share-card', { includeHiddenElements: true }),
    ).not.toBeNull();

    // Direct prop-tree confirmation, mirroring the original finding's own
    // ancestor-chain dump.
    const path = findPathToTestID(toJSON() as JsonNode, 'workout-summary-share-card');
    expect(path).not.toBeNull();
    expect(
      path!.some(
        (node) =>
          node.props?.accessibilityElementsHidden === true &&
          node.props?.importantForAccessibility === 'no-hide-descendants',
      ),
    ).toBe(true);
  });
});
