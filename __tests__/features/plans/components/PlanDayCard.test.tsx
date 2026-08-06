import { act, render } from '@testing-library/react-native';

import { DraggableList } from '@/components/gestures/DraggableList';
import { PlanDayCard } from '@/features/plans/components/PlanDayCard';
import type { PlanDay } from '@/features/plans';

// See `__tests__/__mocks__/vectorIconsMock.tsx` for why this is a separate module.
jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

function day(overrides: Partial<PlanDay> = {}): PlanDay {
  return {
    id: 'day-1',
    planId: 'plan-1',
    name: 'Day 1',
    note: null,
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    exercises: [],
    ...overrides,
  };
}

const DAYS: PlanDay[] = [day({ id: 'day-1', name: 'Day 1' }), day({ id: 'day-2', name: 'Day 2' })];

function noop() {}

interface JsonNode {
  type?: string;
  props?: Record<string, unknown>;
  children?: (JsonNode | string)[] | null;
}

/** Same helper `PlanCard.test.tsx`/`DraggableList.test.tsx`/`SwipeableRow.test.tsx` use. */
function findAllByProp(node: JsonNode | string | null, propName: string): JsonNode[] {
  if (node == null || typeof node === 'string') {
    return [];
  }
  const self = node.props && propName in node.props ? [node] : [];
  const fromChildren = (node.children ?? []).flatMap((child) => findAllByProp(child, propName));
  return [...self, ...fromChildren];
}

describe('PlanDayCard composed with DraggableList (integration)', () => {
  it('reaches a native node in dragHandle="row" mode', async () => {
    let toJSON: () => unknown = () => null;
    await act(async () => {
      const result = await render(
        <DraggableList
          data={DAYS}
          keyExtractor={(item) => item.id}
          rowHeight={72}
          dragHandle="row"
          onReorder={() => {}}
          renderItem={(item) => (
            <PlanDayCard day={item} onPress={noop} onRename={noop} onDuplicate={noop} onDelete={noop} />
          )}
        />,
      );
      toJSON = result.toJSON;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const nodesWithActions = findAllByProp(toJSON() as JsonNode, 'accessibilityActions');
    expect(nodesWithActions.length).toBeGreaterThan(0);
  });

  it('reaches a native node (the drag handle) in dragHandle="handle" mode, matching PlanDetailScreen\'s actual wiring', async () => {
    let toJSON: () => unknown = () => null;
    await act(async () => {
      const result = await render(
        <DraggableList
          data={DAYS}
          keyExtractor={(item) => item.id}
          rowHeight={72}
          dragHandle="handle"
          onReorder={() => {}}
          renderItem={(item, _index, dragHandle) => (
            <PlanDayCard
              day={item}
              dragHandle={dragHandle}
              onPress={noop}
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
  });
});
