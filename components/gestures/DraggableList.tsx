/**
 * See components/gestures/PressScale.tsx's file header - same
 * `react-hooks/immutability` false positive on Reanimated `SharedValue`
 * mutation, here additionally flagged because `orderIds`/`positions`/
 * `activeId` are passed into `DraggableRow` as props (they're shared
 * between every row, not created per-row), which the rule reads as
 * "mutating a prop." They're shared-value containers, not plain data - a
 * child worklet writing `.value` on a shared value it received as a prop is
 * exactly how Reanimated is meant to be used across component boundaries.
 */
/* eslint-disable react-hooks/immutability */
import type { ReactElement, ReactNode } from 'react';
import { Children, cloneElement, Fragment, isValidElement, useEffect } from 'react';
import { FlashList } from '@shopify/flash-list';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { View, type AccessibilityActionEvent } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { haptics } from '@/services/haptics';
import { t } from '@/i18n';
import { hitSlop, motion } from '@/theme/tokens';

// Icon-sized (ARCHITECTURE.md section 11.2's 24-32pt bracket), same as
// IconButton's `sm`. `HANDLE_HIT_SLOP` pads the *gesture recognition* area
// (via Gesture.hitSlop(), not the View's hitSlop prop - GestureDetector's
// pan recognition doesn't read that) out to the 44x44pt effective target
// minimum (WCAG 2.5.5 / Apple HIG), mirroring IconButton's own
// `Math.max(hitSlop.small, (44 - dimension) / 2)` formula.
const HANDLE_SIZE = 32;
const HANDLE_HIT_SLOP = Math.max(hitSlop.small, (44 - HANDLE_SIZE) / 2);

export interface DraggableListProps<T> {
  data: readonly T[];
  renderItem: (item: T, index: number, dragHandle: ReactNode | undefined) => ReactNode;
  keyExtractor: (item: T) => string;
  onReorder: (orderedIds: string[]) => void;
  dragHandle?: 'row' | 'handle' | undefined;
  /**
   * Every row must be this exact height (px). The reorder math below runs
   * entirely on the UI thread as plain arithmetic (`translationY / rowHeight`
   * -> a target index) with zero JS-thread involvement during the drag -
   * that only works for a known, fixed row height. Variable-height rows
   * would need per-row measured heights fed back into the worklet, which is
   * a real follow-up, not something silently unsupported: documented here
   * rather than discovered later.
   */
  rowHeight: number;
  testID?: string | undefined;
}

/**
 * Built on FlashList + Reanimated (ARCHITECTURE.md section 11.7). Dragging
 * updates a shared `positions` map (id -> translateY offset) entirely
 * inside `Gesture.Pan`'s worklet callbacks; the backing `data` array is
 * never touched during the gesture, so FlashList never re-renders mid-drag.
 * `onReorder` fires exactly once, via `runOnJS`, when the gesture ends.
 *
 * Every row also exposes a move-up/move-down accessibility action pair
 * (`accessibilityActions`/`onAccessibilityAction`, the same mechanism
 * `SwipeableRow` uses for its swipe actions - see that file's header for the
 * full reasoning on why this can't be a gesture). This closes the tracked
 * gap in CLAUDE.md's "Known gaps": this component was gesture-only with no
 * non-gesture reorder alternative, and P5 (plans reordering days/exercises)
 * is the phase that gap named as the one that must fix it before shipping.
 * A screen-reader user reorders a row entirely through these two actions,
 * never the pan gesture.
 */
export function DraggableList<T>({
  data,
  renderItem,
  keyExtractor,
  onReorder,
  dragHandle = 'row',
  rowHeight,
  testID,
}: DraggableListProps<T>) {
  const orderIds = useSharedValue<string[]>(data.map(keyExtractor));
  const positions = useSharedValue<Record<string, number>>({});
  const activeId = useSharedValue<string | null>(null);

  useEffect(() => {
    // A reorder that came from elsewhere (e.g. the parent screen re-sorted
    // `data` for a reason unrelated to this drag) resets the shared mirror.
    // This never runs *during* a gesture - only between them.
    orderIds.value = data.map(keyExtractor);
    positions.value = {};
  }, [data, keyExtractor, orderIds, positions]);

  function commitReorder(id: string, fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) {
      return;
    }
    const next = [...orderIds.value];
    const currentIndex = next.indexOf(id);
    if (currentIndex === -1) {
      return;
    }
    next.splice(currentIndex, 1);
    next.splice(toIndex, 0, id);
    onReorder(next);
  }

  return (
    <FlashList
      data={data}
      keyExtractor={keyExtractor}
      testID={testID}
      renderItem={({ item, index }) => (
        <DraggableRow
          id={keyExtractor(item)}
          index={index}
          itemCount={data.length}
          item={item}
          rowHeight={rowHeight}
          dragHandle={dragHandle}
          orderIds={orderIds}
          positions={positions}
          activeId={activeId}
          onDragEnd={commitReorder}
          renderItem={renderItem}
        />
      )}
    />
  );
}

