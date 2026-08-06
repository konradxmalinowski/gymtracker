import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { DraggableList } from '@/components/gestures/DraggableList';

interface Exercise {
  id: string;
  name: string;
}

const ITEMS: Exercise[] = [
  { id: '1', name: 'Bench press' },
  { id: '2', name: 'Squat' },
];

const THREE_ITEMS: Exercise[] = [
  { id: '1', name: 'Bench press' },
  { id: '2', name: 'Squat' },
  { id: '3', name: 'Deadlift' },
];

interface JsonNode {
  type?: string;
  props?: Record<string, unknown>;
  children?: (JsonNode | string)[] | null;
}

/** Same helper `SwipeableRow.test.tsx` uses for the identical `accessibilityActions`-on-a-cloned-child shape - collects every node carrying `propName`, in render order, rather than stopping at the first (this file's rows all carry it). */
function findAllByProp(node: JsonNode | string | null, propName: string): JsonNode[] {
  if (node == null || typeof node === 'string') {
    return [];
  }
  const self = node.props && propName in node.props ? [node] : [];
  const fromChildren = (node.children ?? []).flatMap((child) => findAllByProp(child, propName));
  return [...self, ...fromChildren];
}

/**
 * Like SwipeableRow, the actual reorder math runs inside Reanimated pan
 * worklets on the UI thread - not meaningfully simulated under RNTL/jsdom
 * (per the task's own guidance, this is smoke coverage, not a gesture
 * simulation). FlashList schedules a post-mount layout callback through a
 * mocked `requestAnimationFrame` that lands just outside the initial
 * `render()`'s `act()` scope - wrapping the assertion in `act()` with a
 * short async flush absorbs that internal update instead of leaking an
 * "update not wrapped in act()" warning into the suite.
 */
describe('DraggableList', () => {
  it('renders every row via renderItem', async () => {
    let getByText: (text: string) => unknown = () => null;
    await act(async () => {
      const result = await render(
        <DraggableList
          data={ITEMS}
          keyExtractor={(item) => item.id}
          renderItem={(item) => <Text>{item.name}</Text>}
          onReorder={() => {}}
          rowHeight={56}
        />,
      );
      getByText = result.getByText;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(getByText('Bench press')).toBeTruthy();
    expect(getByText('Squat')).toBeTruthy();
  });

  it('exposes an adjustable drag handle role on every row when dragHandle="handle"', async () => {
    let getAllByRole: (role: string, options?: { name?: string }) => unknown[] = () => [];
    await act(async () => {
      const result = await render(
        <DraggableList
          data={ITEMS}
          keyExtractor={(item) => item.id}
          renderItem={(item, _index, dragHandle) => (
            <>
              <Text>{item.name}</Text>
              {dragHandle}
            </>
          )}
          onReorder={() => {}}
          rowHeight={56}
          dragHandle="handle"
        />,
      );
      getAllByRole = result.getAllByRole;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(getAllByRole('adjustable', { name: 'Drag to reorder' })).toHaveLength(ITEMS.length);
  });

  it('exposes a drag handle label on every row when dragHandle="handle"', async () => {
    let getAllByLabelText: (label: string) => unknown[] = () => [];
    await act(async () => {
      const result = await render(
        <DraggableList
          data={ITEMS}
          keyExtractor={(item) => item.id}
          renderItem={(item, _index, dragHandle) => (
            <>
              <Text>{item.name}</Text>
              {dragHandle}
            </>
          )}
          onReorder={() => {}}
          rowHeight={56}
          dragHandle="handle"
        />,
      );
      getAllByLabelText = result.getAllByLabelText;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(getAllByLabelText('Drag to reorder')).toHaveLength(ITEMS.length);
  });

  /**
   * The mandatory non-gesture reorder alternative (CLAUDE.md's "Known gaps" -
   * this exact phase's task brief names it as the one that must close this
   * gap before shipping). A screen-reader or switch-control user reorders
   * a row through these two actions; the boundary rows correctly expose
   * only the one action that applies to them (the first row can't move up,
   * the last can't move down), matching `SwipeableRow`'s own conditional
   * left/right action construction.
   */
  it('exposes move-up/move-down accessibility actions, omitting whichever is out of bounds', async () => {
    let toJSON: () => unknown = () => null;
    await act(async () => {
      const result = await render(
        <DraggableList
          data={THREE_ITEMS}
          keyExtractor={(item) => item.id}
          renderItem={(item) => <Text>{item.name}</Text>}
          onReorder={() => {}}
          rowHeight={56}
        />,
      );
      toJSON = result.toJSON;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const rows = findAllByProp(toJSON() as JsonNode, 'accessibilityActions');
    expect(rows).toHaveLength(THREE_ITEMS.length);

    const actionNames = (row: JsonNode) =>
      (row.props?.accessibilityActions as { name: string }[]).map((action) => action.name);

    expect(actionNames(rows[0]!)).toEqual(['moveDown']);
    expect(actionNames(rows[1]!)).toEqual(['moveUp', 'moveDown']);
    expect(actionNames(rows[2]!)).toEqual(['moveUp']);
  });

  it('reorders via onAccessibilityAction the same way a completed drag would', async () => {
    const onReorder = jest.fn();
    let toJSON: () => unknown = () => null;
    await act(async () => {
      const result = await render(
        <DraggableList
          data={THREE_ITEMS}
          keyExtractor={(item) => item.id}
          renderItem={(item) => <Text>{item.name}</Text>}
          onReorder={onReorder}
          rowHeight={56}
        />,
      );
      toJSON = result.toJSON;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const rows = findAllByProp(toJSON() as JsonNode, 'accessibilityActions');
    // Move the middle row ("Squat", id "2") up one slot.
    const handleAction = rows[1]!.props!.onAccessibilityAction as (event: {
      nativeEvent: { actionName: string };
    }) => void;

    handleAction({ nativeEvent: { actionName: 'moveUp' } });

    expect(onReorder).toHaveBeenCalledWith(['2', '1', '3']);
  });
});
