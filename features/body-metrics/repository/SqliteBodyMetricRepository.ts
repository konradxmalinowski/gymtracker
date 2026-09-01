import type { SqlExecutor, SqlParam } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import { BaseSqliteRepository, type AuditedRow } from '@/repositories/base';
import { buildLimitOffset, type Pagination } from '@/repositories/query';
import type { BodyMetricType } from '../domain/metrics';
import type { BodyMetricEntry, LatestMetricValue } from '../types/BodyMetric';
import type {
  BodyMetricRepository,
  CreateBodyMetricEntryInput,
  UpdateBodyMetricEntryPatch,
} from './BodyMetricRepository';

interface BodyMetricRow extends AuditedRow {
  metric: BodyMetricType;
  value: number;
  measured_at: number;
  local_date: string;
  note: string | null;
}

interface LatestMetricRow {
  metric: BodyMetricType;
  value: number;
  measured_at: number;
  entry_id: string;
}

function mapRow(row: BodyMetricRow): BodyMetricEntry {
  return {
    id: row.id,
    metric: row.metric,
    value: row.value,
    measuredAt: row.measured_at,
    localDate: row.local_date,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/**
 * SQLite implementation of `BodyMetricRepository` (ARCHITECTURE.md section
 * 7.8/8.3, P13). Extends `BaseSqliteRepository<BodyMetricEntry, BodyMetricRow>`
 * scoped to `body_metric_entry` - `findById`/`softDelete`/`restore`/`purge`
 * come from the base class for free, mirroring every other feature
 * repository's own "own the invariants the schema cannot express" split.
 */
export class SqliteBodyMetricRepository
  extends BaseSqliteRepository<BodyMetricEntry, BodyMetricRow>
  implements BodyMetricRepository
{
  protected readonly table = 'body_metric_entry';

  protected mapRow(row: BodyMetricRow): BodyMetricEntry {
    return mapRow(row);
  }

  async create(input: CreateBodyMetricEntryInput, tx?: SqlExecutor): Promise<BodyMetricEntry> {
    const at = input.measuredAt ?? this.now();
    const localDate = this.localDate(at);
    const { id } = await this.insertRow(
      {
        metric: input.metric,
        value: input.value,
        measured_at: at,
        note: input.note ?? null,
      },
      tx,
      { at, localDate },
    );
    const created = await this.findById(id, tx);
    if (!created) {
      throw new Error('unreachable: body_metric_entry row was just inserted');
    }
    return created;
  }

  async update(
    id: EntityId,
    patch: UpdateBodyMetricEntryPatch,
    tx?: SqlExecutor,
  ): Promise<BodyMetricEntry> {
    const columns: Record<string, SqlParam> = {};
    if (patch.value !== undefined) columns.value = patch.value;
    if (patch.note !== undefined) columns.note = patch.note;
    if (patch.measuredAt !== undefined) {
      columns.measured_at = patch.measuredAt;
      columns.local_date = this.localDate(patch.measuredAt);
    }

    // Always calls updateRow, even with an empty `columns` - it still stamps
    // `updated_at` and, load-bearingly, throws RepositoryNotFoundError via its
    // own assertExists() when `id` doesn't reference a live row, so an empty
    // patch against a missing/deleted id fails the same way a non-empty one
    // does rather than silently succeeding.
    await this.updateRow(id, columns, tx);

    const updated = await this.findById(id, tx);
    if (!updated) {
      throw new Error('unreachable: body_metric_entry row was just updated');
    }
    return updated;
  }

  async listByMetric(
    metric: BodyMetricType,
    options?: Partial<Pagination>,
    tx?: SqlExecutor,
  ): Promise<BodyMetricEntry[]> {
    const executor = this.executor(tx);
    if (options === undefined) {
      const rows = await executor.select<BodyMetricRow>(
        `SELECT * FROM body_metric_entry
         WHERE metric = ? AND deleted_at IS NULL
         ORDER BY measured_at DESC`,
        [metric],
      );
      return rows.map(mapRow);
    }

    const { sql: limitSql, params: limitParams } = buildLimitOffset(options);
    const rows = await executor.select<BodyMetricRow>(
      `SELECT * FROM body_metric_entry
       WHERE metric = ? AND deleted_at IS NULL
       ORDER BY measured_at DESC
       ${limitSql}`,
      [metric, ...limitParams],
    );
    return rows.map(mapRow);
  }

  async listLatestPerMetric(tx?: SqlExecutor): Promise<LatestMetricValue[]> {
    const executor = this.executor(tx);
    const rows = await executor.select<LatestMetricRow>(
      `SELECT metric, value, measured_at, entry_id FROM (
         SELECT metric, value, measured_at, id AS entry_id,
                ROW_NUMBER() OVER (PARTITION BY metric ORDER BY measured_at DESC) AS rn
         FROM body_metric_entry
         WHERE deleted_at IS NULL
       ) ranked
       WHERE rn = 1`,
    );
    return rows.map((row) => ({
      metric: row.metric,
      value: row.value,
      measuredAt: row.measured_at,
      entryId: row.entry_id,
    }));
  }
}
