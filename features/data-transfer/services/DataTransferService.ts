import Constants from 'expo-constants';
import type { DatabaseContext, SqlExecutor } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import type { SettingsRepository } from '@/repositories/settings';
import type { Clock } from '@/services/clock';
import type { FileStorage } from '@/services/files';
import type { IdGenerator } from '@/services/id';
import { getDatabaseDiagnostics } from '@/database/diagnostics';
import { rebuildExerciseFts } from '@/database/seed/catalogSeeder';
import { isSetType, sessionDurationSeconds } from '@/features/workout-logging';
import {
  epleyFormula,
  brzyckiFormula,
  type OneRmFormula,
  type PersonalRecordService,
} from '@/features/records';
import type { ProgressPhotoService } from '@/features/body-metrics';
import { encodeCsv, decodeCsv } from '../domain/csv';
import { CSV_HEADER_ROW, mapSetToCsvRow } from '../domain/csvRowMapper';
import {
  foldNameForMatch,
  groupCsvRowsBySession,
  parseCsvDataRow,
  resolveCsvExercise,
  type CsvExerciseRef,
  type CsvParsedRow,
  type CsvSessionGroup,
  type ExerciseResolutionLookups,
} from '../domain/csvImportGrouping';
import { InvalidExportFormatError, migrateExport } from '../domain/migrateExport';
import {
  EXPORT_FORMAT,
  CURRENT_EXPORT_ENVELOPE_VERSION,
  type ExportEnvelopeV1,
  type ExportSession,
  type ExportSessionExercise,
  type ExportWorkoutSet,
} from '../types/ExportEnvelope';
import type {
  ImportEntityCounts,
  ImportPreview,
  ImportResult,
  ImportWarning,
} from '../types/ImportTypes';
import type { DataTransferRepository, ExportCounts } from '../repository/DataTransferRepository';
import { InvalidCsvFormatError, ReplaceImportNotConfirmedError } from './errors';

/**
 * `DataTransferService` (feature: `data-transfer`) - the only door into
 * `DataTransferRepository` for presentation (ARCHITECTURE.md section 3.1
 * rule 3), and the piece of ADR-0013 that actually orchestrates the
 * repository's export/import primitives into the four user-facing actions:
 * "Create backup (JSON)", "Export workout log (CSV)", and JSON/CSV import
 * (each with its own preview step). See each public method's own doc
 * comment for its exact contract; the header comments on the private
 * streaming/rebuild helpers below explain the two design decisions ADR-0013
 * leaves the service-orchestration layer to resolve: how streaming actually
 * stays streaming on disk, and what "one transaction per entity batch"
 * really means in a codebase where `DatabaseContext.transaction()` already
 * joins nested calls into one outer transaction.
 */

/** Relative directory under the `'cache'` `FileStorage` root every export/backup file is written into - transient, handed to the share sheet, not meant to accumulate (see this service's own header comment on why `'cache'`, not `'document'`). */
const EXPORT_DIRECTORY = 'exports';

/**
 * Sessions per page for the JSON backup's streamed `data.sessions` array and
 * for this service's own local-session lookup reads (`compareSessionsAgainstLocal`/
 * `previewImportCsv`) - chosen in the 200-500 range ADR-0013's own "streams
 * entity batches" guidance suggests. 250 keeps each page's `JSON.stringify`
 * calls (one per session, never one per page) comfortably small even for a
 * plan/session with many exercises, while keeping the number of round trips
 * modest against the 75,000-set/multi-thousand-session worst-case fixture.
 */
const SESSION_EXPORT_PAGE_SIZE = 250;

/**
 * Rows per page for the CSV export's streamed `v_working_set` read. CSV rows
 * are flat and far smaller per-row than a nested session aggregate, so a
 * larger page is cheap; 1000 keeps the number of round trips low without ever
 * holding more than one page's worth of encoded text in memory at once.
 */
const CSV_EXPORT_PAGE_SIZE = 1000;

/** Fallback title for a CSV-imported session with an empty `session_title` column - mirrors `DEFAULT_QUICK_START_TITLE`'s own "exported so a presentation layer can substitute a localized string later" reasoning (`SqliteWorkoutSessionRepository.ts`), even though nothing calls this with an override today. */
export const DEFAULT_IMPORTED_SESSION_TITLE = 'Imported workout';

export interface DataTransferServiceDependencies {
  repository: DataTransferRepository;
  recordService: PersonalRecordService;
  progressPhotoService: ProgressPhotoService;
  settings: SettingsRepository;
  /** A `FileStorage` scoped to the `'cache'` root - `services/container.ts` constructs this the same way it already constructs `logging`'s own cache-scoped `FileStorage` (`createFileStorage('cache')`), rather than adding a new `AppContainer` member for it. */
  files: FileStorage;
  db: DatabaseContext;
  clock: Clock;
  idGenerator: IdGenerator;
}

// ============================================================================
// Small parsing/formatting helpers (CSV import number/date reconstruction)
// ============================================================================

function parseNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIntOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePositiveIntOrDefault(value: string, fallback: number): number {
  const parsed = parseIntOrNull(value);
  return parsed !== null && parsed >= 1 ? parsed : fallback;
}

/**
 * Reconstructs an epoch-ms instant from the CSV's `date` (`YYYY-MM-DD`) and
 * `time` (`HH:MM`) columns plus a timezone offset - the exact inverse of
 * `csvRowMapper.ts#formatLocalTimeOfDay`'s own arithmetic. **Lossy by
 * necessity**: the CSV format never carries a per-row (or per-session)
 * timezone offset (ADR-0013's CSV column list has no such column), so the
 * offset used here is always the *importing device's current* offset
 * (`Clock.timezoneOffsetMinutes()`), not whatever offset was in effect when
 * the row was originally exported. For a file imported on the same device/
 * timezone it exported from, this round-trips exactly; for a file imported
 * after a timezone change (travel, DST) or on a different device, the
 * reconstructed instant can be off by the difference between the two
 * offsets - an accepted, documented consequence of CSV being "deliberately
 * lossy" (ADR-0013), not a bug. Returns `null` for a `date`/`time` pair that
 * doesn't match the expected format at all (caller falls back to "now").
 */
