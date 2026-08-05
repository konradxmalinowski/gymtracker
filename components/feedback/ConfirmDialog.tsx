import { Modal, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { t } from '@/i18n';
import { color, radius, space } from '@/theme/tokens';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string | undefined;
  cancelLabel?: string | undefined;
  destructive?: boolean | undefined;
  onConfirm: () => void;
  onCancel: () => void;
  testID?: string | undefined;
}

/**
 * Built on RN's native `Modal`, not a hand-rolled absolutely-positioned
 * overlay - a real modal intercepts every touch to whatever's behind it at
 * the platform level, which is what makes "not dismissible via accidental
 * tap-through" (an explicit edge case for this component) true by
 * construction rather than something to get right in application code. The
 * backdrop `View` has no `onPress` at all - for *any* `ConfirmDialog`, not
 * only destructive ones, closing requires pressing Cancel/Confirm. Android's
 * hardware back button still maps to `onCancel` (`onRequestClose`) since
 * that's a deliberate user action, not an accidental tap.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
  testID,
}: ConfirmDialogProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      testID={testID}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: color.surfaceOverlay,
          alignItems: 'center',
          justifyContent: 'center',
          padding: space[6],
        }}
      >
        <View
          accessibilityViewIsModal
          accessible={false}
          style={{
            width: '100%',
            maxWidth: 400,
            backgroundColor: color.surfaceElevated,
            borderRadius: radius['2xl'],
            padding: space[5],
            gap: space[4],
          }}
        >
          <View style={{ gap: space[1] }}>
            <Text variant="title3" color="primary">
              {title}
            </Text>
            <Text variant="body" color="secondary">
              {message}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: space[3], justifyContent: 'flex-end' }}>
            <Button
              variant="ghost"
              label={cancelLabel ?? t('confirmDialog.defaultCancelLabel')}
              onPress={onCancel}
            />
            <Button
              variant={destructive ? 'destructive' : 'primary'}
              label={confirmLabel ?? t('confirmDialog.defaultConfirmLabel')}
              onPress={onConfirm}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
