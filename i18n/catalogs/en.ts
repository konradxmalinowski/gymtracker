/**
 * i18n/catalogs/en.ts - the only catalog that ships in v1 (D-11: English UI
 * for v1, Polish exercise names only, no Polish UI - ARCHITECTURE.md
 * "Consequences of D-11 for P1").
 *
 * This is a plain data module - a future `pl.ts` catalog is added next to
 * this file with the same shape and registered in `i18n/index.ts`; nothing
 * about `t()`'s call sites changes. Keep this file free of logic so that
 * addition stays data-only.
 */
export const en = {
  common: {
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    delete: 'Delete',
    remove: 'Remove',
    edit: 'Edit',
    add: 'Add',
    done: 'Done',
    retry: 'Try again',
    close: 'Close',
    undo: 'Undo',
    loading: 'Loading',
    dismiss: 'Dismiss',
    decrease: 'Decrease',
    increase: 'Increase',
  },
  emptyState: {
    defaultTitle: 'Nothing here yet',
  },
  errorState: {
    defaultTitle: 'Something went wrong',
    defaultMessage: 'An unexpected error occurred. Please try again.',
  },
  confirmDialog: {
    defaultConfirmLabel: 'Confirm',
    defaultCancelLabel: 'Cancel',
  },
  toast: {
    dismissAccessibilityLabel: 'Dismiss notification',
    undoAccessibilityLabel: 'Undo last action',
  },
  bottomSheet: {
    closeAccessibilityLabel: 'Close sheet',
  },
  chip: {
    removeAccessibilityLabel: 'Remove {{label}}',
  },
  avatar: {
    accessibilityLabel: "{{name}}'s avatar",
  },
  draggableList: {
    dragHandleAccessibilityLabel: 'Drag to reorder',
  },
  gallery: {
    title: 'Component gallery',
    stateDefault: 'Default',
    statePressed: 'Pressed',
    stateDisabled: 'Disabled',
    stateLoading: 'Loading',
    stateError: 'Error',
  },
} as const;