function parseLocalDateTimeToEpochMs(
  date: string,
  time: string,
  tzOffsetMinutes: number,
): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!dateMatch) return null;
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time.trim());
  const hours = timeMatch ? Number(timeMatch[1]) : 0;
  const minutes = timeMatch ? Number(timeMatch[2]) : 0;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const utcMsOfLocalWallClock = Date.UTC(year, month - 1, day, hours, minutes);
  return utcMsOfLocalWallClock - tzOffsetMinutes * 60000;
}

/** `encodeCsv`'s own private BOM character, duplicated here so a later batch's encoded text can have its (unwanted, mid-file) BOM stripped before being appended - the same "duplicate one small constant rather than reach past a module's public API" call `features/statistics/domain/localDate.ts` documents for its own calendar-math duplication. */
const BOM_CHAR = '﻿';
function stripLeadingBom(value: string): string {
  return value.startsWith(BOM_CHAR) ? value.slice(1) : value;
}

// ============================================================================
// Preview comparison helpers
// ============================================================================

interface WithUpdatedAt {
  updatedAt: number;
}

/**
 * `ImportEntityCounts` for one entity array: every file row is looked up
 * locally by `keyFn`; missing -> `toCreate`, present with an older-or-equal
 * local `updatedAt` -> `unchanged`, present with a newer file `updatedAt` ->
 * `toUpdate`. Mirrors `upsertRow`'s own "newer `updated_at` wins" comparison
 * exactly (`SqliteDataTransferRepository.upsertRow`'s `WHERE excluded.updated_at
 * > table.updated_at`), so preview counts agree with what a real import
 * would actually do.
 */
function compareEntityCounts<T extends WithUpdatedAt>(
  localRows: readonly T[],
  fileRows: readonly T[],
  keyFn: (row: T) => string,
): ImportEntityCounts {
  const localByKey = new Map<string, T>();
  for (const row of localRows) {
    localByKey.set(keyFn(row), row);
  }
  let toCreate = 0;
  let toUpdate = 0;
  let unchanged = 0;
  for (const fileRow of fileRows) {
    const local = localByKey.get(keyFn(fileRow));
    if (!local) {
      toCreate += 1;
    } else if (fileRow.updatedAt > local.updatedAt) {
      toUpdate += 1;
    } else {
      unchanged += 1;
    }
  }
  return { toCreate, toUpdate, unchanged };
}

const EMPTY_ENTITY_COUNTS: ImportEntityCounts = { toCreate: 0, toUpdate: 0, unchanged: 0 };

/**
 * The only door into `DataTransferRepository` (ARCHITECTURE.md section 3.1
 * rule 3). See this file's own header comment for the design decisions this
 * class resolves that ADR-0013 and `DataTransferRepository`'s own doc
 * comment leave to the service-orchestration layer.
 */
export class DataTransferService {
  constructor(private readonly deps: DataTransferServiceDependencies) {}

  // ==========================================================================
  // Export
  // ==========================================================================

  /**
   * ADR-0013 "Create backup (JSON)". Builds the full envelope and writes it
   * to a file under the `'cache'` root's `exports/` directory via streamed
   * batch-appends - never one `JSON.stringify` over the whole aggregate (the
   * hard NFR). See {@link writeBackupFile}'s own doc comment for exactly how.
   *
   * @throws {Error} when onboarding has never run (no `user_profile` row to
   * export) - not a real scenario in practice, since the export screen is
   * only reachable post-onboarding, but `exportProfile()` can genuinely
   * return `null` and the envelope's `data.profile` is non-nullable, so this
   * is a real, if unreachable-in-the-UI, failure mode rather than a silent
   * `null` written into an otherwise-schema-valid file.
   */
  async exportBackup(): Promise<{ filePath: string; counts: ExportCounts }> {
    return this.writeBackupFile('gymtracker-backup');
  }

  /**
   * ADR-0013 "Export workout log (CSV)". Streams `countCsvSetRows`/
   * `exportCsvSetRowsBatch` through `csvRowMapper#mapSetToCsvRow` and
   * `csv#encodeCsv`, one page at a time - see this method's own body for how
   * the BOM (which `encodeCsv` prepends to every call) is kept to exactly one
   * occurrence, at the very start of the file, across many `encodeCsv` calls.
   */
  async exportCsv(): Promise<{ filePath: string; rowCount: number }> {
    const formula = await this.resolveOneRmFormula();
    const total = await this.deps.repository.countCsvSetRows();
    const timestamp = this.deps.clock.now();
    const tempRelativePath = `${EXPORT_DIRECTORY}/.tmp-gymtracker-log-${timestamp}.csv`;
    const finalRelativePath = `${EXPORT_DIRECTORY}/gymtracker-log-${timestamp}.csv`;

    // Header row - the file's one and only BOM.
    await this.deps.files.writeText(tempRelativePath, encodeCsv([CSV_HEADER_ROW]));

    let offset = 0;
    let rowCount = 0;
    while (offset < total) {
      const batch = await this.deps.repository.exportCsvSetRowsBatch(offset, CSV_EXPORT_PAGE_SIZE);
      if (batch.length === 0) break;
      const mappedRows = batch.map((row) => mapSetToCsvRow(row, formula));
      // `encodeCsv` always prepends a BOM - stripped here so only the header
      // write above contributes the file's single leading BOM.
      await this.deps.files.appendText(tempRelativePath, stripLeadingBom(encodeCsv(mappedRows)));
      rowCount += batch.length;
      offset += batch.length;
    }

    await this.commitTempFile(tempRelativePath, finalRelativePath);
    return { filePath: this.deps.files.getUri(finalRelativePath), rowCount };
  }

  // ==========================================================================
  // Import preview
  // ==========================================================================

