import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { t } from '@/i18n';
import { space } from '@/theme/tokens';

export interface EmptyStateProps {
  illustration?: ReactNode | undefined;
  title?: string | undefined;
  message?: string | undefined;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
  testID?: string | undefined;
}

export function EmptyState({
  illustration,
  title,
  message,
  actionLabel,
  onAction,
  testID,
}: EmptyStateProps) {
  return (
    <View
      style={{ alignItems: 'center', justifyContent: 'center', gap: space[3], padding: space[6] }}
      testID={testID}
    >
      {illustration}
      <Text variant="title3" color="primary" align="center">
        {title ?? t('emptyState.defaultTitle')}
      </Text>
      {message ? (
        <Text variant="body" color="secondary" align="center">
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        // `Button` always sets its own `alignSelf: 'flex-start'` when not
        // `fullWidth` (its own default posture for a button dropped into an
        // arbitrary layout), which overrides this container's
        // `alignItems: 'center'` and left-aligns the button under otherwise
        // centered title/message text. A plain wrapping `View` sized to its
        // content (the default for a non-flex child) restores centering:
        // the wrapper itself is centered by this container, and its width
        // already matches the button, so the button's own `flex-start`
        // makes no visible difference inside it.
        <View>
          <Button variant="secondary" label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}
