/**
 * Versioned envelope upgrade chain - ADR-0013: "`version` is an envelope
 * version, not the app version. A `migrateExport(input)` chain upgrades v1
 * files to the current shape, exactly like database migrations, so old
 * backups keep working." Mirrors `database/migrations/`'s own
 * `version -> up()` shape (see `database/migrations/001_initial.ts` and
 * `database/migrations/types.ts`) as closely as an envelope-shape upgrade
 * (a pure JS object transform) can mirror a SQL migration runner.
 *
 * v1 is both the oldest and the current version today, so `MIGRATIONS` is
 * empty and `migrateExport` only ever validates. A future v2 adds exactly
 * one entry to `MIGRATIONS` (`1: (v1Object) => v2Shape`) plus one new Zod
 * schema in `exportEnvelopeSchema.ts` - not a rewrite of this file.
 */
import type { z } from 'zod';
import { exportEnvelopeV1Schema } from './exportEnvelopeSchema';
import {
  CURRENT_EXPORT_ENVELOPE_VERSION,
  EXPORT_FORMAT,
  type ExportEnvelopeV1,
} from '../types/ExportEnvelope';

/**
 * Thrown for anything that isn't a well-formed backup of a version this app
 * understands: not an object, wrong `format`, missing/non-numeric `version`,
 * or a Zod failure at any nested level. `.message` is written to be shown to
 * the user directly (ADR-0013: "fail with a readable message"), not just
 * logged.
 */
export class InvalidExportFormatError extends Error {
  constructor(reason: string) {
    super(`This file is not a valid GymTracker backup: ${reason}`);
    this.name = 'InvalidExportFormatError';
  }
}

/**
 * Thrown when the file's `version` is newer than `CURRENT_EXPORT_ENVELOPE_VERSION`
 * - a backup made by a future app version this build has no migration path
 * for. Distinct from {@link InvalidExportFormatError} so a caller can offer
 * different guidance ("update the app" vs. "this isn't a backup file at
 * all").
 */
export class UnsupportedExportVersionError extends Error {
  constructor(
    public readonly foundVersion: number,
    public readonly maxSupportedVersion: number,
  ) {
    super(
      `This backup was created by a newer version of GymTracker (backup format v${foundVersion}) than this app understands (up to v${maxSupportedVersion}). Update the app and try importing again.`,
    );
    this.name = 'UnsupportedExportVersionError';
  }
}

/** A JSON-object-shaped upgrade from one envelope version to the next. Never validates - `migrateExport` validates once, after the whole chain has run. */
type EnvelopeMigration = (input: Record<string, unknown>) => Record<string, unknown>;

/**
 * `fromVersion -> migration function that upgrades it to `fromVersion + 1`.
 * Empty today - see this file's own header comment.
 */
const MIGRATIONS: Readonly<Record<number, EnvelopeMigration>> = {};

/**
 * Validates and upgrades an arbitrary parsed-JSON value into the current
 * {@link ExportEnvelopeV1} shape. This is the one entry point a service
 * layer should call on freshly-`JSON.parse`d file content - never
 * `exportEnvelopeV1Schema.parse()` directly, which would reject a real, older
 * backup this function could otherwise upgrade.
 *
 * @throws {InvalidExportFormatError} for a non-object, wrong `format`,
 *   missing `version`, a version this app has no migration path from, or a
 *   Zod validation failure at any nested level.
 * @throws {UnsupportedExportVersionError} when `version` is newer than
 *   {@link CURRENT_EXPORT_ENVELOPE_VERSION}.
 */
export function migrateExport(input: unknown): ExportEnvelopeV1 {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new InvalidExportFormatError('the file does not contain a JSON object.');
  }
  const record = input as Record<string, unknown>;

  if (record.format !== EXPORT_FORMAT) {
    throw new InvalidExportFormatError(
      `expected "format": "${EXPORT_FORMAT}", found ${JSON.stringify(record.format ?? null)}.`,
    );
  }

  const version = record.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new InvalidExportFormatError('the file has no valid numeric "version" field.');
  }
  if (version > CURRENT_EXPORT_ENVELOPE_VERSION) {
    throw new UnsupportedExportVersionError(version, CURRENT_EXPORT_ENVELOPE_VERSION);
  }

  let working = record;
  let workingVersion = version;
  while (workingVersion < CURRENT_EXPORT_ENVELOPE_VERSION) {
    const migrate = MIGRATIONS[workingVersion];
    if (!migrate) {
      // Unreachable today (MIGRATIONS is empty and the loop can only run
      // when CURRENT_EXPORT_ENVELOPE_VERSION > 1, which it isn't yet), but a
      // real, readable failure mode for the day a version gap opens up
      // rather than a version-numbered app forever assuming every
      // predecessor added a migration.
      throw new InvalidExportFormatError(
        `no migration path from backup version ${workingVersion} to ${CURRENT_EXPORT_ENVELOPE_VERSION}.`,
      );
    }
    working = migrate(working);
    workingVersion += 1;
  }

  const result = exportEnvelopeV1Schema.safeParse(working);
  if (!result.success) {
    throw new InvalidExportFormatError(summarizeZodIssues(result.error.issues));
  }
  return result.data;
}

function summarizeZodIssues(issues: readonly z.core.$ZodIssue[]): string {
  const first = issues[0];
  if (!first) {
    return 'the file failed validation.';
  }
  const path = first.path.length > 0 ? first.path.join('.') : '(root)';
  const extra = issues.length > 1 ? ` (and ${issues.length - 1} more issue(s))` : '';
  return `${path}: ${first.message}${extra}`;
}