  /**
   * ADR-0013: "shows exactly what will be created and which rows could not
   * be resolved, before anything is written." Fully validates the file
   * (`migrateExport` + its Zod chain - throws {@link InvalidExportFormatError}/
   * `UnsupportedExportVersionError` for anything malformed/foreign/
   * future-versioned) before comparing anything against the local database.
   * Zero writes.
   */
  async previewImportJson(fileContent: string): Promise<ImportPreview> {
    const envelope = this.parseJsonEnvelope(fileContent);
    const warnings: ImportWarning[] = [];

    const [
      localProfile,
      localSettings,
      localCustomExercises,
      localExerciseUserData,
      localExerciseVideos,
      localPlans,
      localBodyMetrics,
      localProgressPhotos,
    ] = await Promise.all([
      this.deps.repository.exportProfile(),
      this.deps.repository.exportSettings(),
      this.deps.repository.exportCustomExercises(),
      this.deps.repository.exportExerciseUserData(),
      this.deps.repository.exportExerciseVideos(),
      this.deps.repository.exportPlans(),
      this.deps.repository.exportBodyMetrics(),
      this.deps.repository.exportProgressPhotos(),
    ]);

    const localSessionUpdatedAt = await this.loadLocalSessionUpdatedAtMap();

    this.appendSingleActiveInvariantWarnings(envelope, warnings);

    return {
      profile: compareProfileCounts(localProfile, envelope.data.profile),
      settings: compareEntityCounts(localSettings, envelope.data.settings, (row) => row.key),
      customExercises: compareEntityCounts(
        localCustomExercises,
        envelope.data.customExercises,
        (row) => row.id,
      ),
      exerciseUserData: compareEntityCounts(
        localExerciseUserData,
        envelope.data.exerciseUserData,
        (row) => row.exerciseId,
      ),
      exerciseVideos: compareEntityCounts(
        localExerciseVideos,
        envelope.data.exerciseVideos,
        (row) => row.id,
      ),
      plans: compareEntityCounts(localPlans, envelope.data.plans, (row) => row.id),
      sessions: compareSessionCounts(localSessionUpdatedAt, envelope.data.sessions),
      bodyMetrics: compareEntityCounts(
        localBodyMetrics,
        envelope.data.bodyMetrics,
        (row) => row.id,
      ),
      progressPhotos: compareEntityCounts(
        localProgressPhotos,
        envelope.data.progressPhotos,
        (row) => row.id,
      ),
      warnings,
    };
  }

  /**
   * ADR-0013 CSV import section: groups rows into sessions, resolves each
   * group's exercise references, and reports exactly what would happen -
   * **without writing anything**. Unlike {@link resolveOrCreateCsvExercise}
   * (used by the real import), this never calls
   * `DataTransferRepository.createExerciseFromName` - `resolveCsvExercise`
   * itself only ever reads (`{ kind: 'unresolved', name }` on a miss, no
   * write), so preview naturally cannot write by construction; every
   * unresolved reference becomes an `ImportWarning` plus a
   * `customExercises.toCreate` count instead.
   */
  async previewImportCsv(fileContent: string): Promise<ImportPreview> {
    const { groups, warnings } = this.parseCsvIntoGroups(fileContent);

    const lookups = this.buildExerciseResolutionLookups();
    const localSessionUpdatedAt = await this.loadLocalSessionUpdatedAtMap();

    const unresolvedNames = new Set<string>();
    let sessionsToCreate = 0;
    let sessionsToUpdate = 0;

    for (const group of groups) {
      if (group.sessionId && localSessionUpdatedAt.has(group.sessionId)) {
        sessionsToUpdate += 1;
      } else {
        sessionsToCreate += 1;
      }

      for (const row of group.rows) {
        const ref: CsvExerciseRef = {
          slug: row.exerciseSlug,
          id: row.exerciseId,
          name: row.exercise,
        };
        const resolution = await resolveCsvExercise(ref, lookups);
        if (resolution.kind === 'unresolved') {
          const foldedKey = foldNameForMatch(resolution.name);
          if (!unresolvedNames.has(foldedKey)) {
            unresolvedNames.add(foldedKey);
            warnings.push({
              entity: 'exercise',
              subject: resolution.name,
              message: `Exercise "${resolution.name}" was not found locally and will be created as a new custom exercise.`,
            });
          }
        }
      }
    }

    return {
      profile: EMPTY_ENTITY_COUNTS,
      settings: EMPTY_ENTITY_COUNTS,
      customExercises: { toCreate: unresolvedNames.size, toUpdate: 0, unchanged: 0 },
      exerciseUserData: EMPTY_ENTITY_COUNTS,
      exerciseVideos: EMPTY_ENTITY_COUNTS,
      plans: EMPTY_ENTITY_COUNTS,
      sessions: { toCreate: sessionsToCreate, toUpdate: sessionsToUpdate, unchanged: 0 },
      bodyMetrics: EMPTY_ENTITY_COUNTS,
      progressPhotos: EMPTY_ENTITY_COUNTS,
      warnings,
    };
  }

  // ==========================================================================
  // Import
  // ==========================================================================

