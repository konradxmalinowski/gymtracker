import { act, fireEvent, render } from '@testing-library/react-native';

import { DraggableList } from '@/components/gestures/DraggableList';
import { PlanCard } from '@/features/plans/components/PlanCard';
import type { PlanListItem } from '@/features/plans';

// See `__tests__/__mocks__/vectorIconsMock.tsx` for why this is a separate module.
jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

function plan(overrides: Partial<PlanListItem> = {}): PlanListItem {
  return {
    id: 'plan-1',
    name: 'Push Day',
    description: null,
    color: null,
    isActive: false,
    sortOrder: 0,
    dayCount: 3,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const PLANS: PlanListItem[] = [plan({ id: 'plan-1', name: 'Push Day' }), plan({ id: 'plan-2', name: 'Pull Day' })];

interface JsonNode {
  type?: string;
  props?: Record<string, unknown>;
  children?: (JsonNode | string)[] | null;
}

/** Same helper `DraggableList.test.tsx`/`SwipeableRow.test.tsx` use - collects every node carrying `propName`, in render order. */
function findAllByProp(node: JsonNode | string | null, propName: string): JsonNode[] {
  if (node == null || typeof node === 'string') {
    return [];
  }
  const self = node.props && propName in node.props ? [node] : [];
  const fromChildren = (node.children ?? []).flatMap((child) => findAllByProp(child, propName));
  return [...self, ...fromChildren];
}

function noop() {}

describe('PlanCard', () => {
  it('renders the plan name and day count', async () => {
    const { findByText } = await render(
      <PlanCard
        plan={plan()}
        onPress={() => {}}
        onToggleActive={() => {}}
        onRename={() => {}}
        onDuplicate={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(await findByText('Push Day')).toBeTruthy();
    expect(await findByText('3 days')).toBeTruthy();
  });

  it('shows the active badge only for the active plan', async () => {
    const inactive = await render(
      <PlanCard
        plan={plan({ isActive: false })}
        onPress={() => {}}
        onToggleActive={() => {}}
        onRename={() => {}}
        onDuplicate={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(inactive.queryByText('Active')).toBeNull();

    const active = await render(
      <PlanCard
        plan={plan({ isActive: true })}
        onPress={() => {}}
        onToggleActive={() => {}}
        onRename={() => {}}
        onDuplicate={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(active.queryByText('Active')).toBeTruthy();
  });

  it('fires each action callback without triggering onPress', async () => {
    const onPress = jest.fn();
    const onToggleActive = jest.fn();
    const onRename = jest.fn();
    const onDuplicate = jest.fn();
    const onDelete = jest.fn();

    const { findByTestId } = await render(
      <PlanCard
        plan={plan()}
        onPress={onPress}
        onToggleActive={onToggleActive}
        onRename={onRename}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        testID="plan-card"
      />,
    );

    await fireEvent.press(await findByTestId('plan-card-set-active'));
    await fireEvent.press(await findByTestId('plan-card-rename'));
    await fireEvent.press(await findByTestId('plan-card-duplicate'));
    await fireEvent.press(await findByTestId('plan-card-delete'));

    expect(onToggleActive).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  /**
   * Regression coverage for the exact failure an accessibility review found:
   * `DraggableList.test.tsx`'s own move-up/move-down tests only ever
   * exercised `attachMoveActions` against a bare `<Text>`, which forwards
   * arbitrary props natively - unlike a real component with a closed prop
   * interface. Mounting `DraggableList` with the actual `PlanCard` (not a
   * stand-in) is what would have caught `PressScale`/`PlanCard` silently
   * dropping `accessible`/`accessibilityActions`/`onAccessibilityAction`
   * instead of forwarding them to a native node.
   */
  describe('composed with DraggableList (integration - the regression class the unit tests missed)', () => {
    it('reaches a native node in dragHandle="row" mode, where the whole PlanCard is the target', async () => {
      let toJSON: () => unknown = () => null;
      await act(async () => {
        const result = await render(
          <DraggableList
            data={PLANS}
            keyExtractor={(item) => item.id}
            rowHeight={72}
            dragHandle="row"
            onReorder={() => {}}
            renderItem={(item) => (
              <PlanCard
                plan={item}
                onPress={noop}
                onToggleActive={noop}
                onRename={noop}
                onDuplicate={noop}
                onDelete={noop}
              />
            )}
          />,
        );
        toJSON = result.toJSON;
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const nodesWithActions = findAllByProp(toJSON() as JsonNode, 'accessibilityActions');
      expect(nodesWithActions.length).toBeGreaterThan(0);

      const actionNames = (nodesWithActions[0]!.props?.accessibilityActions as { name: string }[]).map(
        (action) => action.name,
      );
      expect(actionNames).toEqual(expect.arrayContaining(['moveDown']));
    });

    it('reaches a native node in dragHandle="handle" mode, matching PlanListScreen\'s actual wiring', async () => {
      let toJSON: () => unknown = () => null;
      await act(async () => {
        const result = await render(
          <DraggableList
            data={PLANS}
            keyExtractor={(item) => item.id}
            rowHeight={72}
            dragHandle="handle"
            onReorder={() => {}}
            renderItem={(item, _index, dragHandle) => (
              <PlanCard
                plan={item}
                dragHandle={dragHandle}
                onPress={noop}
                onToggleActive={noop}
                onRename={noop}
                onDuplicate={noop}
                onDelete={noop}
              />
            )}
          />,
        );
        toJSON = result.toJSON;
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const nodesWithActions = findAllByProp(toJSON() as JsonNode, 'accessibilityActions');
      expect(nodesWithActions.length).toBeGreaterThan(0);

      const actionNames = (nodesWithActions[0]!.props?.accessibilityActions as { name: string }[]).map(
        (action) => action.name,
      );
      expect(actionNames).toEqual(expect.arrayContaining(['moveDown']));
    });
  });
});
