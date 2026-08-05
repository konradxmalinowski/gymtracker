import { fireEvent, render } from '@testing-library/react-native';

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';

describe('ConfirmDialog', () => {
  it('never wires an onPress on any View while visible - the backdrop cannot be tap-dismissed', async () => {
    const { toJSON } = await render(
      <ConfirmDialog
        visible
        title="Delete set"
        message="This cannot be undone."
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    function collectViewsWithOnPress(node: unknown, acc: unknown[] = []): unknown[] {
      if (node == null || typeof node !== 'object') {
        return acc;
      }
      const element = node as {
        type?: string;
        props?: Record<string, unknown>;
        children?: unknown[];
      };
      if (element.type === 'View' && element.props?.onPress) {
        acc.push(element);
      }
      (element.children ?? []).forEach((child) => collectViewsWithOnPress(child, acc));
      return acc;
    }

    expect(collectViewsWithOnPress(toJSON())).toHaveLength(0);
  });

  it('maps the default cancel/confirm labels and fires onCancel/onConfirm independently', async () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    const { getByRole } = await render(
      <ConfirmDialog
        visible
        title="Delete set"
        message="This cannot be undone."
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    await fireEvent.press(getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    await fireEvent.press(getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('maps the hardware back button (onRequestClose) to onCancel, not a silent dismiss', async () => {
    const onCancel = jest.fn();
    const { root } = await render(
      <ConfirmDialog
        visible
        title="Delete set"
        message="This cannot be undone."
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );

    // `root` is the `Modal` itself - `onRequestClose` is how Android's
    // hardware back button reaches this component.
    (root?.props.onRequestClose as () => void)();

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('uses custom confirm/cancel labels when provided', async () => {
    const { getByRole } = await render(
      <ConfirmDialog
        visible
        title="Delete set"
        message="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Keep it"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(getByRole('button', { name: 'Delete' })).toBeTruthy();
    expect(getByRole('button', { name: 'Keep it' })).toBeTruthy();
  });
});
