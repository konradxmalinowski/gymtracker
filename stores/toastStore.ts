import { create } from 'zustand';

/**
 * Ephemeral UI state only (CLAUDE.md's Zustand scope) - this store holds
 * nothing that survives a reload and nothing domain-related, just "what
 * transient message is on screen right now."
 *
 * Stacking decision (ARCHITECTURE.md section 11.7's "root-level toast and
 * sheet hosts", left to this phase to define): a new toast **replaces** the
 * currently visible one instead of queuing behind it. Toasts here are
 * feedback for the user's most recent action ("Set added", "Set deleted -
 * Undo"); if a second action fires before the first toast finishes, the
 * newer feedback is what's actually relevant, and queuing would play stale
 * confirmations back-to-back after the user has already moved on. This also
 * keeps `UndoToast` correct: if two deletes happen in quick succession, only
 * the most recent one should stay undoable - an older, superseded undo
 * silently expiring is the right behavior, not a queued surprise.
 *
 * Contrast with `sheetStore.ts`, which queues instead of replacing - a
 * bottom sheet is usually mid-interaction (a form, a confirmation) and
 * dropping it loses user input, where a toast never holds anything the user
 * was actively doing.
 */
export interface ToastRequest {
  message: string;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
  duration?: number | undefined;
}

export interface ToastItem {
  id: string;
  message: string;
  actionLabel: string | undefined;
  onAction: (() => void) | undefined;
  duration: number;
}

const DEFAULT_DURATION_MS = 4000;

interface ToastState {
  current: ToastItem | null;
  show: (request: ToastRequest) => void;
  dismiss: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  current: null,
  show: (request) =>
    set({
      current: {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        message: request.message,
        actionLabel: request.actionLabel,
        onAction: request.onAction,
        duration: request.duration ?? DEFAULT_DURATION_MS,
      },
    }),
  dismiss: () => set({ current: null }),
}));
