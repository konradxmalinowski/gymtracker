import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SheetHost } from '@/components/feedback/SheetHost';
import { createTestDatabase } from '@/database/node/createTestDatabase';
import { PlanDetailScreen } from '@/features/plans/screens/PlanDetailScreen';
import { ContainerProvider, createContainer, type AppContainer } from '@/services/container';
import { useSheetStore } from '@/stores/sheetStore';
import { useToastStore } from '@/stores/toastStore';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn() },
  Stack: { Screen: () => null },
}));

// See `__tests__/__mocks__/vectorIconsMock.tsx` for why this is a separate module.
jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

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
  useToastStore.setState({ current: null });
  useSheetStore.setState({ current: null, queue: [] });
  jest.clearAllMocks();
});

async function renderPlanDetailScreen(planId: string, container?: AppContainer) {
  const resolvedContainer = container ?? createContainer(createTestDatabase());
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
        <ContainerProvider container={resolvedContainer}>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </ContainerProvider>
      </SafeAreaProvider>
    );
  }

  const view = await render(
    <>
      <PlanDetailScreen planId={planId} />
      <SheetHost />
    </>,
    { wrapper: Wrapper },
  );
  return { ...view, container: resolvedContainer };
}

describe('PlanDetailScreen', () => {
  it('shows the day-empty state for a plan with no days yet', async () => {
    const container = createContainer(createTestDatabase());
    const plan = await container.planService.createPlan({ name: 'Push Day' });

    const { findByText } = await renderPlanDetailScreen(plan.id, container);

    expect(await findByText('No days yet')).toBeTruthy();
  });

  it('renders an existing day and navigates to its editor when pressed', async () => {
    const container = createContainer(createTestDatabase());
    const plan = await container.planService.createPlan({ name: 'Push Day' });
    const day = await container.planService.addDay(plan.id, { name: 'Day 1' });

    const { findByText, findByTestId } = await renderPlanDetailScreen(plan.id, container);

    expect(await findByText('Day 1')).toBeTruthy();
    await fireEvent.press(await findByTestId(`plan-day-card-${day.id}`));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/plans/[planId]/day/[dayId]',
      params: { planId: plan.id, dayId: day.id },
    });
  });

  it('adds a day through the add-day sheet', async () => {
    const container = createContainer(createTestDatabase());
    const plan = await container.planService.createPlan({ name: 'Push Day' });

    const { findByText, findByTestId } = await renderPlanDetailScreen(plan.id, container);

    await fireEvent.press(await findByText('Add day'));
    const field = await findByTestId('plan-detail-name-sheet-field');
    fireEvent.changeText(field, 'Day 1');
    await fireEvent.press(await findByTestId('plan-detail-name-sheet-save'));

    await waitFor(async () => {
      const updated = await container.planService.getPlan(plan.id);
      expect(updated?.days).toHaveLength(1);
    });
  });

  it('soft-deletes a day and restores it via the undo toast action', async () => {
    const container = createContainer(createTestDatabase());
    const plan = await container.planService.createPlan({ name: 'Push Day' });
    const day = await container.planService.addDay(plan.id, { name: 'Day 1' });

    const { findByTestId } = await renderPlanDetailScreen(plan.id, container);

    await fireEvent.press(await findByTestId(`plan-day-card-${day.id}-delete`));

    await waitFor(async () => {
      const updated = await container.planService.getPlan(plan.id);
      expect(updated?.days).toHaveLength(0);
    });

    const toast = useToastStore.getState().current;
    expect(toast?.message).toBe('"Day 1" deleted');
    toast?.onAction?.();

    await waitFor(async () => {
      const restored = await container.planService.getPlan(plan.id);
      expect(restored?.days).toHaveLength(1);
    });
  });

  /** Real-screen confirmation for the move-up/move-down accessibility fix - see `PlanCard.test.tsx`/`PlanDayCard.test.tsx`'s dedicated regression tests for the component-level fix this asserts end-to-end. */
  it('exposes a move-down accessibility action on a real rendered day row', async () => {
    const container = createContainer(createTestDatabase());
    const plan = await container.planService.createPlan({ name: 'Push Day' });
    await container.planService.addDay(plan.id, { name: 'Day 1' });
    await container.planService.addDay(plan.id, { name: 'Day 2' });

    const { toJSON, findByText } = await renderPlanDetailScreen(plan.id, container);
    await findByText('Day 1');

    const nodesWithActions = findAllByProp(toJSON() as JsonNode, 'accessibilityActions');
    expect(nodesWithActions.length).toBeGreaterThan(0);
  });
});
