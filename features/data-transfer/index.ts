/**
 * Public barrel for the "data-transfer" feature.
 *
 * This is the ONLY surface other features may import from (ARCHITECTURE.md
 * section 3.1, rule 4 - enforced by the import/no-restricted-paths zones in
 * eslint.config.js). Reaching into "features/data-transfer/<subfolder>/..." from any
 * other feature is a lint error; import from "@/features/data-transfer" instead.
 *
 * P14 (docs/ROADMAP.md): the domain error/version types, the DTO types the
 * export/import screens render, the repository *interface* (never
 * `SqliteDataTransferRepository` itself - every existing feature barrel
 * enforces this same "interface only" rule), and the service plus its
 * dependency/input types and error classes land here now, mirroring
 * `body-metrics`' own barrel shape exactly.
 *
 * Hooks/screens/components are deliberately NOT exported here, matching
 * `body-metrics`' own barrel precedent (not `records`', whose hooks are
 * barrel-exported because `workout-logging` needs to cross-feature-import
 * them): nothing outside this feature ever needs to reach `data-transfer`'s
 * hooks or screens - `app/profile/settings/{export,import,import-preview}.tsx`
 * import screens by direct file path, the same "screens are never
 * barrel-exported" rule every other feature in this codebase already
 * follows.
 */

export type { ExportCounts, DataTransferRepository } from './repository/DataTransferRepository';

export {
  EXPORT_FORMAT,
  CURRENT_EXPORT_ENVELOPE_VERSION,
  type ExportEnvelopeV2,
  type ExportEnvelopeData,
} from './types/ExportEnvelope';

export type {
  ImportEntityCounts,
  ImportPreview,
  ImportResult,
  ImportWarning,
} from './types/ImportTypes';

export { InvalidExportFormatError, UnsupportedExportVersionError } from './domain/migrateExport';

export {
  DataTransferService,
  DEFAULT_IMPORTED_SESSION_TITLE,
  type DataTransferServiceDependencies,
} from './services/DataTransferService';

export { InvalidCsvFormatError, ReplaceImportNotConfirmedError } from './services/errors';
