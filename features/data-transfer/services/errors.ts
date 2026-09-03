/**
 * Error classes `DataTransferService` throws - mirrors the shape every other
 * feature's `services/errors.ts` already uses (`PlanValidationError`,
 * `BodyMetricValidationError`/`ProgressPhotoValidationError`, etc).
 */

/**
 * Thrown by `previewImportCsv`/`importCsv` when the file handed in isn't a
 * recognizable CSV export from this app at all - empty, or a header row
 * that's missing or shorter than `CSV_HEADER_ROW`. Distinct from
 * `InvalidExportFormatError` (`../domain/migrateExport.ts`, JSON-specific) so
 * a caller can offer format-appropriate guidance; deliberately mirrors that
 * class's constructor shape (a single human-readable reason string) rather
 * than a Zod-issues array, since CSV parsing has no schema to report issues
 * from - a CSV file either has a usable header or it doesn't.
 */
export class InvalidCsvFormatError extends Error {
  constructor(reason: string) {
    super(`This file is not a valid GymTracker CSV export: ${reason}`);
    this.name = 'InvalidCsvFormatError';
  }
}

/**
 * Thrown by `importJson(..., 'replace', ...)` when the caller did not pass
 * `{ confirmed: true }` - the service-layer half of ADR-0013's "guarded by a
 * typed confirmation" replace-mode seatbelt. The typed-phrase confirmation
 * UI itself (asking the user to type e.g. "DELETE" or "REPLACE") is a screen
 * concern, built by a later frontend-agent pass; this error exists so that
 * no code path can reach `purgeAllUserData()` without the presentation layer
 * having already gated it behind that UI and explicitly passed the flag
 * through - `importJson` itself never purges on its own judgment.
 */
export class ReplaceImportNotConfirmedError extends Error {
  constructor() {
    super(
      'Replace import requires explicit confirmation ({ confirmed: true }) - the caller must gate this behind its own typed-confirmation UI before calling importJson() in replace mode.',
    );
    this.name = 'ReplaceImportNotConfirmedError';
  }
}
