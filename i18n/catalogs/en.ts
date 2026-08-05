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
  dbHealth: {
    title: 'Database health',
    subtitle:
      'Dev-only diagnostics for the local SQLite database - schema, storage, and engine capabilities.',
    loadingLabel: 'Loading database diagnostics',
    errorMessage: 'Could not load database diagnostics: {{detail}}',
    schemaSection: 'Schema',
    schemaVersionLabel: 'Schema version',
    lastMigrationLabel: 'Last migration',
    lastMigrationNone: 'No migrations recorded yet.',
    lastMigrationVersionName: 'v{{version}} - {{name}}',
    lastMigrationApplied: 'Applied {{date}} - app {{appVersion}}',
    lastMigrationAccessibilityLabel:
      'Last migration: version {{version}}, {{name}}, applied {{date}}, app version {{appVersion}}',
    storageSection: 'Storage',
    fileSizeLabel: 'Database file size',
    integrityLabel: 'Integrity check',
    integrityOk: 'OK',
    integrityFailedLabel: 'Integrity problems found',
    tablesSection: 'Tables',
    tableCount: { one: '{{count}} table', other: '{{count}} tables' },
    rowCount: { one: '{{count}} row', other: '{{count}} rows' },
    engineSection: 'SQLite engine',
    sqliteVersionLabel: 'SQLite version',
    compileOptionsLabel: 'Compile options',
    compileOptionsCount: { one: '{{count}} option', other: '{{count}} options' },
    capabilitiesSection: 'Capability checks',
    fts5Label: 'FTS5 full-text search',
    partialIndexLabel: 'Partial indexes',
    available: 'Available',
    unavailable: 'Not available',
  },
} as const;
