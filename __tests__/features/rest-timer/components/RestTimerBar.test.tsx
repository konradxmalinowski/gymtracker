import { fireEvent, render } from '@testing-library/react-native';

import { RestTimerBar } from '@/features/rest-timer/components/RestTimerBar';
import { useRestTimerStore } from '@/stores/restTimerStore';

// See `__tests__/__mocks__/vectorIconsMock.tsx` for why this is a separate module.
jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

interface JsonNode {
  type?: string;
  props?: Record<string, unknown>;
  children?: (JsonNode | string)[] | null;
}

/** Same helper `PlanCard.test.tsx`/`DraggableList.test.tsx`/`SwipeableRow.test.tsx` use - collects every node carrying `propName`, in render order (parents before children). */
function findAllByProp(node: JsonNode | string | null, propName: string): JsonNode[] {
  if (node == null || typeof node === 'string') {
    return [];
  }
  const self = node.props && propName in node.props ? [node] : [];
  const fromChildren = (node.children ?? []).flatMap((child) => findAllByProp(child, propName));
  return [...self, ...fromChildren];
}

/** Counts how many nodes inside `node`'s own subtree (self included) carry one of `testIds` as their `testID`. */
function countTestIdsInSubtree(node: JsonNode | string | null, testIds: readonly string[]): number {
  if (node == null || typeof node === 'string') {
    return 0;
  }
  const matchesHere = testIds.includes(node.props?.testID as string) ? 1 : 0;
  const fromChildren = (node.children ?? []).reduce(
    (sum, child) => sum + countTestIdsInSubtree(child, testIds),
    0,
  );
  return matchesHere + fromChildren;
}

const NOW = 1_700_000_000_000;

function setRunningTimer(remainingSeconds: number, totalSeconds = 90) {
  useRestTimerStore.getState().setDeadline(NOW + remainingSeconds * 1000, totalSeconds, NOW);
}

describe('RestTimerBar', () => {
  beforeEach(() => {
    useRestTimerStore.getState().clearDeadline();
  });

  it('renders nothing while no timer is running', async () => {
    const { toJSON } = await render(
      <RestTimerBar
        deadlineAt={null}
        totalSeconds={90}
        onAdjust={() => {}}
        onSkip={() => {}}
        onOpenSettings={() => {}}
      />,
    );

    expect(toJSON()).toBeNull();
  });

  it('fires decrease, open-settings and increase independently, without either action bleeding into the other', async () => {
    setRunningTimer(60, 90);
    const onAdjust = jest.fn();
    const onOpenSettings = jest.fn();
    const onSkip = jest.fn();

    const { findByTestId } = await render(
      <RestTimerBar
        deadlineAt={NOW + 60_000}
        totalSeconds={90}
        onAdjust={onAdjust}
        onOpenSettings={onOpenSettings}
        onSkip={onSkip}
        testID="rest-timer-bar"
      />,
    );

    await fireEvent.press(await findByTestId('rest-timer-bar-decrease'));
    expect(onAdjust).toHaveBeenCalledTimes(1);
    expect(onAdjust).toHaveBeenCalledWith(-15);

    await fireEvent.press(await findByTestId('rest-timer-bar-open-settings'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);

    await fireEvent.press(await findByTestId('rest-timer-bar-increase'));
    expect(onAdjust).toHaveBeenCalledTimes(2);
    expect(onAdjust).toHaveBeenCalledWith(15);

    expect(onSkip).not.toHaveBeenCalled();
  });

  /**
   * Regression coverage for the exact P7 accessibility-review finding
   * (`reports/accessibility-2026-08-11-p7.md`, blocking): `SwipeableRow`
   * forces `accessible: true` plus `accessibilityActions` onto its single
   * child via `cloneElement` (`attachAccessibilityActions`), collapsing that
   * child's whole subtree into one native accessibility node. Before the
   * fix, `SwipeableRow`'s child was a plain `View` wrapping all three
   * controls (decrease, countdown, increase) - the two `AdjustDeltaButton`s
   * were still reachable via `fireEvent.press` under RNTL (which, per
   * `PlanCard.test.tsx`'s own comment on this exact class of bug, cannot
   * simulate the native engine's subtree-collapsing behavior) but would have
   * been unreachable to VoiceOver/TalkBack on a real device.
   *
   * The structural signal RNTL *can* verify is which node receives
   * `accessibilityActions` and what's nested inside it: in the fixed
   * component that node is the countdown `PressScale` itself (identified by
   * its own testID), with neither adjust button's testID anywhere in its
   * subtree - they live as siblings outside the swipeable region entirely.
   * This assertion fails against the pre-fix structure, where both adjust
   * buttons lived inside `SwipeableRow`'s one collapsed child.
   */
  it('attaches the swipe action to the countdown control only, not a wrapper containing the adjust buttons', async () => {
    setRunningTimer(60, 90);

    const { toJSON } = await render(
      <RestTimerBar
        deadlineAt={NOW + 60_000}
        totalSeconds={90}
        onAdjust={() => {}}
        onOpenSettings={() => {}}
        onSkip={() => {}}
        testID="rest-timer-bar"
      />,
    );

    const tree = toJSON() as JsonNode;
    const nodesWithActions = findAllByProp(tree, 'accessibilityActions');
    expect(nodesWithActions).toHaveLength(1);

    const swipeTarget = nodesWithActions[0]!;
    expect(swipeTarget.props?.testID).toBe('rest-timer-bar-open-settings');

    const nestedAdjustButtons = countTestIdsInSubtree(swipeTarget, [
      'rest-timer-bar-decrease',
      'rest-timer-bar-increase',
    ]);
    expect(nestedAdjustButtons).toBe(0);
  });
});
