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
});
