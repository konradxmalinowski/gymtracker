# P14 data-transfer: domain + repository slice

Sub-slice of `plans/2026-09-01-p14-data-transfer.md` (the full P14 orchestration
plan, already on disk). This file covers only the backend-agent slice dispatched
directly: `features/data-transfer/{types,domain,repository}/`. Service, hooks,
screens, `services/container.ts`, `navigation/routes.ts`, `i18n/catalogs/en.ts`
and `app/**` are explicitly out of scope here - a later agent owns them.

## Task description and acceptance criteria

Implement, per `docs/adr/0013-export-import-formats.md`:

- `types/`: camelCase DTOs for the JSON envelope (`ExportEnvelopeV1` and every
  nested entity), plus `ImportPreview`/`ImportResult` shared contract types.
- `domain/`: Zod schemas for every envelope level, a versioned `migrateExport`
  chain (`InvalidExportFormatError`/`UnsupportedExportVersionError`), RFC 4180
  CSV encode/decode (UTF-8 BOM, `\r\n`), the CSV row mapper (app's own column
  layout) and CSV import grouping/exercise-resolution helpers (own
  `foldDiacritics`, not imported from `exercise-library`).
- `repository/`: `DataTransferRepository`/`SqliteDataTransferRepository` -
  streaming-friendly batched reads for the two large tables (sessions/sets),
  unbounded reads for small tables, upsert-by-id merge writes (newer
  `updated_at` wins) for every importable entity, and a FK-safe
  `purgeAllUserData` for replace mode.
- No tests (`__tests__/**`) this pass - explicit project-wide instruction.

## Files to create

`features/data-transfer/types/ExportEnvelope.ts`,
`features/data-transfer/types/ImportTypes.ts`,
`features/data-transfer/domain/exportEnvelopeSchema.ts`,
`features/data-transfer/domain/migrateExport.ts`,
`features/data-transfer/domain/csv.ts`,
`features/data-transfer/domain/csvRowMapper.ts`,
`features/data-transfer/domain/csvImportGrouping.ts`,
`features/data-transfer/repository/DataTransferRepository.ts`,
`features/data-transfer/repository/SqliteDataTransferRepository.ts`.

## API contract

Not a network API - the JSON envelope shape and CSV column layout are
ADR-0013's own contract, reproduced in the types/domain files above. The
`DataTransferRepository` interface is this slice's contract with the next
agent (service layer) - see the final report for its exact method list.

## DB changes

None - reads/writes existing P2-P13 schema only, no migration.

## Error handling strategy

`InvalidExportFormatError`/`UnsupportedExportVersionError` (domain,
`migrateExport.ts`) for malformed/future-version files, thrown before any Zod
parse succeeds. Repository methods reuse `RepositoryNotFoundError` where an
id-scoped operation targets a missing row (mirroring every other repository in
this codebase); merge upserts never throw on a stale write, they no-op via the
SQL `WHERE excluded.updated_at > table.updated_at` upsert guard.

## Edge cases

Empty database export (zero rows in every table - every read returns `[]`/
`0`, never throws); reimporting the same file twice (upsert-by-id with the
newer-wins guard is a true no-op the second time, not just harmless); a
soft-deleted row round-tripping through export/merge-import (deletedAt is
preserved and propagated, not filtered out - see export judgment call in the
report); an unresolvable CSV exercise (falls back to
`createExerciseFromName`, never silently dropped); catalog exercises are
never exported/purged (`WHERE source = 'custom'` throughout).
