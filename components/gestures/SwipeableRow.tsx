import type { PropsWithChildren, ReactElement, ReactNode } from 'react';
import { Children, cloneElement, isValidElement } from 'react';
import { View, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '@/services/haptics';
import { color, motion, space } from '@/theme/tokens';

export interface SwipeableRowAction {
  icon: ReactNode;
  label: string;
  color: string;
  onTrigger: () => void;
}

export interface SwipeableRowProps extends PropsWithChildren {
  leftAction?: SwipeableRowAction | undefined;
  rightAction?: SwipeableRowAction | undefined;
  /** Horizontal distance (px) that counts as "crossed the threshold". */
  threshold?: number | undefined;
  hapticOnThreshold?: boolean | undefined;
  testID?: string | undefined;
}

const DEFAULT_THRESHOLD = 88;

/**
 * The one component this phase has a named, hard performance NFR for: it
 * must hold 60fps while dragging even with the JS thread artificially
 * blocked. Everything that runs on every frame of the gesture -
 * `translateX`'s value, the revealed action's opacity/scale, the row's own
 * `transform` - is a Reanimated shared value read and written entirely
 * inside `Gesture.Pan`'s worklet callbacks (`onUpdate`, `onEnd`) and
 * `useAnimatedStyle`, none of which cross the JS thread. The two calls that
 * *do* need JS (`haptics.destructive()`/`haptics.select()` at the threshold
 * crossing, and the action's own `onTrigger` after release) are each a
 * single discrete `runOnJS` hop tied to a one-time event - a threshold
 * being crossed, a gesture ending - not per-frame work, so they don't
 * touch the 60fps guarantee. The row itself never calls `setState` during
 * the gesture, so it never even re-renders until the gesture is over.
 */
export function SwipeableRow({
  leftAction,
  rightAction,
  threshold = DEFAULT_THRESHOLD,
  hapticOnThreshold = true,
  children,
  testID,
}: SwipeableRowProps) {
  const translateX = useSharedValue(0);
  const hasCrossedThreshold = useSharedValue(false);

  function fireHaptic() {
    if (hapticOnThreshold) {
      haptics.destructive();
    }
  }

  // The Pan gesture's `.onUpdate`/`.onEnd` callbacks are Worklets - anything
  // they reference gets captured into a closure that Worklets must serialize
  // to copy across to the UI thread. `leftAction`/`rightAction` are
  // caller-supplied `SwipeableRowAction` objects that carry a `ReactNode
  // icon` field (a JSX element, which can hold dev-mode fiber/owner
  // references Worklets cannot serialize) - referencing the objects
  // themselves anywhere inside a worklet, even just for an existence check,
  // pulls that whole unserializable object into the closure and crashes.
  // Derived plain primitives/functions below are what the worklets actually
  // reference instead - a boolean and a bare function reference are both
  // trivially safe for Worklets/`runOnJS` to handle, and neither needs the
  // parent action object (or its `icon` field) to ever cross into the
  // worklet's closure at all.
  const hasLeftAction = leftAction !== undefined;
  const hasRightAction = rightAction !== undefined;
  const leftOnTrigger = leftAction?.onTrigger;
  const rightOnTrigger = rightAction?.onTrigger;

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      // Only allow horizontal movement toward a side that has an action
      // configured - dragging into a side with no action just resists.
      const draggingLeft = event.translationX < 0;
      const hasAction = draggingLeft ? hasRightAction : hasLeftAction;
      translateX.value = hasAction ? event.translationX : event.translationX * 0.15;

      const crossed = Math.abs(translateX.value) > threshold;
      if (crossed && !hasCrossedThreshold.value) {
        hasCrossedThreshold.value = true;
        runOnJS(fireHaptic)();
      } else if (!crossed && hasCrossedThreshold.value) {
        hasCrossedThreshold.value = false;
      }
    })
    .onEnd(() => {
      const crossedRight = translateX.value > threshold && hasLeftAction;
      const crossedLeft = translateX.value < -threshold && hasRightAction;

      if (crossedRight && leftOnTrigger) {
        translateX.value = withTiming(0, { duration: motion.duration.fast });
        runOnJS(leftOnTrigger)();
      } else if (crossedLeft && rightOnTrigger) {
        translateX.value = withTiming(0, { duration: motion.duration.fast });
        runOnJS(rightOnTrigger)();
      } else {
        translateX.value = withSpring(0, motion.spring.snappy);
      }
      hasCrossedThreshold.value = false;
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const leftActionStyle = useAnimatedStyle(() => ({
    opacity: translateX.value > 8 ? Math.min(1, translateX.value / threshold) : 0,
  }));

  const rightActionStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < -8 ? Math.min(1, -translateX.value / threshold) : 0,
  }));

  // A raw pan gesture is invisible to VoiceOver/TalkBack - a screen-reader
  // swipe gesture already means "move to next/previous element", so it
  // can't double as this row's reveal gesture. `accessibilityActions`
  // exposes the same left/right actions through the rotor/actions menu
  // instead, so a screen-reader or switch-control user has a real,
  // non-gesture way to reach them.
  const accessibilityActions = [
    ...(leftAction ? [{ name: 'leftAction', label: leftAction.label }] : []),
    ...(rightAction ? [{ name: 'rightAction', label: rightAction.label }] : []),
  ];

  function handleAccessibilityAction(event: AccessibilityActionEvent) {
    if (event.nativeEvent.actionName === 'leftAction') {
      leftAction?.onTrigger();
    } else if (event.nativeEvent.actionName === 'rightAction') {
      rightAction?.onTrigger();
    }
  }

  // `accessibilityActions` only reaches VoiceOver/TalkBack's rotor from a
  // node that is itself `accessible={true}` (RN's own docs always pair the
  // two - accessibility report A11Y-004). This row's `children` is normally
  // something with its own primary interaction (e.g. a pressable
  // `ListRow`), and putting `accessible={true}` on an ancestor `View` would
  // collapse that whole subtree into one opaque accessibility node - a
  // plain `View`, unlike a `Pressable`, has no native tap handler to
  // forward a merged-node activation into on Android, so the child's
  // primary onPress would silently stop firing for TalkBack users.
  //
  // Instead, when `children` is a single element (the normal case), the
  // actions are cloned onto *that* element instead of an ancestor. The
  // child keeps whatever `accessible` value it already has (a `Pressable`
  // defaults it to `true` on its own, so reachability comes for free) and
  // its own `onPress`/activation behavior is completely untouched - it just
  // also gains these two custom actions, merged alongside anything it
  // already sets itself.
  //
  // Falls back to the old (imperfect) outer-`View` placement only when
  // `children` isn't a single element to attach to (e.g. a Fragment or bare
  // string) - there's no single "primary interaction" node to protect in
  // that shape, so the collapse risk doesn't apply the same way.
  const hasActions = accessibilityActions.length > 0;
  const canAttachToChild = hasActions && isValidElement(children) && Children.count(children) === 1;

  const content: ReactNode = canAttachToChild
    ? attachAccessibilityActions(
        children as ReactElement<ChildAccessibilityProps>,
        accessibilityActions,
        handleAccessibilityAction,
      )
    : children;

  const outerAccessibilityProps =
    hasActions && !canAttachToChild
      ? {
          accessible: true,
          accessibilityActions,
          onAccessibilityAction: handleAccessibilityAction,
        }
      : {};

  return (
    <View testID={testID} {...outerAccessibilityProps}>
      {leftAction ? (
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            {
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              justifyContent: 'center',
              paddingHorizontal: space[4],
              backgroundColor: leftAction.color,
            },
            leftActionStyle,
          ]}
        >
          {leftAction.icon}
        </Animated.View>
      ) : null}
      {rightAction ? (
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            {
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              justifyContent: 'center',
              alignItems: 'flex-end',
              paddingHorizontal: space[4],
              backgroundColor: rightAction.color,
            },
            rightActionStyle,
          ]}
        >
          {rightAction.icon}
        </Animated.View>
      ) : null}
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ backgroundColor: color.background }, rowStyle]}>
          {content}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

