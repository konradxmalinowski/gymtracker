import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { SwipeableRow } from '@/components/gestures/SwipeableRow';

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

/**
 * SwipeableRow's own visual response to the pan gesture runs entirely on
 * the UI thread inside Reanimated worklets (see the component's file
 * header) - simulating an actual finger drag isn't meaningful under
 * RNTL/jsdom, so this stays a smoke test plus the one thing that *is* real,
 * JS-thread-observable coverage: the `accessibilityActions` a screen-reader
 * or switch-control user relies on instead of the gesture (per the
 * component's own comment on why a raw pan gesture needs this fallback).
 */
describe('SwipeableRow', () => {
  it('renders its children', async () => {
    const { getByText } = await render(
      <SwipeableRow>
        <Text>Bench press</Text>
      </SwipeableRow>,
    );

    expect(getByText('Bench press')).toBeTruthy();
  });

  it('exposes accessibilityActions matching the configured left/right actions', async () => {
    const { toJSON } = await render(
      <SwipeableRow
        leftAction={{
          icon: <Text>{'i'}</Text>,
          label: 'Complete',
          color: 'green',
          onTrigger: () => {},
        }}
        rightAction={{
          icon: <Text>{'x'}</Text>,
          label: 'Delete',
          color: 'red',
          onTrigger: () => {},
        }}
      >
        <Text>Bench press</Text>
      </SwipeableRow>,
    );

    const outerView = findByProp(toJSON() as JsonNode, 'accessibilityActions');
    const actions = outerView?.props?.accessibilityActions as { name: string; label: string }[];

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'leftAction', label: 'Complete' }),
        expect.objectContaining({ name: 'rightAction', label: 'Delete' }),
      ]),
    );
  });

  it('invokes the matching action onTrigger through onAccessibilityAction', async () => {
    const onTriggerLeft = jest.fn();
    const onTriggerRight = jest.fn();
    const { toJSON } = await render(
      <SwipeableRow
        leftAction={{
          icon: <Text>{'i'}</Text>,
          label: 'Complete',
          color: 'green',
          onTrigger: onTriggerLeft,
        }}
        rightAction={{
          icon: <Text>{'x'}</Text>,
          label: 'Delete',
          color: 'red',
          onTrigger: onTriggerRight,
        }}
      >
        <Text>Bench press</Text>
      </SwipeableRow>,
    );

    const outerView = findByProp(toJSON() as JsonNode, 'accessibilityActions');
    const handleAction = outerView?.props?.onAccessibilityAction as (event: {
      nativeEvent: { actionName: string };
    }) => void;

    handleAction({ nativeEvent: { actionName: 'rightAction' } });
    expect(onTriggerRight).toHaveBeenCalledTimes(1);
    expect(onTriggerLeft).not.toHaveBeenCalled();

    handleAction({ nativeEvent: { actionName: 'leftAction' } });
    expect(onTriggerLeft).toHaveBeenCalledTimes(1);
  });
});
