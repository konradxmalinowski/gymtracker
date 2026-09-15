/**
 * Versioned envelope upgrade chain - ADR-0013: "`version` is an envelope
 * version, not the app version. A `migrateExport(input)` chain upgrades v1
 * files to the current shape, exactly like database migrations, so old
 * backups keep working." Mirrors `database/migrations/`'s own
 * `version -> up()` shape (see `database/migrations/001_initial.ts` and
 * `database/migrations/types.ts`) as closely as an envelope-shape upgrade
 * (a pure JS object transform) can mirror a SQL migration runner.
 *
 * v2 is the current version (bumped from v1 by the P17 known-gaps sweep to
 * add the four daily-goals tables); `MIGRATIONS[1]` upgrades a v1 file to v2.
 * A future v3 adds exactly one more entry to `MIGRATIONS` (`2: (v2Object) =>
 * v3Shape`) plus one new Zod schema in `exportEnvelopeSchema.ts` - not a
 * rewrite of this file.
 */
import type { z } from 'zod';
import { exportEnvelopeV2Schema } from './exportEnvelopeSchema';
import {
  CURRENT_EXPORT_ENVELOPE_VERSION,
  EXPORT_FORMAT,
  type ExportEnvelopeV2,
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
 *
 * `1`: v1 -> v2, adding `dailyGoals`/`dailyGoalEntries`/`dailyReminders`/
 * `dailyReminderResponses` (the four P17 tables ADR-0013's original v1
 * envelope predates) as empty arrays when the file doesn't already carry
 * them - a v1 backup was written before these tables existed, so "absent"
 * always means "nothing to import for these four tables," never a validation
 * error. `data` itself is read defensively (`?? {}`) even though every real
 * v1 file has one - `exportEnvelopeDataSchema` is what actually rejects a
 * file with no `data` object at all, this migration only needs to not throw
 * before that schema gets the chance to.
 */
const MIGRATIONS: Readonly<Record<number, EnvelopeMigration>> = {
  1: (input) => {
    const data = (input.data ?? {}) as Record<string, unknown>;
    return {
      ...input,
      version: 2,
      data: {
        ...data,
        dailyGoals: data.dailyGoals ?? [],
        dailyGoalEntries: data.dailyGoalEntries ?? [],
        dailyReminders: data.dailyReminders ?? [],
        dailyReminderResponses: data.dailyReminderResponses ?? [],
      },
    };
  },
};

/**
 * Validates and upgrades an arbitrary parsed-JSON value into the current
 * {@link ExportEnvelopeV2} shape. This is the one entry point a service
 * layer should call on freshly-`JSON.parse`d file content - never
 * `exportEnvelopeV2Schema.parse()` directly, which would reject a real, older
 * backup this function could otherwise upgrade.
 *
 * @throws {InvalidExportFormatError} for a non-object, wrong `format`,
 *   missing `version`, a version this app has no migration path from, or a
 *   Zod validation failure at any nested level.
 * @throws {UnsupportedExportVersionError} when `version` is newer than
 *   {@link CURRENT_EXPORT_ENVELOPE_VERSION}.
 */
export function migrateExport(input: unknown): ExportEnvelopeV2 {
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
      // A real, readable failure mode for the day a version gap opens up -
      // a future v3+ file whose `fromVersion` has no entry here - rather
      // than a version-numbered app forever assuming every predecessor
      // added a migration.
      throw new InvalidExportFormatError(
        `no migration path from backup version ${workingVersion} to ${CURRENT_EXPORT_ENVELOPE_VERSION}.`,
      );
    }
    working = migrate(working);
    workingVersion += 1;
  }

  const result = exportEnvelopeV2Schema.safeParse(working);
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