  /**
   * ADR-0013 "Import modes". Re-validates the file fully (never trusts a
   * prior `previewImportJson` call - the file could have changed on disk, or
   * preview could have been skipped entirely). Zero writes on any validation
   * failure.
   *
   * **Transaction shape** (see this file's own header comment): the entire
   * write phase - `purgeAllUserData` (replace mode only) plus every entity's
   * `upsert*` calls, in file order, plus this service's own
   * `recomputeSessionTotals`/`rebuildExerciseFts` steps - runs inside **one**
   * `DatabaseContext.transaction()` call, with that single `tx` threaded into
   * every repository call. `DatabaseContext.transaction()`'s own contract
   * ("nested calls join the outer transaction") means every individual
   * `upsert*`/`purgeAllUserData` call - each of which would open its *own*
   * transaction if called with no `tx` - instead just runs directly against
   * the outer one, so nothing here nests a second real transaction inside the
   * first. This reading resolves ADR-0013's "one transaction per entity
   * batch, and any failure rolls the whole import back" / "a failed import
   * leaves the database byte-identical" together as one requirement, not two:
   * "per entity batch" describes the *conceptual* grouping of writes (all of
   * one entity type's rows, in file order, before the next type starts - the
   * literal shape `applyEnvelopeWrites` below has), while "byte-identical on
   * any failure" is only actually guaranteed if nothing commits until every
   * batch has succeeded - which requires the batches to share one real
   * transaction, not several independently-committed ones. A failure on, say,
   * plan 5 of 20 therefore rolls back plans 1-4 too, not just plan 5.
   *
   * **Post-import rebuild sequence, split across two phases** (see
   * {@link runPostImportRebuild}'s own doc comment for why): the two steps
   * that are themselves repository methods taking an optional `tx`
   * (`recomputeSessionTotals`, and the domain function `rebuildExerciseFts`)
   * run *inside* this same outer transaction, in
   * {@link applyEnvelopeWrites}. The two steps that are calls into another
   * feature's *service* (`recordService.rebuild()`,
   * `progressPhotoService.verifyIntegrity()`) do not expose a `tx` parameter
   * at the service layer to join this transaction with, so they necessarily
   * run as a separate, best-effort step immediately after a successful
   * commit - documented in detail on {@link runPostImportRebuild}.
   *
   * @throws {ReplaceImportNotConfirmedError} when `mode === 'replace'` and
   * `options.confirmed !== true` - checked before any parsing or I/O.
   * @throws {InvalidExportFormatError} / `UnsupportedExportVersionError` for
   * a malformed/foreign/future-versioned file - zero writes.
   */
  async importJson(
    fileContent: string,
    mode: 'merge' | 'replace',
    options?: { confirmed?: boolean },
  ): Promise<ImportResult> {
    if (mode === 'replace' && options?.confirmed !== true) {
      throw new ReplaceImportNotConfirmedError();
    }

    const envelope = this.parseJsonEnvelope(fileContent);

    let backupFilePath: string | null = null;
    if (mode === 'replace') {
      // Step 1: automatic pre-replace backup, written and fully committed to
      // disk BEFORE any purge runs (ADR-0013's "seatbelt"). Reads the
      // database as it stands right now (nothing has been touched yet), via
      // the same streaming mechanism `exportBackup()` uses - see
      // `writeBackupFile`'s own doc comment. If this throws, `importJson`
      // propagates the error immediately and the transaction below never
      // starts - the database is untouched and no purge ever ran.
      const backup = await this.writeBackupFile('pre-replace-backup');
      backupFilePath = backup.filePath;
    }

    const written = await this.deps.db.transaction(async (tx) => {
      if (mode === 'replace') {
        await this.deps.repository.purgeAllUserData(tx);
      }
      return this.applyEnvelopeWrites(envelope, tx);
    });

    const warnings: ImportWarning[] = [];
    await this.runPostImportRebuild(warnings);

    return { mode, written, backupFilePath, warnings };
  }

  /**
   * ADR-0013 CSV import: "best-effort reconstruction of sessions." Always
   * merge-shaped (CSV has no replace mode - "it's a log, not a backup").
   * Re-parses the file fully; a malformed/short row becomes a per-row
   * `ImportWarning` (not a reason to fail the whole import), and an
   * unresolved exercise reference is actually created via
   * `createExerciseFromName` this time (unlike {@link previewImportCsv}),
   * inside the same outer transaction as everything else - see
   * {@link buildSessionFromCsvGroup}'s own doc comment for exactly how a CSV
   * row group is turned into an `ExportSession`.
   */
  async importCsv(fileContent: string): Promise<ImportResult> {
    const { groups, warnings } = this.parseCsvIntoGroups(fileContent);

    const written = await this.deps.db.transaction(async (tx) => {
      const lookups = this.buildExerciseResolutionLookups(tx);
      const createdExerciseIdsByFoldedName = new Map<EntityId, EntityId>();
      const createdCount = { value: 0 };

      let sessionsWritten = 0;
      let setsWritten = 0;
      const writtenSessionIds: EntityId[] = [];

      for (const group of groups) {
        const session = await this.buildSessionFromCsvGroup(
          group,
          lookups,
          createdExerciseIdsByFoldedName,
          createdCount,
          warnings,
          tx,
        );
        if (!session) continue;
        await this.deps.repository.upsertSession(session, tx);
        sessionsWritten += 1;
        writtenSessionIds.push(session.id);
        for (const exercise of session.exercises) {
          setsWritten += exercise.sets.length;
        }
      }

      for (const sessionId of writtenSessionIds) {
        await this.deps.repository.recomputeSessionTotals(sessionId, tx);
      }
      // Unconditional, matching `applyEnvelopeWrites`'s own reasoning - cheap
      // even when `createdCount.value === 0`.
      await rebuildExerciseFts(tx);

      return {
        profile: false,
        settings: 0,
        customExercises: createdCount.value,
        exerciseUserData: 0,
        exerciseVideos: 0,
        plans: 0,
        sessions: sessionsWritten,
        sets: setsWritten,
        bodyMetrics: 0,
        progressPhotos: 0,
      };
    });

    await this.runPostImportRebuild(warnings);

    return { mode: 'merge', written, backupFilePath: null, warnings };
  }

  // ==========================================================================
  // Private: export streaming
  // ==========================================================================

