/**
 * See components/gestures/PressScale.tsx's file header - same
 * `react-hooks/immutability` false positive on Reanimated `SharedValue`
 * mutation (`translateY.value = ...`), here additionally flagged because
 * the same shared value is written from both a `useEffect` and a gesture
 * worklet, which the rule reads as "an effect-managed value being mutated
 * elsewhere." Both are legitimate Reanimated writes.
 */
/* eslint-disable react-hooks/immutability */
import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { Dimensions, Modal, Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { color, elevation, motion, radius, space } from '@/theme/tokens';

export interface BottomSheetProps extends PropsWithChildren {
  visible: boolean;
  onDismiss: () => void;
  /** Fractions of screen height (0..1), tallest first is not required - the first entry is the sheet's open height. */
  snapPoints?: readonly number[] | undefined;
  testID?: string | undefined;
}

const DISMISS_VELOCITY_THRESHOLD = 800;
const DISMISS_DISTANCE_RATIO = 0.3;

/**
 * A single root-level sheet, matching `ToastHost`/`sheetStore.ts`'s
 * "one visible sheet, requests queue behind it" model - this component
 * renders whatever `SheetHost` currently has `visible`, it doesn't manage
 * the queue itself.
 *
 * Drag-to-dismiss is a Gesture Handler pan whose `onUpdate`/`onEnd` run as
 * worklets on the UI thread - `translateY` is a shared value read directly
 * by `useAnimatedStyle`, and `onDismiss` (the one piece that has to reach
 * JS) only fires once, via `runOnJS`, after the gesture resolves past the
 * distance/velocity threshold. Tapping the backdrop also dismisses (unlike
 * `ConfirmDialog`, sheet content isn't assumed destructive, so accidental-
 * tap-through protection isn't the default here).
 */
export function BottomSheet({
  visible,
  onDismiss,
  snapPoints = [0.6],
  children,
  testID,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const screenHeight = Dimensions.get('window').height;
  const openHeight = screenHeight * (snapPoints[0] ?? 0.6);

  const translateY = useSharedValue(openHeight);

  useEffect(() => {
    translateY.value = withTiming(visible ? 0 : openHeight, {
      duration: motion.duration.normal,
    });
  }, [visible, openHeight, translateY]);

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      const shouldDismiss =
        event.translationY > openHeight * DISMISS_DISTANCE_RATIO ||
        event.velocityY > DISMISS_VELOCITY_THRESHOLD;
      if (shouldDismiss) {
        translateY.value = withTiming(openHeight, { duration: motion.duration.fast });
        runOnJS(onDismiss)();
      } else {
        translateY.value = withTiming(0, { duration: motion.duration.fast });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
      testID={testID}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityLabel={t('bottomSheet.closeAccessibilityLabel')}
          accessibilityRole="button"
          onPress={onDismiss}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: color.surfaceOverlay,
          }}
        />
        <GestureDetector gesture={pan}>
          <Animated.View
            accessibilityViewIsModal
            style={[
              {
                height: openHeight + insets.bottom,
                paddingBottom: insets.bottom,
                backgroundColor: color.surfaceElevated,
                borderTopLeftRadius: radius['2xl'],
                borderTopRightRadius: radius['2xl'],
                ...elevation.sheet,
              },
              sheetStyle,
            ]}
          >
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                alignSelf: 'center',
                width: 36,
                height: 4,
                borderRadius: radius.full,
                backgroundColor: color.borderStrong,
                marginTop: space[2],
                marginBottom: space[3],
              }}
            />
            <View style={{ flex: 1, paddingHorizontal: space[4] }}>{children}</View>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}
