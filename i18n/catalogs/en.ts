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
  boot: {
    unsupportedVersionMessage:
      'This app cannot open your data (database v{{databaseVersion}}, this build only supports up to v{{highestKnownVersion}}). Please update the app.',
    genericErrorMessage: 'GymTracker could not start: {{detail}}',
  },
  tabs: {
    home: 'Home',
    plans: 'Plans',
    exercises: 'Exercises',
    stats: 'Stats',
    profile: 'Profile',
  },
  comingSoon: {
    plansTitle: 'Plans are coming soon',
    plansMessage:
      'Build reusable workout plans and start a session straight from one. Not built yet - it lands in a later phase.',
    exercisesTitle: 'The exercise library is coming soon',
    exercisesMessage:
      'Browse and search the full exercise catalog with videos and history. Not built yet - it lands in a later phase.',
    statsTitle: 'Stats are coming soon',
    statsMessage:
      'Track volume, personal records, and progress over time. Not built yet - it lands in a later phase.',
  },
  onboarding: {
    title: 'Welcome to GymTracker',
    subtitle: 'Set a nickname to get started. Everything stays on this device.',
    nicknameLabel: 'Nickname',
    nicknamePlaceholder: 'What should we call you?',
    nicknameRequiredError: 'Enter a nickname to continue.',
    nicknameTooLongError: 'Nickname must be {{max}} characters or fewer.',
    avatarSectionTitle: 'Profile photo (optional)',
    choosePhotoLabel: 'Choose a photo',
    changePhotoLabel: 'Change photo',
    skipAvatarLabel: 'Skip for now',
    avatarPermissionDeniedMessage:
      'Photo library access was denied. You can still continue without a photo - add one later from Profile.',
    continueLabel: 'Continue',
    genericErrorMessage: 'Something went wrong setting up your profile. Please try again.',
  },
  profile: {
    editAvatarAccessibilityLabel: 'Change profile photo',
    settingsRowTitle: 'Settings',
    settingsRowSubtitle: 'Units, haptics, and about',
    loadErrorMessage: 'Could not load your profile.',
  },
  profileSettings: {
    title: 'Settings',
    unitsRowTitle: 'Units',
    unitsRowSubtitleTemplate: '{{weight}} / {{length}}',
    hapticsRowTitle: 'Haptics',
    hapticsRowSubtitle: 'Vibration feedback for taps and completions',
    aboutRowTitle: 'About',
  },
  unitsSettings: {
    title: 'Units',
    weightSectionTitle: 'Weight',
    lengthSectionTitle: 'Length',
    weightKg: 'kg',
    weightLb: 'lb',
    lengthCm: 'cm',
    lengthIn: 'in',
    previewLabel: 'Example',
    previewWeightSample: 'Bench press: {{value}}',
    previewLengthSample: 'Height: {{value}}',
  },
  about: {
    title: 'About',
    versionLabel: 'Version',
    licenseSectionTitle: 'License and data',
    licenseMessage:
      'GymTracker is offline-only: your data never leaves this device and there is no account or cloud sync.',
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