  /**
   * The one place that ever writes a JSON backup envelope to disk - shared by
   * {@link exportBackup} and `importJson`'s own pre-replace backup step, so
   * the streaming logic exists exactly once.
   *
   * **Streaming shape.** Writes the envelope's fixed "header" (`format`,
   * `version`, `exportedAt`, `app`, `units`, `counts`, plus the opening of
   * `"data":{`) as one `writeText`, then appends each `data.*` entity as its
   * own JSON fragment via repeated `appendText` calls, with manually-placed
   * commas/brackets so the concatenated result is valid JSON:
   *
   * - The small/unbounded tables (`profile`, `settings`, `customExercises`,
   *   `exerciseUserData`, `exerciseVideos`, `plans`, `personalRecords`,
   *   `bodyMetrics`, `progressPhotos`) are each one `JSON.stringify` call over
   *   an already-bounded array/object (`DataTransferRepository`'s own "smaller
   *   tables... single unbounded reads" guidance) - never the whole envelope,
   *   never `data.sessions`.
   * - `data.sessions` is the one array that can reach real scale. It is
   *   streamed via `countExportSessions`/`exportSessionsBatch(offset, limit)`
   *   in {@link SESSION_EXPORT_PAGE_SIZE}-session pages, each page's sessions
   *   individually `JSON.stringify`'d and joined with `,` before being
   *   appended - so the largest single in-memory JSON string this method ever
   *   produces is one page's worth, not the full export.
   *
   * **Write-then-commit.** Everything above is written to a `.tmp-`-prefixed
   * relative path first; only once every fragment has been appended
   * successfully does {@link commitTempFile} copy it to the real destination
   * name and delete the temp file - the same ADR-0012 ordering this codebase
   * already uses for photo/avatar writes, applied here to a file instead of a
   * database row: a failure partway through leaves, at worst, an orphaned
   * `.tmp-*` file, never a truncated file at the name a caller might try to
   * read back as a real backup.
   *
   * @param fileNamePrefix distinguishes a real backup (`'gymtracker-backup'`)
   * from an automatic pre-replace one (`'pre-replace-backup'`) in the
   * `exports/` directory listing - otherwise identical.
   */
  private async writeBackupFile(
    fileNamePrefix: string,
  ): Promise<{ filePath: string; counts: ExportCounts }> {
    const counts = await this.deps.repository.getExportCounts();
    const exportedAt = this.deps.clock.now();
    const diagnostics = await getDatabaseDiagnostics(this.deps.db);
    const appVersion = Constants.expoConfig?.version ?? '1.0.0';

    const [
      profile,
      settings,
      customExercises,
      exerciseUserData,
      exerciseVideos,
      plans,
      personalRecords,
      bodyMetrics,
      progressPhotos,
    ] = await Promise.all([
      this.deps.repository.exportProfile(),
      this.deps.repository.exportSettings(),
      this.deps.repository.exportCustomExercises(),
      this.deps.repository.exportExerciseUserData(),
      this.deps.repository.exportExerciseVideos(),
      this.deps.repository.exportPlans(),
      this.deps.repository.exportPersonalRecords(),
      this.deps.repository.exportBodyMetrics(),
      this.deps.repository.exportProgressPhotos(),
    ]);

    if (profile === null) {
      // See this class's own `exportBackup` doc comment - not reachable from
      // the real app (onboarding always runs first), handled rather than
      // assumed impossible per `DataTransferRepository.exportProfile`'s own
      // doc comment, and the envelope's `data.profile` is non-nullable so
      // there is no valid fragment to write in this case.
      throw new Error(
        'Cannot export a backup: no profile exists yet (onboarding has not completed).',
      );
    }

    const tempRelativePath = `${EXPORT_DIRECTORY}/.tmp-${fileNamePrefix}-${exportedAt}.json`;
    const finalRelativePath = `${EXPORT_DIRECTORY}/${fileNamePrefix}-${exportedAt}.json`;

    const header =
      `{"format":${JSON.stringify(EXPORT_FORMAT)},` +
      `"version":${CURRENT_EXPORT_ENVELOPE_VERSION},` +
      `"exportedAt":${exportedAt},` +
      `"app":${JSON.stringify({ version: appVersion, schemaVersion: diagnostics.schemaVersion })},` +
      `"units":${JSON.stringify({ weight: 'kg', length: 'cm' })},` +
      `"counts":${JSON.stringify(counts)},` +
      `"data":{`;
    await this.deps.files.writeText(tempRelativePath, header);

    await this.deps.files.appendText(tempRelativePath, `"profile":${JSON.stringify(profile)},`);
    await this.deps.files.appendText(tempRelativePath, `"settings":${JSON.stringify(settings)},`);
    await this.deps.files.appendText(
      tempRelativePath,
      `"customExercises":${JSON.stringify(customExercises)},`,
    );
    await this.deps.files.appendText(
      tempRelativePath,
      `"exerciseUserData":${JSON.stringify(exerciseUserData)},`,
    );
    await this.deps.files.appendText(
      tempRelativePath,
      `"exerciseVideos":${JSON.stringify(exerciseVideos)},`,
    );
    await this.deps.files.appendText(tempRelativePath, `"plans":${JSON.stringify(plans)},`);

    await this.deps.files.appendText(tempRelativePath, `"sessions":[`);
    const totalSessions = await this.deps.repository.countExportSessions();
    let offset = 0;
    let firstSessionPage = true;
    while (offset < totalSessions) {
      const page = await this.deps.repository.exportSessionsBatch(offset, SESSION_EXPORT_PAGE_SIZE);
      if (page.length === 0) break;
      const fragment =
        (firstSessionPage ? '' : ',') + page.map((session) => JSON.stringify(session)).join(',');
      await this.deps.files.appendText(tempRelativePath, fragment);
      firstSessionPage = false;
      offset += page.length;
    }
    await this.deps.files.appendText(tempRelativePath, `],`);

    await this.deps.files.appendText(
      tempRelativePath,
      `"personalRecords":${JSON.stringify(personalRecords)},`,
    );
    await this.deps.files.appendText(
      tempRelativePath,
      `"bodyMetrics":${JSON.stringify(bodyMetrics)},`,
    );
    await this.deps.files.appendText(
      tempRelativePath,
      `"progressPhotos":${JSON.stringify(progressPhotos)}`,
    );
    await this.deps.files.appendText(tempRelativePath, `}}`);

    await this.commitTempFile(tempRelativePath, finalRelativePath);
    return { filePath: this.deps.files.getUri(finalRelativePath), counts };
  }

  /** Write-then-commit: copies the fully-written temp file to its real name, then removes the temp - see {@link writeBackupFile}'s own doc comment. */
  private async commitTempFile(tempRelativePath: string, finalRelativePath: string): Promise<void> {
    await this.deps.files.copyFrom(this.deps.files.getUri(tempRelativePath), finalRelativePath);
    await this.deps.files.delete(tempRelativePath);
  }

  private async resolveOneRmFormula(): Promise<OneRmFormula> {
    const key = await this.deps.settings.get('oneRm.formula');
    return key === 'brzycki' ? brzyckiFormula : epleyFormula;
  }

  // ==========================================================================
  // Private: JSON parsing / preview comparison support
  // ==========================================================================

