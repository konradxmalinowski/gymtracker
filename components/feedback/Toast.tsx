import { useEffect } from 'react';
import { AccessibilityInfo, Pressable } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { t } from '@/i18n';
import { color, elevation, hitSlop, radius, space } from '@/theme/tokens';

export interface ToastProps {
  message: string;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
  duration?: number | undefined;
  onDismiss: () => void;
  testID?: string | undefined;
}

const DEFAULT_DURATION_MS = 4000;

/**
 * Presentational only - `ToastHost` (mounted once at the app root) owns
 * *when* a toast is shown/queued; this component just renders one and calls
 * `onDismiss` on timeout, action press, or the explicit close button.
 * `accessibilityLiveRegion="polite"` announces the message without
 * interrupting whatever the screen reader is already saying, appropriate
 * for a routine confirmation rather than an error - but that prop is
 * Android-only (it has no iOS equivalent), so VoiceOver users would never
 * hear the toast at all without the explicit
 * `AccessibilityInfo.announceForAccessibility` call below (accessibility
 * audit, reports/accessibility-2026-08-05-p1.md, A11Y-002).
 */
export function Toast({ message, actionLabel, onAction, duration, onDismiss, testID }: ToastProps) {
  const effectiveDuration = duration ?? DEFAULT_DURATION_MS;

  useEffect(() => {
    const timer = setTimeout(onDismiss, effectiveDuration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-arming on every onDismiss identity change would restart the timer each render.
  }, [effectiveDuration]);

  useEffect(() => {
    // iOS has no `accessibilityLiveRegion` equivalent - announcing here is
    // the only way VoiceOver users hear a toast that appears without moving
    // focus. Android gets this announcement twice (once from this call, once
    // from `accessibilityLiveRegion="polite"` below) - both are idempotent,
    // user-facing announcements of the same message, not a functional bug.
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(150)}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        backgroundColor: color.surfaceElevated,
        borderRadius: radius.lg,
        paddingVertical: space[3],
        paddingHorizontal: space[4],
        marginHorizontal: space[4],
        ...elevation.float,
      }}
    >
      <Text variant="body" color="primary" style={{ flex: 1 }} numberOfLines={2}>
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={() => {
            onAction();
            onDismiss();
          }}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={hitSlop.default}
        >
          <Text variant="bodyMedium" color="accent">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
      <IconButton
        icon={<Text color="tertiary">{'✕'}</Text>}
        size="sm"
        variant="ghost"
        accessibilityLabel={t('toast.dismissAccessibilityLabel')}
        onPress={onDismiss}
      />
    </Animated.View>
  );
}
