import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToastStore } from '@/stores/toastStore';

import { Toast } from './Toast';

/**
 * Mounted once at the app root (see `app/_layout.tsx`). Renders whatever
 * `toastStore` currently holds in `current` - the replace-not-queue
 * decision documented in `stores/toastStore.ts` lives entirely in the
 * store; this component is a dumb subscriber.
 */
export function ToastHost() {
  const current = useToastStore((state) => state.current);
  const dismiss = useToastStore((state) => state.dismiss);
  const insets = useSafeAreaInsets();

  if (!current) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 12 }}
    >
      <Toast
        key={current.id}
        message={current.message}
        actionLabel={current.actionLabel}
        onAction={current.onAction}
        duration={current.duration}
        onDismiss={dismiss}
      />
    </View>
  );
}
