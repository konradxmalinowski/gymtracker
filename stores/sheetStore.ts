import type { ReactNode } from 'react';
import { create } from 'zustand';

/**
 * Ephemeral UI state only (CLAUDE.md's Zustand scope). Stacking decision
 * (see `toastStore.ts` for the toast side of the same decision): a second
 * sheet request while one is open **queues** behind it (FIFO) instead of
 * replacing it. A bottom sheet is usually mid-interaction - a form, a
 * destructive confirmation - and silently swapping it out would discard
 * whatever the user was doing in it. The queued sheet opens automatically
 * once the current one closes (dismiss, confirm, or swipe-down).
 */
export interface SheetRequest {
  id: string;
  content: ReactNode;
  snapPoints?: readonly number[] | undefined;
  onDismiss?: (() => void) | undefined;
}

interface SheetState {
  current: SheetRequest | null;
  queue: SheetRequest[];
  present: (request: SheetRequest) => void;
  dismissCurrent: () => void;
}

export const useSheetStore = create<SheetState>((set, get) => ({
  current: null,
  queue: [],
  present: (request) => {
    const { current, queue } = get();
    if (current === null) {
      set({ current: request });
    } else {
      set({ queue: [...queue, request] });
    }
  },
  dismissCurrent: () => {
    const { current, queue } = get();
    current?.onDismiss?.();
    const [next, ...rest] = queue;
    set({ current: next ?? null, queue: rest });
  },
}));
