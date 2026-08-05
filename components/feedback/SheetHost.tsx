import { useSheetStore } from '@/stores/sheetStore';

import { BottomSheet } from './BottomSheet';

/**
 * Mounted once at the app root (see `app/_layout.tsx`). Renders
 * `sheetStore`'s `current` request; the FIFO queue-behind-the-current-sheet
 * decision documented in `stores/sheetStore.ts` lives entirely in the
 * store, this component is a dumb subscriber, same split as `ToastHost`.
 */
export function SheetHost() {
  const current = useSheetStore((state) => state.current);
  const dismissCurrent = useSheetStore((state) => state.dismissCurrent);

  return (
    <BottomSheet
      visible={current !== null}
      onDismiss={dismissCurrent}
      snapPoints={current?.snapPoints}
    >
      {current?.content}
    </BottomSheet>
  );
}
