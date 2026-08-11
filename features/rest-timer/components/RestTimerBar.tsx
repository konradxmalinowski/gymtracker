import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';

import { PressScale } from '@/components/gestures/PressScale';
import { SwipeableRow, type SwipeableRowAction } from '@/components/gestures/SwipeableRow';
import { Row } from '@/components/layout';
import { ProgressRing, Text } from '@/components/ui';
import { t } from '@/i18n';
import {
  selectIsExpired,
  selectRemainingSeconds,
  useRestTimerStore,
} from '@/stores/restTimerStore';
import { color, elevation, hitSlop, radius, space } from '@/theme/tokens';

import { formatRestSeconds } from './formatRestSeconds';

/**
 * `docs/ARCHITECTURE.md` section 11's `RestTimerBarProps` interface
 * (line ~1791) is authoritative and quoted verbatim here - "taking an
 * absolute deadline rather than a countdown value is what makes FR-14
 * correct across backgrounding, and it is why the prop type is specified
 * here rather than left to implementation." `deadlineAt`/`totalSeconds` are
 * therefore real props, not derived internally, even though in practice
 * every caller sources them from `useRestTimerStore`.
 *
 * What the doc's prop list doesn't (and can't) specify is how a component
 * re-renders every tick with no new props arriving - `now` is read directly
 * from the shared `restTimerStore` (its own file header names this exact
 * component as the intended reader: "the consuming component/hook's job -
 * `RestTimerBar` and its ticking hook"), so this bar stays live without
 * owning a second ticking mechanism of its own. The actual interval/AppState
 * driver is `useRestTimerTick`, mounted once by the screen that also mounts
 * this bar - never by this component itself.
 */
export interface RestTimerBarProps {
  deadlineAt: number | null;
  totalSeconds: number;
  /** Quick nudge (the bar's own -/+ buttons), in seconds - positive to add, negative to subtract. Distinct from the fixed-preset jump `RestTimerSettingsSheet` offers. */
  onAdjust: (deltaSeconds: number) => void;
  /** Swipe-to-dismiss / cancel-early - "skip this rest" (`docs/ARCHITECTURE.md`'s naming, matches the plan's "swipe to dismiss cancels early"). */
  onSkip: () => void;
  /** Tap the ring/countdown - opens `RestTimerSettingsSheet` for the fixed presets. */
  onOpenSettings: () => void;
  testID?: string | undefined;
}

const RING_SIZE = 40;
const RING_STROKE = 4;
const ADJUST_DELTA_SECONDS = 15;
// A per-second announcement would be unusable VoiceOver/TalkBack noise -
// announce on a coarser cadence, and always at expiry regardless of cadence.
const ANNOUNCE_INTERVAL_SECONDS = 15;