interface ChildAccessibilityProps {
  accessible?: boolean;
  accessibilityActions?: readonly { name: string; label?: string }[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
}

/**
 * Merges `SwipeableRow`'s left/right accessibility actions onto a single
 * child element rather than an ancestor `View` - see the long comment above
 * this function's call site for why. Merges rather than overwrites: if the
 * child already declares its own `accessibilityActions`/`onAccessibilityAction`
 * (unlikely today, but this shouldn't silently clobber it if it ever does),
 * both sets of actions and handlers keep working side by side.
 */
function attachAccessibilityActions(
  child: ReactElement<ChildAccessibilityProps>,
  actions: { name: string; label: string }[],
  onSwipeAction: (event: AccessibilityActionEvent) => void,
): ReactElement {
  const childProps = child.props;

  return cloneElement(child, {
    accessible: childProps.accessible ?? true,
    accessibilityActions: [...(childProps.accessibilityActions ?? []), ...actions],
    onAccessibilityAction: (event: AccessibilityActionEvent) => {
      const { actionName } = event.nativeEvent;
      if (actionName === 'leftAction' || actionName === 'rightAction') {
        onSwipeAction(event);
        return;
      }
      childProps.onAccessibilityAction?.(event);
    },
  } satisfies Partial<ChildAccessibilityProps>);
}
