import { z } from 'zod';
import type { EntityId } from '@/repositories/contracts/repository';
import type { Pagination } from '@/repositories/query';
import { BODY_METRIC_TYPES, type BodyMetricType } from '../domain/metrics';
import type { BodyMetricEntry, LatestMetricValue } from '../types/BodyMetric';
import type { BodyMetricRepository } from '../repository/BodyMetricRepository';
import { BodyMetricValidationError } from './errors';

/** Sized like `PLAN_DAY_NOTE_MAX_LENGTH`/`EXERCISE_NOTE_MAX_LENGTH` - every free-text note field in this codebase is the same rough shape. */
export const BODY_METRIC_NOTE_MAX_LENGTH = 1000;

/**
 * No CHECK constraint on `body_metric_entry.value` beyond `NOT NULL`, but a
 * measurement of zero or negative kg/cm/percent is never real data - rejected
 * here the same deliberate way `PlanService`'s `restSecondsSchema` rejects
 * zero even with no CHECK constraint backing it, for the same "carries no
 * information as a *value*" reasoning. `.finite()` additionally rejects
 * `Infinity`/`NaN`, which `NOT NULL` alone would let through a SQLite REAL
 * column.
 */
const valueSchema = z.number().finite().positive();
const noteSchema = z.string().trim().max(BODY_METRIC_NOTE_MAX_LENGTH).nullish();
const measuredAtSchema = z.number().finite().nonnegative();
const metricSchema = z.enum(BODY_METRIC_TYPES);

const recordEntrySchema = z.object({
  metric: metricSchema,
  value: valueSchema,
  note: noteSchema,
  measuredAt: measuredAtSchema.optional(),
});

const updateEntrySchema = z.object({
  value: valueSchema.optional(),
  note: noteSchema,
  measuredAt: measuredAtSchema.optional(),
});

/**
 * Validation-only counterpart to a `parse*` helper - same
 * `exactOptionalPropertyTypes` mismatch `PlanService.checkWithSchema()`
 * documents: an object with optional fields, once round-tripped through
 * Zod's own inferred output type, is not assignable back to this file's own
 * input types. On success the original object is passed straight through to
 * the repository unchanged; only failure needs the parsed Zod issues.
 */
function checkWithSchema(schema: z.ZodTypeAny, input: unknown): void {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BodyMetricValidationError(result.error.issues);
  }
}

export interface RecordBodyMetricEntryInput {
  metric: BodyMetricType;
  value: number;
  note?: string | null;
  measuredAt?: number;
}

export interface UpdateBodyMetricEntryInput {
  value?: number;
  note?: string | null;
  measuredAt?: number;
}

export interface BodyMetricServiceDependencies {
  repository: BodyMetricRepository;
}

/**
 * The only door into `BodyMetricRepository` (ARCHITECTURE.md section 3.1,
 * rule 3 - presentation never touches a repository directly).
 */
export class BodyMetricService {
  constructor(private readonly deps: BodyMetricServiceDependencies) {}

  /**
   * `value` here is always the metric's own canonical unit already - kg for
   * `body_weight`, percent for `body_fat_pct`, cm for every other metric
   * (`domain/metrics.ts`'s `metricUnit()`). Unit conversion for a user's
   * kg/lb or cm/in display preference happens in the frontend hook layer via
   * `domain/Weight.ts`/`domain/Length.ts` **before** the value ever reaches
   * this service, per ADR-0009 ("unit conversion for display only happens in
   * the presentation layer") - this method does not, and must not, convert.
   *
   * @throws {BodyMetricValidationError} when `metric` is not a recognized
   * `BodyMetricType`, `value` is non-finite/zero/negative, or `note` exceeds
   * {@link BODY_METRIC_NOTE_MAX_LENGTH}.
   */
  async recordEntry(input: RecordBodyMetricEntryInput): Promise<BodyMetricEntry> {
    checkWithSchema(recordEntrySchema, input);
    return this.deps.repository.create(input);
  }

  /**
   * Same canonical-unit contract as {@link recordEntry} - `patch.value`, if
   * given, is already in the metric's own unit; no conversion happens here.
   *
   * @throws {BodyMetricValidationError} when a provided `value` is
   * non-finite/zero/negative, or `note` exceeds
   * {@link BODY_METRIC_NOTE_MAX_LENGTH}.
   */
  async updateEntry(id: EntityId, patch: UpdateBodyMetricEntryInput): Promise<BodyMetricEntry> {
    checkWithSchema(updateEntrySchema, patch);
    return this.deps.repository.update(id, patch);
  }

  /** Soft delete - pairs with {@link restoreEntry} as the per-entry undo-toast flow's call target. */
  deleteEntry(id: EntityId): Promise<void> {
    return this.deps.repository.softDelete(id);
  }

  /** Undoes {@link deleteEntry}. */
  restoreEntry(id: EntityId): Promise<void> {
    return this.deps.repository.restore(id);
  }

  listHistory(metric: BodyMetricType, options?: Partial<Pagination>): Promise<BodyMetricEntry[]> {
    return this.deps.repository.listByMetric(metric, options);
  }

  listLatestValues(): Promise<LatestMetricValue[]> {
    return this.deps.repository.listLatestPerMetric();
  }
}
