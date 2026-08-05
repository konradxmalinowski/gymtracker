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
        <Button variant="secondary" label={actionLabel} onPress={onAction} />
      ) : null}
    </View>
  );
}
