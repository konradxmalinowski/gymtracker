import { useEffect } from 'react';
import { AccessibilityInfo, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { t } from '@/i18n';
import { space } from '@/theme/tokens';

export interface ErrorStateProps {
  error?: string | undefined;
  onRetry?: (() => void) | undefined;
  testID?: string | undefined;
}

/**
 * `error` is a display-ready message, not a raw `Error`/exception - callers
 * translate/sanitize before this component ever sees it (CLAUDE.md: never
 * expose raw errors in UI). `accessibilityLiveRegion="assertive"` because an
 * error replacing content the user was waiting on is exactly the kind of
 * change a screen-reader user needs interrupted for, unlike a routine toast -
 * but that prop only exists on Android. The `AccessibilityInfo.
 * announceForAccessibility` call below is what actually reaches VoiceOver on
 * iOS (accessibility audit, reports/accessibility-2026-08-05-p1.md, A11Y-002).
 */
export function ErrorState({ error, onRetry, testID }: ErrorStateProps) {
  const message = error ?? t('errorState.defaultMessage');

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  return (
    <View
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      style={{ alignItems: 'center', justifyContent: 'center', gap: space[3], padding: space[6] }}
      testID={testID}
    >
      <Text variant="title3" color="primary" align="center">
        {t('errorState.defaultTitle')}
      </Text>
      <Text variant="body" color="secondary" align="center">
        {message}
      </Text>
      {onRetry ? <Button variant="secondary" label={t('common.retry')} onPress={onRetry} /> : null}
    </View>
  );
}
