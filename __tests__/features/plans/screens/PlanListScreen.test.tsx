import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import { PlanListScreen } from '@/features/plans/screens/PlanListScreen';
import { ContainerProvider, createContainer, type AppContainer } from '@/services/container';

// `BottomSheet` (mounted unconditionally by `PlanListScreen`, just
// `visible={false}` until a sheet is opened) reads `useSafeAreaInsets`
// unconditionally, which throws without a `SafeAreaProvider` ancestor -
// `initialMetrics` skips the native measurement round trip Jest has no
// native side for.
const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn() },
}));

// See `__tests__/__mocks__/vectorIconsMock.tsx` for why this is a separate module.
jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

interface JsonNode {
  type?: string;
  props?: Record<string, unknown>;
  children?: (JsonNode | string)[] | null;
}

/** Same helper `DraggableList.test.tsx`/`PlanCard.test.tsx`/`SwipeableRow.test.tsx` use. */
function findAllByProp(node: JsonNode | string | null, propName: string): JsonNode[] {
  if (node == null || typeof node === 'string') {
    return [];
  }
  const self = node.props && propName in node.props ? [node] : [];
  const fromChildren = (node.children ?? []).flatMap((child) => findAllByProp(child, propName));
  return [...self, ...fromChildren];
}

let activeQueryClient: QueryClient | undefined;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient?.unmount();
  activeQueryClient = undefined;
  jest.clearAllMocks();
});

async function renderPlanListScreen(options?: { container?: AppContainer }) {
  const container = options?.container ?? createContainer(createTestDatabase());
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  activeQueryClient = queryClient;

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <ContainerProvider container={container}>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </ContainerProvider>
      </SafeAreaProvider>
    );
  }

  const view = await render(<PlanListScreen />, { wrapper: Wrapper });
  return { ...view, container };
}

describe('PlanListScreen', () => {
  it('shows the empty state when there are no plans yet', async () => {
    const { findByText } = await renderPlanListScreen();

    expect(await findByText('No plans yet')).toBeTruthy();
  });

  it('renders a created plan in the list', async () => {
    const container = createContainer(createTestDatabase());
    await container.planService.createPlan({ name: 'Push Day' });

    const { findByText } = await renderPlanListScreen({ container });

    expect(await findByText('Push Day')).toBeTruthy();
  });

  it('navigates to the plan detail screen when a card is pressed', async () => {
    const container = createContainer(createTestDatabase());
    const created = await container.planService.createPlan({ name: 'Push Day' });

    const { findByTestId } = await renderPlanListScreen({ container });

    await fireEvent.press(await findByTestId(`plan-card-${created.id}`));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/plans/[planId]',
      params: { planId: created.id },
    });
  });

  it('sets a plan active from its row without navigating to the detail screen', async () => {
    const container = createContainer(createTestDatabase());
    const created = await container.planService.createPlan({ name: 'Push Day' });

    const { findByTestId } = await renderPlanListScreen({ container });

    await fireEvent.press(await findByTestId(`plan-card-${created.id}-set-active`));

    await waitFor(async () => {
      const plan = await container.planService.getPlan(created.id);
      expect(plan?.isActive).toBe(true);
    });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('creates a plan through the create sheet and navigates to its detail screen', async () => {
    const { findByTestId, findByText } = await renderPlanListScreen();

    await fireEvent.press(await findByText('New plan'));
    const field = await findByTestId('plan-name-sheet-field');
    fireEvent.changeText(field, 'Leg Day');
    await fireEvent.press(await findByTestId('plan-name-sheet-save'));

    await waitFor(() => expect(router.push).toHaveBeenCalled());
    const pushedArg = (router.push as jest.Mock).mock.calls[0]?.[0] as {
      pathname: string;
      params: { planId: string };
    };
    expect(pushedArg.pathname).toBe('/plans/[planId]');
  });

  /**
   * Real-screen confirmation for the move-up/move-down accessibility fix
   * (an accessibility review found the mechanism worked in isolation but
   * never reached a native node through this screen's actual `PlanCard` +
   * `PressScale` wiring - see `PlanCard.test.tsx`'s dedicated regression
   * tests for the component-level fix this asserts end-to-end).
   */
  it('exposes a move-down accessibility action on a real rendered row', async () => {
    const container = createContainer(createTestDatabase());
    await container.planService.createPlan({ name: 'Push Day' });
    await container.planService.createPlan({ name: 'Pull Day' });

    const { toJSON, findByText } = await renderPlanListScreen({ container });
    await findByText('Push Day');

    const nodesWithActions = findAllByProp(toJSON() as JsonNode, 'accessibilityActions');
    expect(nodesWithActions.length).toBeGreaterThan(0);
  });
});