  private parseJsonEnvelope(fileContent: string): ExportEnvelopeV1 {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fileContent);
    } catch {
      throw new InvalidExportFormatError('the file is not valid JSON.');
    }
    return migrateExport(parsed);
  }

  /**
   * Full `id -> updatedAt` map over every local session, built by paging
   * through `countExportSessions`/`exportSessionsBatch` - reused by both
   * JSON preview's session comparison and CSV preview/import's "does this
   * `session_id` already exist locally" check. `DataTransferRepository` has
   * no dedicated "check session existence" read (see this method's own call
   * sites), and adding one was judged unnecessary next to reusing the
   * batched export reads the repository already exposes for exactly this
   * table - the same "prefer reusing what already exists" call the task
   * brief itself suggested. Only `id`/`updatedAt` are kept (not the full
   * nested aggregate each page actually returns) to keep this method's own
   * memory footprint small even against the 75,000-set fixture.
   */
  private async loadLocalSessionUpdatedAtMap(): Promise<Map<EntityId, number>> {
    const map = new Map<EntityId, number>();
    const total = await this.deps.repository.countExportSessions();
    let offset = 0;
    while (offset < total) {
      const page = await this.deps.repository.exportSessionsBatch(offset, SESSION_EXPORT_PAGE_SIZE);
      if (page.length === 0) break;
      for (const session of page) {
        map.set(session.id, session.updatedAt);
      }
      offset += page.length;
    }
    return map;
  }

  /**
   * Turns two of `DataTransferRepository`'s own documented "known
   * limitations" (`upsertPlan`'s `ux_plan_single_active` conflict,
   * `upsertSession`'s `ux_session_single_in_progress` conflict - both left
   * for "the service-orchestration layer to decide... or surface the
   * conflict to the user") into actionable preview warnings, computed
   * entirely from the already-in-memory parsed file (no extra DB reads).
   * Preview-only - `importJson` does not pre-empt or normalize these; a real
   * conflict still fails that one plan's/session's upsert at import time
   * (rolling back the whole transaction, per this class's own transaction-
   * shape reasoning), which is the correct, safe outcome. This just lets the
   * user see it coming.
   */
  private appendSingleActiveInvariantWarnings(
    envelope: ExportEnvelopeV1,
    warnings: ImportWarning[],
  ): void {
    const activePlanCount = envelope.data.plans.filter((plan) => plan.isActive).length;
    if (activePlanCount > 1) {
      warnings.push({
        entity: 'plan',
        message: `${activePlanCount} plans in this file are marked active, but only one plan can be active at a time. Importing will fail for whichever plan's row is not upserted first unless this is resolved.`,
      });
    }
    const inProgressCount = envelope.data.sessions.filter(
      (session) => session.status === 'in_progress',
    ).length;
    if (inProgressCount > 1) {
      warnings.push({
        entity: 'session',
        message: `${inProgressCount} sessions in this file are marked in progress, but only one session can be in progress at a time. Importing will fail for whichever session's row is not upserted first unless this is resolved.`,
      });
    }
  }

  // ==========================================================================
  // Private: JSON import writes
  // ==========================================================================

  /**
   * Upserts every row of every entity type, once per row, in file order,
   * within the caller's transaction `tx` - the literal "one entity type's
   * worth of rows, in file order" shape ADR-0013's "one transaction per
   * entity batch" describes (see `importJson`'s own doc comment for how this
   * reconciles with "the database must be byte-identical on failure"). Order
   * matches the envelope's own `data.*` key order (also `foreign_keys = ON`-
   * safe: `customExercises` before anything that references an exercise id,
   * `plans`/`sessions` last among the FK-bearing tables). `personalRecords`
   * is deliberately never written here - see `ExportPersonalRecord`'s own
   * doc comment.
   */
  private async applyEnvelopeWrites(
    envelope: ExportEnvelopeV1,
    tx: SqlExecutor,
  ): Promise<ImportResult['written']> {
    await this.deps.repository.upsertProfile(envelope.data.profile, tx);

    for (const setting of envelope.data.settings) {
      await this.deps.repository.upsertSetting(setting, tx);
    }
    for (const exercise of envelope.data.customExercises) {
      await this.deps.repository.upsertCustomExercise(exercise, tx);
    }
    for (const row of envelope.data.exerciseUserData) {
      await this.deps.repository.upsertExerciseUserData(row, tx);
    }
    for (const video of envelope.data.exerciseVideos) {
      await this.deps.repository.upsertExerciseVideo(video, tx);
    }
    for (const plan of envelope.data.plans) {
      await this.deps.repository.upsertPlan(plan, tx);
    }

    let setsWritten = 0;
    const writtenSessionIds: EntityId[] = [];
    for (const session of envelope.data.sessions) {
      await this.deps.repository.upsertSession(session, tx);
      writtenSessionIds.push(session.id);
      for (const exercise of session.exercises) {
        setsWritten += exercise.sets.length;
      }
    }

    for (const entry of envelope.data.bodyMetrics) {
      await this.deps.repository.upsertBodyMetric(entry, tx);
    }
    for (const photo of envelope.data.progressPhotos) {
      await this.deps.repository.upsertProgressPhoto(photo, tx);
    }

    // In-transaction half of the post-import rebuild sequence - see
    // `importJson`'s own doc comment for why these two specifically join
    // this transaction while the other two run after commit.
    for (const sessionId of writtenSessionIds) {
      await this.deps.repository.recomputeSessionTotals(sessionId, tx);
    }
    await rebuildExerciseFts(tx);

    return {
      profile: true,
      settings: envelope.data.settings.length,
      customExercises: envelope.data.customExercises.length,
      exerciseUserData: envelope.data.exerciseUserData.length,
      exerciseVideos: envelope.data.exerciseVideos.length,
      plans: envelope.data.plans.length,
      sessions: envelope.data.sessions.length,
      sets: setsWritten,
      bodyMetrics: envelope.data.bodyMetrics.length,
      progressPhotos: envelope.data.progressPhotos.length,
    };
  }

  /**
   * The post-commit half of the post-import rebuild sequence (ADR-0013:
   * "`PersonalRecordService.rebuildAll()` runs... `ProgressPhotoRepository
   * .verifyIntegrity()` runs"). Split from {@link applyEnvelopeWrites}'s own
   * in-transaction half (`recomputeSessionTotals`/`rebuildExerciseFts`)
   * because neither `PersonalRecordService.rebuild()` nor
   * `ProgressPhotoService.verifyIntegrity()` accepts a `tx` parameter at the
   * service layer - both are cross-feature calls this service reaches
   * through their public barrels (`@/features/records`, `@/features/body-metrics`),
   * and neither barrel exposes the kind of transaction-composable method
   * `WorkoutSessionRepository.completeSet` gets to use for its own
   * repository-to-repository PR evaluation. Consequence, stated plainly: if
   * the main import transaction commits successfully but this step then
   * throws, the imported data is **not** rolled back (it already committed)
   * - the caller sees the thrown error, and the correct recovery is exactly
   * what this codebase's Settings screen already offers for a stale PR cache:
   * "Recalculate records." This is a real, narrow gap from "fully atomic
   * with the base import," accepted because the alternative (reaching past
   * either service's own public contract to call its repository directly)
   * would violate this codebase's "no direct repository access, one door in"
   * rule one layer up from where this service itself sits.
   *
   * `ProgressPhotoIntegrityReport.danglingRows` (live rows whose photo file
   * is missing on disk - always expected after a JSON restore, since photo
   * binaries are never included in a backup, ADR-0012/ADR-0013) is folded
   * into `warnings` rather than silently discarded, per the task brief's own
   * instruction.
   */
  private async runPostImportRebuild(warnings: ImportWarning[]): Promise<void> {
    await this.deps.recordService.rebuild();
    const integrityReport = await this.deps.progressPhotoService.verifyIntegrity();
    for (const row of integrityReport.danglingRows) {
      warnings.push({
        entity: 'progressPhoto',
        subject: row.id,
        message:
          'This photo’s file is missing on disk - expected after restoring a JSON backup, since photo binaries are never included in one (ADR-0012). The photo’s metadata (date, pose, note) was restored; re-add the picture itself if you still have it.',
      });
    }
  }

  // ==========================================================================
  // Private: CSV parsing / grouping / exercise resolution
  // ==========================================================================

  /** Shared by `previewImportCsv`/`importCsv`: decodes, validates the header, parses every data row (a too-short row becomes a warning, not a thrown error), and groups the survivors into sessions. */
  private parseCsvIntoGroups(fileContent: string): {
    groups: CsvSessionGroup[];
    warnings: ImportWarning[];
  } {
    const rows = decodeCsv(fileContent);
    if (rows.length === 0) {
      throw new InvalidCsvFormatError('the file is empty.');
    }
    const [header, ...dataRows] = rows;
    if (!header || header.length < CSV_HEADER_ROW.length) {
      throw new InvalidCsvFormatError(
        'the header row is missing or has fewer columns than expected.',
      );
    }

    const warnings: ImportWarning[] = [];
    const parsedRows: CsvParsedRow[] = [];
    dataRows.forEach((fields, index) => {
      const parsed = parseCsvDataRow(fields);
      if (!parsed) {
        warnings.push({
          entity: 'session',
          subject: `row ${index + 2}`,
          message: 'This row has fewer columns than expected and was skipped.',
        });
        return;
      }
      parsedRows.push(parsed);
    });

    return { groups: groupCsvRowsBySession(parsedRows), warnings };
  }

  private buildExerciseResolutionLookups(tx?: SqlExecutor): ExerciseResolutionLookups {
    return {
      resolveBySlug: (slug) => this.deps.repository.findExerciseIdBySlug(slug, tx),
      resolveById: (id) => this.deps.repository.findExerciseIdById(id, tx),
      resolveByExactName: (name) => this.deps.repository.findExerciseIdByExactName(name, tx),
      resolveByFoldedName: (foldedName) =>
        this.deps.repository.findExerciseIdByFoldedName(foldedName, tx),
    };
  }

  /**
   * Resolves one CSV row's exercise reference, creating a new custom exercise
   * via `createExerciseFromName` on a genuine miss (ADR-0013: "unresolved
   * names become custom exercises") - the real-write counterpart to
   * {@link previewImportCsv}'s read-only handling of the same case.
   * `createdIdsByFoldedName` caches by the same diacritic-folded key
   * `resolveByFoldedName` itself matches against, so two rows spelling the
   * same exercise name differently-cased (or with/without a diacritic) still
   * share one newly-created exercise within this import rather than creating
   * a duplicate per row.
   */
  private async resolveOrCreateCsvExercise(
    ref: CsvExerciseRef,
    lookups: ExerciseResolutionLookups,
    createdIdsByFoldedName: Map<string, EntityId>,
    createdCount: { value: number },
    warnings: ImportWarning[],
    tx: SqlExecutor,
  ): Promise<EntityId> {
    const resolution = await resolveCsvExercise(ref, lookups);
    if (resolution.kind === 'resolved') {
      return resolution.exerciseId;
    }

    const foldedKey = foldNameForMatch(resolution.name);
    const cached = createdIdsByFoldedName.get(foldedKey);
    if (cached) {
      return cached;
    }

    const newId = await this.deps.repository.createExerciseFromName(resolution.name, tx);
    createdIdsByFoldedName.set(foldedKey, newId);
    createdCount.value += 1;
    warnings.push({
      entity: 'exercise',
      subject: resolution.name,
      message: `Exercise "${resolution.name}" was not found locally and was created as a new custom exercise.`,
    });
    return newId;
  }

  /**
   * Builds one `ExportSession` ready for `upsertSession` from one
   * `CsvSessionGroup` - ADR-0013's "best-effort reconstruction of sessions."
   * Mapping, documented field by field since none of this round-trips
   * losslessly (CSV is "deliberately lossy," ADR-0013):
   *
   * - `id`: the group's own `sessionId` when present (a re-export of this
   *   app's own CSV always carries one, so re-importing it updates the same
   *   session rather than duplicating it); otherwise a fresh id.
   * - `status`: always `'completed'` - the CSV format only ever exports
   *   completed working sets from completed sessions (`v_working_set`), so
   *   there is no other status a CSV-derived session could faithfully claim.
   * - `startedAt`/`finishedAt`: the min/max of every set's own reconstructed
   *   `performedAt` (see {@link parseLocalDateTimeToEpochMs}) in the group -
   *   an approximation, not the session's real original start/finish instant
   *   (which the CSV format never captured to begin with).
   * - `durationSeconds`: computed once, here, from that same start/finish
   *   pair via `sessionDurationSeconds` - **not** left for
   *   `recomputeSessionTotals` to fill in later, since that method
   *   deliberately never touches `duration_seconds` (see its own doc
   *   comment) and nothing else would ever set it for a CSV-only session.
   * - `totalVolumeKg`/`totalSets`/`totalReps`: left `null` here and filled in
   *   by this service's own post-write `recomputeSessionTotals` call (this
   *   method's caller), the same real derivation `finish()` itself uses -
   *   cheaper and more obviously correct than hand-deriving the same formula
   *   a second time in this mapping.
   * - `estimatedKcal`: left `null` - the CSV format carries no calorie data
   *   and estimating it would require reading `workout.showEstimatedCalories`
   *   for data this format was never going to reproduce faithfully anyway.
   * - `planId`/`planDayId`: always `null` - ADR-0013 lists "plans" among what
   *   CSV loses; `planNameSnapshot`/`planDayNameSnapshot` are still carried
   *   through from the `plan`/`day` columns as display-only snapshots with no
   *   live FK.
   * - Each `workout_set.parentSetId` is always `null` - ADR-0013 also lists
   *   "drop-set parentage" among what CSV loses; no attempt is made to infer
   *   chains from adjacent same-exercise rows.
   *
   * Returns `null` only for a group with zero rows (defensive; `groupCsvRowsBySession`
   * never actually produces one).
   */
  private async buildSessionFromCsvGroup(
    group: CsvSessionGroup,
    lookups: ExerciseResolutionLookups,
    createdIdsByFoldedName: Map<string, EntityId>,
    createdCount: { value: number },
    warnings: ImportWarning[],
    tx: SqlExecutor,
  ): Promise<ExportSession | null> {
    if (group.rows.length === 0) {
      return null;
    }

    const now = this.deps.clock.now();
    const tzOffsetMinutes = this.deps.clock.timezoneOffsetMinutes(now);

    interface ExerciseBucket {
      ref: CsvExerciseRef;
      rows: CsvParsedRow[];
    }
    const exerciseBuckets = new Map<string, ExerciseBucket>();
    const exerciseOrder: string[] = [];
    for (const row of group.rows) {
      const ref: CsvExerciseRef = {
        slug: row.exerciseSlug,
        id: row.exerciseId,
        name: row.exercise,
      };
      const key = `${ref.slug}|${ref.id}|${ref.name}`;
      let bucket = exerciseBuckets.get(key);
      if (!bucket) {
        bucket = { ref, rows: [] };
        exerciseBuckets.set(key, bucket);
        exerciseOrder.push(key);
      }
      bucket.rows.push(row);
    }

    const exportExercises: ExportSessionExercise[] = [];
    let minPerformedAt = Number.POSITIVE_INFINITY;
    let maxPerformedAt = Number.NEGATIVE_INFINITY;

    for (let exerciseIndex = 0; exerciseIndex < exerciseOrder.length; exerciseIndex += 1) {
      const bucket = exerciseBuckets.get(exerciseOrder[exerciseIndex]!)!;
      const exerciseId = await this.resolveOrCreateCsvExercise(
        bucket.ref,
        lookups,
        createdIdsByFoldedName,
        createdCount,
        warnings,
        tx,
      );

      const sets: ExportWorkoutSet[] = [];
      for (const row of bucket.rows) {
        const performedAt = parseLocalDateTimeToEpochMs(row.date, row.time, tzOffsetMinutes) ?? now;
        minPerformedAt = Math.min(minPerformedAt, performedAt);
        maxPerformedAt = Math.max(maxPerformedAt, performedAt);

        const rawSetType = row.setType;
        if (!isSetType(rawSetType)) {
          warnings.push({
            entity: 'session',
            subject: group.sessionId ?? group.groupKey,
            message: `A row had an unrecognized set_type ("${row.setType}"); it was treated as "normal".`,
          });
        }
        const setType = isSetType(rawSetType) ? rawSetType : 'normal';

        sets.push({
          id: this.deps.idGenerator.generate(),
          setIndex: parsePositiveIntOrDefault(row.setNumber, sets.length + 1),
          setType,
          parentSetId: null,
          weightKg: parseNumberOrNull(row.weightKg),
          reps: parseIntOrNull(row.reps),
          durationSeconds: parseIntOrNull(row.durationSeconds),
          distanceM: parseNumberOrNull(row.distanceM),
          rpe: parseNumberOrNull(row.rpe),
          isCompleted: true,
          completedAt: performedAt,
          performedAt,
          note: row.setNote.trim() !== '' ? row.setNote : null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
      }

      exportExercises.push({
        id: this.deps.idGenerator.generate(),
        exerciseId,
        exerciseNameSnapshot: bucket.ref.name,
        sortOrder: exerciseIndex,
        supersetGroup: null,
        restSecondsOverride: null,
        note: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        sets,
      });
    }

    const startedAt = Number.isFinite(minPerformedAt) ? minPerformedAt : now;
    const finishedAt = Number.isFinite(maxPerformedAt) ? maxPerformedAt : startedAt;

    return {
      id: group.sessionId ?? this.deps.idGenerator.generate(),
      planId: null,
      planDayId: null,
      planNameSnapshot: group.planName,
      planDayNameSnapshot: group.dayName,
      title: group.sessionTitle.trim() !== '' ? group.sessionTitle : DEFAULT_IMPORTED_SESSION_TITLE,
      status: 'completed',
      startedAt,
      finishedAt,
      localDate: group.date,
      tzOffsetMinutes,
      durationSeconds: sessionDurationSeconds({ startedAt, finishedAt, pausedMs: 0 }),
      pausedMs: 0,
      totalVolumeKg: null,
      totalSets: null,
      totalReps: null,
      estimatedKcal: null,
      notes: group.sessionNote,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      exercises: exportExercises,
    };
  }
}

function compareProfileCounts(
  local: WithUpdatedAt | null,
  file: WithUpdatedAt,
): ImportEntityCounts {
  if (!local) {
    return { toCreate: 1, toUpdate: 0, unchanged: 0 };
  }
  if (file.updatedAt > local.updatedAt) {
    return { toCreate: 0, toUpdate: 1, unchanged: 0 };
  }
  return { toCreate: 0, toUpdate: 0, unchanged: 1 };
}

function compareSessionCounts(
  localUpdatedAt: ReadonlyMap<EntityId, number>,
  fileSessions: readonly WithUpdatedAt[] & readonly { id: EntityId }[],
): ImportEntityCounts {
  let toCreate = 0;
  let toUpdate = 0;
  let unchanged = 0;
  for (const session of fileSessions) {
    const localValue = localUpdatedAt.get(session.id);
    if (localValue === undefined) {
      toCreate += 1;
    } else if (session.updatedAt > localValue) {
      toUpdate += 1;
    } else {
      unchanged += 1;
    }
  }
  return { toCreate, toUpdate, unchanged };
}