interface DraggableRowProps<T> {
  id: string;
  index: number;
  itemCount: number;
  item: T;
  rowHeight: number;
  dragHandle: 'row' | 'handle';
  orderIds: SharedValue<string[]>;
  positions: SharedValue<Record<string, number>>;
  activeId: SharedValue<string | null>;
  onDragEnd: (id: string, fromIndex: number, toIndex: number) => void;
  renderItem: (item: T, index: number, dragHandle: ReactNode | undefined) => ReactNode;
}

interface MoveAccessibilityProps {
  accessible?: boolean;
  accessibilityActions?: readonly { name: string; label?: string }[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
}

/**
 * Merges the move-up/move-down accessibility actions onto a single child
 * element rather than an outer `View` whenever possible - identical
 * reasoning to `SwipeableRow.tsx`'s `attachAccessibilityActions`: a plain
 * ancestor `View` marked `accessible` collapses the whole subtree into one
 * opaque node, which silently breaks a `Pressable` descendant's own
 * `onPress` for TalkBack users. Falls back to wrapping in an accessible
 * `View` when `content` isn't a single attachable element (e.g. a
 * `Fragment` with multiple children, as `dragHandle="handle"` mode's own
 * `renderItem` composition can produce) - a `Fragment` renders no native
 * view of its own, so cloning accessibility props onto one would be a
 * no-op, not a real fallback.
 */
function attachMoveActions(
  content: ReactNode,
  actions: readonly { name: string; label: string }[],
  onMoveAction: (event: AccessibilityActionEvent) => void,
): ReactNode {
  if (actions.length === 0) {
    return content;
  }

  const canAttachToChild =
    isValidElement(content) &&
    Children.count(content) === 1 &&
    (content as ReactElement).type !== Fragment;

  if (canAttachToChild) {
    const child = content as ReactElement<MoveAccessibilityProps>;
    const childProps = child.props;
    return cloneElement(child, {
      accessible: childProps.accessible ?? true,
      accessibilityActions: [...(childProps.accessibilityActions ?? []), ...actions],
      onAccessibilityAction: (event: AccessibilityActionEvent) => {
        const { actionName } = event.nativeEvent;
        if (actionName === 'moveUp' || actionName === 'moveDown') {
          onMoveAction(event);
          return;
        }
        childProps.onAccessibilityAction?.(event);
      },
    } satisfies Partial<MoveAccessibilityProps>);
  }

  return (
    <View accessible accessibilityActions={actions} onAccessibilityAction={onMoveAction}>
      {content}
    </View>
  );
}

function DraggableRow<T>({
  id,
  index,
  itemCount,
  item,
  rowHeight,
  dragHandle,
  orderIds,
  positions,
  activeId,
  onDragEnd,
  renderItem,
}: DraggableRowProps<T>) {
  const pan = Gesture.Pan()
    .activateAfterLongPress(dragHandle === 'row' ? 250 : 0)
    .onStart(() => {
      activeId.value = id;
    })
    .onUpdate((event) => {
      const order = orderIds.value;
      const currentIndex = order.indexOf(id);
      if (currentIndex === -1) {
        return;
      }
      const targetIndex = Math.min(
        order.length - 1,
        Math.max(0, Math.round(currentIndex + event.translationY / rowHeight)),
      );

      const next: Record<string, number> = {};
      order.forEach((otherId, otherIndex) => {
        if (otherId === id) {
          next[otherId] = event.translationY;
        } else if (
          currentIndex < targetIndex &&
          otherIndex > currentIndex &&
          otherIndex <= targetIndex
        ) {
          next[otherId] = -rowHeight;
        } else if (
          currentIndex > targetIndex &&
          otherIndex < currentIndex &&
          otherIndex >= targetIndex
        ) {
          next[otherId] = rowHeight;
        } else {
          next[otherId] = 0;
        }
      });
      positions.value = next;
    })
    .onEnd((event) => {
      const order = orderIds.value;
      const currentIndex = order.indexOf(id);
      const targetIndex = Math.min(
        order.length - 1,
        Math.max(0, Math.round(currentIndex + event.translationY / rowHeight)),
      );

      const settled: Record<string, number> = {};
      order.forEach((otherId) => {
        settled[otherId] = withTiming(0, { duration: motion.duration.fast });
      });
      positions.value = settled;
      activeId.value = null;

      if (currentIndex !== -1) {
        runOnJS(onDragEnd)(id, currentIndex, targetIndex);
      }
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: positions.value[id] ?? 0 }],
    zIndex: activeId.value === id ? 10 : 0,
    shadowOpacity: activeId.value === id ? 0.3 : 0,
  }));

  const moveActions = [
    ...(index > 0 ? [{ name: 'moveUp', label: t('draggableList.moveUpAccessibilityLabel') }] : []),
    ...(index < itemCount - 1
      ? [{ name: 'moveDown', label: t('draggableList.moveDownAccessibilityLabel') }]
      : []),
  ];

  function handleMoveAction(event: AccessibilityActionEvent) {
    const { actionName } = event.nativeEvent;
    if (actionName === 'moveUp' && index > 0) {
      haptics.select();
      onDragEnd(id, index, index - 1);
    } else if (actionName === 'moveDown' && index < itemCount - 1) {
      haptics.select();
      onDragEnd(id, index, index + 1);
    }
  }

  const handle =
    dragHandle === 'handle' ? (
      // `pan.hitSlop(...)` mutates and returns the same gesture instance
      // (Gesture Handler's fluent builder API), which is safe here only
      // because this branch and the `dragHandle === 'row'` branch below are
      // mutually exclusive per list instance - the row branch never calls
      // `.hitSlop()` on the shared `pan` object, so it never inherits this
      // expanded recognition area.
      <GestureDetector gesture={pan.hitSlop(HANDLE_HIT_SLOP)}>
        <Animated.View
          // A plain `View`/`Animated.View` defaults `accessible` to `false`,
          // so without this the `adjustable` role + label below are
          // invisible to both RNTL and real screen readers - same gap as
          // SegmentedControl's container (accessibility audit,
          // reports/accessibility-2026-08-05-p1.md; DraggableList.test.tsx).
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={t('draggableList.dragHandleAccessibilityLabel')}
          // The move-up/move-down actions are attached directly to this
          // handle node, NOT to the row as a whole, in "handle" mode - a
          // deliberate structural choice found necessary by a follow-up
          // accessibility review. The row's own content (`renderItem`'s
          // return value) is a real component with its own interactive
          // children (icon buttons, etc.); marking the *row* `accessible`
          // here (the way "row" mode below does, where the whole row IS the
          // one and only affordance) would collapse the handle - which
          // renders inside that same row - into the row's single opaque
          // accessibility node, making it unreachable as its own
          // VoiceOver/TalkBack stop with its own "adjustable" role. Keeping
          // the actions on this small, already-`accessible` handle node
          // instead means the handle stays independently reachable, and the
          // row's other interactive children are never wrapped in an
          // `accessible` ancestor to begin with.
          accessibilityActions={moveActions}
          onAccessibilityAction={handleMoveAction}
          style={{
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Braille-dots grip glyph - this project has no icon library yet
              (ARCHITECTURE.md section 11), so a plain Text glyph stands in,
              same as Checkbox's '✓' / ListRow's '›' / Chip's '✕'. */}
          <Text color="tertiary" style={{ fontSize: 20, lineHeight: 20 }}>
            {'⠿'}
          </Text>
        </Animated.View>
      </GestureDetector>
    ) : undefined;

  const content = renderItem(item, index, handle);

  // In "handle" mode the actions already live on `handle` above - `content`
  // (the row) is left untouched, on purpose, so the row's own interactive
  // children stay independently reachable. In "row" mode there is no
  // separate handle at all - the whole row is the one target, so it's the
  // row itself that needs the actions attached.
  const accessibleContent =
    dragHandle === 'handle' ? content : attachMoveActions(content, moveActions, handleMoveAction);

  if (dragHandle === 'row') {
    return (
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>{accessibleContent}</Animated.View>
      </GestureDetector>
    );
  }

  return <Animated.View style={rowStyle}>{accessibleContent}</Animated.View>;
}
