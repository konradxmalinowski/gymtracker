import { fireEvent, render } from '@testing-library/react-native';

import { assignSetDisplayNumbers } from '@/features/workout-logging';
import type { WorkoutSet } from '@/features/workout-logging';
import { SetRow } from '@/features/workout-logging/components/SetRow';

interface JsonNode {
  type?: string;
  props?: Record<string, unknown>;
  children?: (JsonNode | string)[] | null;
}

function findByProp(node: JsonNode | string | null, propName: string): JsonNode | null {
  if (node == null || typeof node === 'string') {
    return null;
  }
  if (node.props && propName in node.props) {
    return node;
  }
  for (const child of node.children ?? []) {
    const found = findByProp(child, propName);
    if (found) {
      return found;
    }
  }
  return null;
}

function makeSet(overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: 'set-1',
    sessionExerciseId: 'se-1',
    sessionId: 'session-1',
    exerciseId: 'ex-1',
    setIndex: 1,
    setType: 'normal',
    parentSetId: null,
    weightKg: 60,
    reps: 8,
    durationSeconds: null,
    distanceM: null,
    rpe: null,
    isCompleted: false,
    completedAt: null,
    performedAt: 1000,
    note: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

async function renderRow(overrides: Partial<Parameters<typeof SetRow>[0]> = {}) {
  const workoutSet = overrides.set ?? makeSet();
  const displayNumber =
    overrides.displayNumber ??
    assignSetDisplayNumbers([
      { id: workoutSet.id, setIndex: workoutSet.setIndex, parentSetId: workoutSet.parentSetId },
    ]).get(workoutSet.id)!;

  const handlers = {
    onFocus: jest.fn(),
    onComplete: jest.fn(),
    onUncomplete: jest.fn(),
    onUpdate: jest.fn(),
    onDelete: jest.fn(),
    onAddDropSet: jest.fn(),
  };

  const utils = await render(
    <SetRow
      set={workoutSet}
      displayNumber={displayNumber}
      isFocused={false}
      onFocus={handlers.onFocus}
      onComplete={handlers.onComplete}
      onUncomplete={handlers.onUncomplete}
      onUpdate={handlers.onUpdate}
      onDelete={handlers.onDelete}
      onAddDropSet={handlers.onAddDropSet}
      testID="set-row"
      {...overrides}
    />,
  );

  return { ...utils, ...handlers, workoutSet };
}

describe('SetRow', () => {
  it('renders the display number and the pre-filled weight/reps', async () => {
    const { findByText, findByTestId } = await renderRow();
    expect(await findByText('1')).toBeTruthy();
    expect(await findByTestId('set-row-weight')).toBeTruthy();
    expect(await findByTestId('set-row-reps')).toBeTruthy();
  });

  it('tapping the incomplete checkbox calls onComplete with the current set', async () => {
    const { findByTestId, onComplete, workoutSet } = await renderRow();
    fireEvent.press(await findByTestId('set-row-complete'));
    expect(onComplete).toHaveBeenCalledWith(workoutSet);
  });

  it('tapping a completed checkbox calls onUncomplete with the set id', async () => {
    const { findByTestId, onUncomplete, workoutSet } = await renderRow({
      set: makeSet({ isCompleted: true }),
    });
    fireEvent.press(await findByTestId('set-row-complete'));
    expect(onUncomplete).toHaveBeenCalledWith(workoutSet.id);
  });

  it('tapping the leading number/badge area calls onFocus with the set id', async () => {
    const { findByText, onFocus, workoutSet } = await renderRow();
    fireEvent.press(await findByText('1'));
    expect(onFocus).toHaveBeenCalledWith(workoutSet.id);
  });

  it('exposes delete and edit as accessibility actions (non-gesture path for the swipe affordances)', async () => {
    const { toJSON } = await renderRow();
    const node = findByProp(toJSON() as JsonNode, 'accessibilityActions');
    const actions = node?.props?.accessibilityActions as { name: string; label: string }[];
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'leftAction', label: 'Delete set' }),
        expect.objectContaining({ name: 'rightAction', label: 'Edit set' }),
      ]),
    );
  });

  it('drop segments render indented, badged as "Drop" instead of a set-type pill, and get no "add drop set" action', async () => {
    const parent = makeSet({ id: 'parent-1', setIndex: 3 });
    const drop = makeSet({ id: 'drop-1', setIndex: 3, parentSetId: 'parent-1', setType: 'drop' });
    const displayNumber = assignSetDisplayNumbers([
      { id: parent.id, setIndex: parent.setIndex, parentSetId: null },
      { id: drop.id, setIndex: drop.setIndex, parentSetId: 'parent-1' },
    ]).get(drop.id)!;

    const { findByText } = await renderRow({ set: drop, displayNumber });
    // `assignSetDisplayNumbers` numbers parents 1..n by their position in
    // the input, not by `setIndex` - with a single parent given here, the
    // drop's label is "1.1" (see that function's own doc comment).
    expect(await findByText('1.1')).toBeTruthy();
    expect(await findByText('Drop')).toBeTruthy();
  });
});
