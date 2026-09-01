import type { SqlExecutor } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import type { Pagination } from '@/repositories/query';
import type { BodyMetricType } from '../domain/metrics';
import type { BodyMetricEntry, LatestMetricValue } from '../types/BodyMetric';

export interface CreateBodyMetricEntryInput {
  metric: BodyMetricType;
  value: number;
  note?: string | null;
  /** Defaults to the injected `Clock`'s `now()` when omitted - a historical/backdated entry. */
  measuredAt?: number;
}

export interface UpdateBodyMetricEntryPatch {
  value?: number;
  note?: string | null;
  measuredAt?: number;
}

/**
 * Body-metric-entry repository (`body_metric_entry`, ARCHITECTURE.md section
 * 7.8, schema already shipped in P2's `001_initial.ts`). `findById`/
 * `softDelete`/`restore`/`purge` come from `BaseSqliteRepository` - not
 * re-declared here.
 */
export interface BodyMetricRepository {
  findById(id: EntityId, tx?: SqlExecutor): Promise<BodyMetricEntry | null>;
  softDelete(id: EntityId, tx?: SqlExecutor): Promise<void>;
  restore(id: EntityId, tx?: SqlExecutor): Promise<void>;
  purge(id: EntityId, tx?: SqlExecutor): Promise<void>;

  create(input: CreateBodyMetricEntryInput, tx?: SqlExecutor): Promise<BodyMetricEntry>;
  update(
    id: EntityId,
    patch: UpdateBodyMetricEntryPatch,
    tx?: SqlExecutor,
  ): Promise<BodyMetricEntry>;

  /**
   * `measured_at DESC`, `deleted_at IS NULL`. Unbounded when `options` is
   * omitted - a single metric's own history is expected to be small (dozens
   * to low hundreds of entries), unlike a workout-session-scale list.
   */
  listByMetric(
    metric: BodyMetricType,
    options?: Partial<Pagination>,
    tx?: SqlExecutor,
  ): Promise<BodyMetricEntry[]>;

  /**
   * One row per metric with at least one non-deleted entry, each the most
   * recent (`measured_at DESC`) reading for that metric - a single
   * `ROW_NUMBER() OVER (PARTITION BY metric ORDER BY measured_at DESC)`
   * query, never a load-all-then-reduce-in-JS pass.
   */
  listLatestPerMetric(tx?: SqlExecutor): Promise<LatestMetricValue[]>;
}