export function RestTimerBar({
  deadlineAt,
  totalSeconds,
  onAdjust,
  onSkip,
  onOpenSettings,
  testID,
}: RestTimerBarProps) {
  const now = useRestTimerStore((state) => state.now);
  const lastAnnouncedRef = useRef<number | null>(null);

  // `deadlineAt`/`totalSeconds` are props (see this component's own header
  // for why); `now` is read from the shared store. `selectRemainingSeconds`/
  // `selectIsExpired` are the store's own exported formula - reimplementing
  // the clamp/rounding math inline here would be a second copy of it to
  // keep in sync (code review finding, P7 pass 3 follow-up).
  const restTimerState = { deadlineAt, totalSeconds, now };
  const remainingSeconds = selectRemainingSeconds(restTimerState);
  const isExpired = selectIsExpired(restTimerState);

  useEffect(() => {
    if (deadlineAt === null) {
      lastAnnouncedRef.current = null;
      return;
    }
    const last = lastAnnouncedRef.current;
    // `remainingSeconds > last` (code review finding, P7 pass 3 follow-up):
    // an upward adjustment (the bar's own "+" button, or a preset picked
    // above the previous value) jumps `remainingSeconds` up, not down. The
    // interval check below (`last - remainingSeconds >= ANNOUNCE_INTERVAL_SECONDS`)
    // only ever fires on a *decrease* of at least the interval, so without
    // this branch a single upward adjustment permanently pins `last` above
    // where `remainingSeconds` can ever reach again while only counting
    // down - silencing every periodic announcement for the rest of that
    // timer, not just skipping one. Re-anchoring here also doubles as
    // useful feedback: a screen-reader user is told the adjustment landed,
    // the same way a sighted user already sees the ring/number jump.
    const shouldAnnounce =
      isExpired ||
      last === null ||
      remainingSeconds > last ||
      last - remainingSeconds >= ANNOUNCE_INTERVAL_SECONDS;
    if (shouldAnnounce) {
      lastAnnouncedRef.current = remainingSeconds;
      AccessibilityInfo.announceForAccessibility(
        isExpired
          ? t('restTimer.expiredAnnouncement')
          : t('restTimer.remainingAnnouncementTemplate', { seconds: remainingSeconds }),
      );
    }
  }, [deadlineAt, remainingSeconds, isExpired]);

  if (deadlineAt === null) {
    return null;
  }

  const progress = totalSeconds > 0 ? 1 - remainingSeconds / totalSeconds : 0;
  const ringColor = isExpired ? color.success : color.accent;

  const skipAction: SwipeableRowAction = {
    icon: <Ionicons name="play-skip-forward-outline" size={20} color={color.textInverse} />,
    label: t('restTimer.skipAccessibilityLabel'),
    color: color.danger,
    onTrigger: onSkip,
  };

  const countdownLabel = isExpired
    ? t('restTimer.expiredAnnouncement')
    : t('restTimer.remainingAnnouncementTemplate', { seconds: remainingSeconds });

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingHorizontal: space[3],
        paddingVertical: space[3],
        backgroundColor: color.backgroundElevated,
        borderTopWidth: 1,
        borderTopColor: color.border,
        ...elevation.float,
      }}
      testID={testID}
    >
      <AdjustDeltaButton
        symbol="−"
        accessibilityLabel={t('restTimer.decreaseAccessibilityLabelTemplate', {
          seconds: ADJUST_DELTA_SECONDS,
        })}
        onPress={() => onAdjust(-ADJUST_DELTA_SECONDS)}
        testID={testID ? `${testID}-decrease` : undefined}
      />

      {/* Accessibility fix (P7 accessibility review, blocking): `SwipeableRow`
          forces `accessible: true` onto its one child via `cloneElement`
          (`attachAccessibilityActions`), which collapses that child's whole
          subtree into a single accessibility node. The two `AdjustDeltaButton`s
          used to be inside that same subtree - reachable by touch, but
          invisible to VoiceOver/TalkBack, which could only ever land on the
          merged node and its one attached "Skip rest" action. Wrapping only
          the countdown `PressScale` here (already a real `Pressable` with its
          own role/label/hint) keeps the buttons as siblings outside the
          swipeable region - three independently reachable, correctly labeled
          elements instead of one collapsed one. The `flex: 1` lives on this
          wrapper, not on `PressScale` itself, since `SwipeableRow` exposes no
          `style` prop of its own to claim the row's remaining space directly. */}
      <View style={{ flex: 1 }}>
        <SwipeableRow rightAction={skipAction} testID={testID ? `${testID}-swipe` : undefined}>
          <PressScale
            onPress={onOpenSettings}
            accessibilityRole="button"
            accessibilityLabel={countdownLabel}
            accessibilityHint={t('restTimer.adjustAccessibilityHint')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}
            testID={testID ? `${testID}-open-settings` : undefined}
          >
            <ProgressRing
              progress={progress}
              size={RING_SIZE}
              strokeWidth={RING_STROKE}
              color={ringColor}
            />
            <Row style={{ flex: 1 }} justify="space-between" align="center">
              <Text variant="bodyMedium" color="primary">
                {isExpired ? t('restTimer.expiredLabel') : t('restTimer.restingLabel')}
              </Text>
              <Text
                variant="numeric"
                color={isExpired ? 'success' : 'primary'}
                testID={testID ? `${testID}-countdown` : undefined}
              >
                {formatRestSeconds(remainingSeconds)}
              </Text>
            </Row>
          </PressScale>
        </SwipeableRow>
      </View>

      <AdjustDeltaButton
        symbol="+"
        accessibilityLabel={t('restTimer.increaseAccessibilityLabelTemplate', {
          seconds: ADJUST_DELTA_SECONDS,
        })}
        onPress={() => onAdjust(ADJUST_DELTA_SECONDS)}
        testID={testID ? `${testID}-increase` : undefined}
      />
    </View>
  );
}

function AdjustDeltaButton({
  symbol,
  accessibilityLabel,
  onPress,
  testID,
}: {
  symbol: string;
  accessibilityLabel: string;
  onPress: () => void;
  testID?: string | undefined;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={hitSlop.small}
      testID={testID}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? color.surfacePressed : color.surfaceElevated,
      })}
    >
      <Text variant="title3" color="primary">
        {symbol}
      </Text>
    </Pressable>
  );
}
