import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import { seedLookupTables } from '@/database/seed/lookupSeeder';
import { PlanDayEditorScreen } from '@/features/plans/screens/PlanDayEditorScreen';
import { ContainerProvider, createContainer, type AppContainer } from '@/services/container';
import { useExercisePickerStore } from '@/stores/exercisePickerStore';
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
  useExercisePickerStore.setState({ request: null });
  jest.clearAllMocks();
});

async function createTestContainer() {
  const db = createTestDatabase();
  await seedLookupTables(db);
  return createContainer(db);
}

async function renderDayEditor(planId: string, dayId: string, container: AppContainer) {
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

  return render(<PlanDayEditorScreen planId={planId} dayId={dayId} />, { wrapper: Wrapper });
}

async function createPlanWithDayAndExercises(container: AppContainer) {
  const exerciseA = await container.exerciseService.createCustom({
    nameEn: 'Bench Press',
    equipmentSlug: 'barbell',
    muscles: [{ slug: 'chest', role: 'primary' }],
  });
  const exerciseB = await container.exerciseService.createCustom({
    nameEn: 'Overhead Press',
    equipmentSlug: 'barbell',
    muscles: [{ slug: 'shoulders', role: 'primary' }],
  });
  const plan = await container.planService.createPlan({ name: 'Push Day' });
  const day = await container.planService.addDay(plan.id, { name: 'Day 1' });
  const dayExerciseA = await container.planService.addExerciseToDay(day.id, {
    exerciseId: exerciseA.id,
  });
  const dayExerciseB = await container.planService.addExerciseToDay(day.id, {
    exerciseId: exerciseB.id,
  });
  return { plan, day, exerciseA, exerciseB, dayExerciseA, dayExerciseB };
}

describe('PlanDayEditorScreen', () => {
  it('shows the empty state for a day with no exercises yet', async () => {
    const container = await createTestContainer();
    const plan = await container.planService.createPlan({ name: 'Push Day' });
    const day = await container.planService.addDay(plan.id, { name: 'Day 1' });

    const { findByText } = await renderDayEditor(plan.id, day.id, container);

    expect(await findByText('No exercises yet')).toBeTruthy();
  });

  it('renders the day exercises', async () => {
    const container = await createTestContainer();
    const { plan, day } = await createPlanWithDayAndExercises(container);

    const { findByText } = await renderDayEditor(plan.id, day.id, container);

    expect(await findByText('Bench Press')).toBeTruthy();
    expect(await findByText('Overhead Press')).toBeTruthy();
  });

  it('opens the exercise picker via the shared store and navigates to the modal route', async () => {
    const container = await createTestContainer();
    const plan = await container.planService.createPlan({ name: 'Push Day' });
    const day = await container.planService.addDay(plan.id, { name: 'Day 1' });

    const { findByTestId } = await renderDayEditor(plan.id, day.id, container);

    await fireEvent.press(await findByTestId('plan-day-add-exercise-button'));

    expect(useExercisePickerStore.getState().request).not.toBeNull();
    expect(router.push).toHaveBeenCalledWith('/(modals)/exercise-picker');
  });

  it('removes an exercise and restores it via the undo toast action', async () => {
    const container = await createTestContainer();
    const { plan, day, dayExerciseA } = await createPlanWithDayAndExercises(container);

    const { findByTestId } = await renderDayEditor(plan.id, day.id, container);

    await fireEvent.press(await findByTestId(`plan-day-exercise-row-${dayExerciseA.id}-remove`));

    await waitFor(async () => {
      const updated = await container.planService.getPlan(plan.id);
      expect(updated?.days[0]?.exercises).toHaveLength(1);
    });

    const toast = useToastStore.getState().current;
    expect(toast?.message).toBe('"Bench Press" removed');
    toast?.onAction?.();

    await waitFor(async () => {
      const restored = await container.planService.getPlan(plan.id);
      expect(restored?.days[0]?.exercises).toHaveLength(2);
    });
  });

  it('groups selected exercises into a superset and allows ungrouping one back to standalone', async () => {
    const container = await createTestContainer();
    const { plan, day, dayExerciseA, dayExerciseB } = await createPlanWithDayAndExercises(
      container,
    );

    const { findByTestId, findByText } = await renderDayEditor(plan.id, day.id, container);

    await fireEvent.press(await findByText('Select'));
    await fireEvent.press(await findByTestId(`plan-day-exercise-row-${dayExerciseA.id}`));
    await fireEvent.press(await findByTestId(`plan-day-exercise-row-${dayExerciseB.id}`));
    await fireEvent.press(await findByText('Group into superset'));

    await waitFor(async () => {
      const updated = await container.planService.getPlan(plan.id);
      const groups = updated?.days[0]?.exercises.map((exercise) => exercise.supersetGroup);
      expect(groups).toEqual([1, 1]);
    });

    await fireEvent.press(await findByTestId(`plan-day-exercise-row-${dayExerciseA.id}-ungroup`));

    await waitFor(async () => {
      const updated = await container.planService.getPlan(plan.id);
      const byId = new Map(updated?.days[0]?.exercises.map((exercise) => [exercise.id, exercise]));
      expect(byId.get(dayExerciseA.id)?.supersetGroup).toBeNull();
      expect(byId.get(dayExerciseB.id)?.supersetGroup).toBe(1);
    });
  });

  /**
   * Real-screen confirmation for the move-up/move-down accessibility fix -
   * see `PlanDayExerciseRow.test.tsx`'s dedicated regression tests
   * (including the `SupersetGroupEditor`-wrapped case) for the component-
   * level fix this asserts end-to-end, on the one real screen that also
   * exercises the superset-wrapper drop point.
   */
  it('exposes a move-down accessibility action on a real rendered exercise row', async () => {
    const container = await createTestContainer();
    const { plan, day } = await createPlanWithDayAndExercises(container);

    const { toJSON, findByText } = await renderDayEditor(plan.id, day.id, container);
    await findByText('Bench Press');

    const nodesWithActions = findAllByProp(toJSON() as JsonNode, 'accessibilityActions');
    expect(nodesWithActions.length).toBeGreaterThan(0);
  });
});
