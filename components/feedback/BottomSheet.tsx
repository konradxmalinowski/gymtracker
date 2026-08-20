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
import { BackHandler, Dimensions, Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedKeyboard,
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

// This component no longer renders into a separate native `Modal` window
// (see the file header below) - it paints as an ordinary absolutely-
// positioned sibling at wherever it happens to be mounted. `zIndex` covers
// the JS/Yoga stacking order iOS uses; Android additionally needs an
// explicit `elevation` (its own, independent Z-translation stacking
// mechanism) to guarantee this paints above any other elevated sibling
// already in the tree (e.g. a card or button using `theme/tokens.ts`'s
// `elevation.card`/`elevation.float`, both lower than this) - the highest
// value already defined there is `elevation.sheet`'s own 12, used below on
// the sheet surface itself; this wrapper goes higher still so the sheet
// reliably wins against everything else.
const OVERLAY_Z_INDEX = 1000;
const OVERLAY_ANDROID_ELEVATION = 24;

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
 *
 * **Keyboard avoidance / why this isn't a `Modal` (third attempt, this
 * one's final)**: the first two attempts both tried to make Android's
 * keyboard shift the sheet's content while still rendering inside RN's
 * `Modal`, and both failed for the same underlying reason. `Modal` renders
 * into its own native window (`ReactModalHostView.kt`'s own `Window`/
 * `DialogRootViewGroup` on Android), and `useAnimatedKeyboard`'s Android
 * implementation (`WindowsInsetsManager.kt`) attaches its listener to
 * `currentActivity.window.decorView` - the app's *main Activity* window,
 * not the Modal's separate Dialog window - so it never observed this
 * sheet's real keyboard animation (attempt 1). Measuring the sheet's own
 * `onLayout` against `Dimensions.get('window').height` as a substitute
 * (attempt 2, on the theory that the Dialog window's own
 * `SOFT_INPUT_ADJUST_RESIZE` would resize it by the keyboard's full height)
 * was verified live on a real Android emulator to only shift by ~100-150px
 * against a keyboard needing ~900px - the Dialog window did not reliably
 * resize by the assumed amount. Both fixes were treating a symptom; the
 * actual defect was presenting this content inside a separate window at
 * all. This third attempt removes `Modal` entirely - the sheet now renders
 * as a plain absolutely-positioned overlay *inline* in the same Activity
 * window as the rest of the app (confirmed working for the one plain-
 * screen case already in the app, `OnboardingScreen`'s nickname
 * `TextField`, which needed no special handling at all because it already
 * lives in that window) - which makes `useAnimatedKeyboard` trustworthy on
 * *both* platforms, the same way it always was on iOS (`REAKeyboardEventObserver.mm`
 * listens to app-wide `UIKeyboard*` notifications with no window affinity,
 * so it was never actually broken there). `keyboard.height.value` is read
 * unconditionally below, with no platform branch, no Android-only shared
 * value, and no `onLayout` measurement - all three now-dead per the two
 * failed attempts above.
 *
 * Because there's no real `Modal` doing this for free any more, three
 * things it used to provide are replaced explicitly:
 *
 * - **Android hardware back button**: a `BackHandler` listener, registered
 *   only while `visible` is true (so it never intercepts back presses
 *   elsewhere in the app), calls `onDismiss()` and consumes the event -
 *   the same effect `Modal`'s own `onRequestClose` used to produce.
 * - **Stacking above the rest of the app**: see `OVERLAY_Z_INDEX`/
 *   `OVERLAY_ANDROID_ELEVATION` above - `Modal`'s separate native window
 *   made this automatic; a plain `View` needs to say so explicitly.
 * - **Screen-reader modal semantics**: `accessibilityViewIsModal` stays on
 *   the sheet's own `Animated.View` below, which iOS honors (VoiceOver
 *   traps focus inside it) independent of any real `Modal` wrapper.
 *   Android has no equivalent prop, and nothing in this codebase already
 *   solves "hide the content behind a non-`Modal` overlay from TalkBack"
 *   (`ConfirmDialog`, the only other full-screen overlay here, still uses a
 *   real `Modal` and so never had to) - doing so for real would mean
 *   reaching into whatever screen happens to have mounted this sheet as a
 *   sibling to mark *that* content `importantForAccessibility="no-hide-descendants"`,
 *   which this component structurally cannot do from inside its own
 *   subtree. Left as a known, documented gap on Android rather than a
 *   silent one - touch is unaffected (the full-screen backdrop `Pressable`
 *   below still physically blocks touches to whatever is behind it), only
 *   TalkBack's explore-by-touch could in principle still reach hidden
 *   content underneath. Flagged for the live accessibility re-pass.
 *
 * Conditionally rendering `null` while `!visible` (rather than staying
 * mounted and animating opacity) matches what `Modal`'s own `visible={false}`
 * already did - RN's `Modal` returns `null` from its own render when not
 * visible, it does not keep children mounted-but-hidden - so this is not a
 * behavior change, and it avoids a real bug the alternative would have
 * introduced: an always-mounted, always-full-screen backdrop `Pressable`
 * would silently block touches to the rest of the app even while the sheet
 * is nominally "closed."
 *
 * Either keyboard source is clamped against `insets.bottom` (which the
 * sheet already reserves via `paddingBottom`) to avoid shifting twice,
 * since the keyboard's own height already covers the bottom safe area on
 * both platforms.
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
  const keyboard = useAnimatedKeyboard();

  useEffect(() => {
    translateY.value = withTiming(visible ? 0 : openHeight, {
      duration: motion.duration.normal,
    });
  }, [visible, openHeight, translateY]);

  // Replaces `Modal`'s own `onRequestClose` (see the file header) - only
  // armed while this sheet is actually showing, so it never swallows a back
  // press meant for whatever screen is underneath it.
  useEffect(() => {
    if (!visible) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onDismiss]);

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

  const sheetStyle = useAnimatedStyle(() => {
    const keyboardOffset = Math.max(0, keyboard.height.value - insets.bottom);
    return {
      transform: [{ translateY: translateY.value - keyboardOffset }],
    };
  });

  if (!visible) {
    return null;
  }

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'flex-end',
        zIndex: OVERLAY_Z_INDEX,
        elevation: OVERLAY_ANDROID_ELEVATION,
      }}
      testID={testID}
    >
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
  );
}
