import type { DatabaseContext, SqlExecutor, SqlParam } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import type { Clock } from '@/services/clock';
import type { IdGenerator } from '@/services/id';
import { RepositoryNotFoundError } from './errors';

/**
 * Shape every row a `BaseSqliteRepository` subclass manages must have - the
 * audit columns ARCHITECTURE.md section 7.1 puts on every user-owned table.
 * Tables that don't carry all three (`user_profile`, the lookup tables, `app_setting`,
 * `active_session_state`) don't extend this base; they aren't the case it exists for.
 */
export interface AuditedRow {
  id: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface RepositoryDependencies {
  db: DatabaseContext;
  clock: Clock;
  idGenerator: IdGenerator;
}

/**
 * Base for every SQLite-backed feature repository (`ExerciseRepository`,
 * `PlanRepository`, ... - built in later roadmap phases, not this one).
 * ARCHITECTURE.md section 8.1's design goal 2: "own the invariants the schema
 * cannot express" - id generation, `created_at`/`updated_at` stamping,
 * `local_date` computation, and the soft-delete lifecycle
 * (`softDelete`/`restore`/`purge` from `WriteRepository`, ADR-0004) all live
 * here, once, so no feature repository re-derives them.
 *
 * What is deliberately NOT generic here: `findMany`/`count`/`create`/`update`.
 * Their shapes (query filters, entity-specific columns) vary enough per feature
 * that a one-size-fits-all implementation would either be too weak to be useful
 * or would leak feature-specific assumptions into shared code. Instead this
 * class gives subclasses the *mechanics* those methods need
 * (`insertRow`/`updateRow`/`executor`/`generateId`/`now`/`localDate`) and lets
 * each repository own its own column mapping and query shape on top.
 *
 * `this.table` is interpolated directly into SQL below. That is safe only
 * because it is always a subclass's own hardcoded literal, never a value that
 * can originate from user input or a caller argument - the same reasoning
 * `database/diagnostics.ts` documents for its table-name interpolation.
 */
export abstract class BaseSqliteRepository<TEntity, TRow extends AuditedRow = AuditedRow> {
  protected abstract readonly table: string;

  constructor(protected readonly deps: RepositoryDependencies) {}

  /** The executor to use for a single call: the caller's `tx` when composing a larger transaction, else the container's `db`. */
  protected executor(tx?: SqlExecutor): SqlExecutor {
    return tx ?? this.deps.db;
  }

  protected generateId(): EntityId {
    return this.deps.idGenerator.generate();
  }

  protected now(): number {
    return this.deps.clock.now();
  }

  /** ADR-0002 decision 2: computed once, at write time, via the injected `Clock` - never recomputed later from a UTC timestamp. */
  protected localDate(at: number = this.now()): string {
    return this.deps.clock.localDate(at);
  }

  /** Converts one raw SQL row into the entity shape - the one piece every subclass must supply. */
  protected abstract mapRow(row: TRow): TEntity;

  async findById(id: EntityId, tx?: SqlExecutor): Promise<TEntity | null> {
    const row = await this.executor(tx).selectOne<TRow>(
      `SELECT * FROM ${this.table} WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
    return row ? this.mapRow(row) : null;
  }

  /**
   * Idempotent: soft-deleting an already-deleted row is a silent no-op (undo
   * flows and repeated swipe gestures must not throw). An id that never existed
   * at all still throws.
   */
  async softDelete(id: EntityId, tx?: SqlExecutor): Promise<void> {
    const executor = this.executor(tx);
    const now = this.now();
    const result = await executor.run(
      `UPDATE ${this.table} SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
      [now, now, id],
    );
    if (result.changes === 0) {
      await this.assertExists(id, executor);
    }
  }

  /** Idempotent the same way `softDelete` is: restoring a row that isn't deleted is a no-op, not an error. */
  async restore(id: EntityId, tx?: SqlExecutor): Promise<void> {
    const executor = this.executor(tx);
    const result = await executor.run(
      `UPDATE ${this.table} SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL`,
      [this.now(), id],
    );
    if (result.changes === 0) {
      await this.assertExists(id, executor);
    }
  }

  /** Hard delete - a genuinely separate operation from `softDelete`, never called by a normal delete flow (ADR-0002 decision 4). */
  async purge(id: EntityId, tx?: SqlExecutor): Promise<void> {
    await this.executor(tx).run(`DELETE FROM ${this.table} WHERE id = ?`, [id]);
  }

  /**
   * Inserts a new row: generates the id, stamps `created_at`/`updated_at`, and
   * optionally `local_date`. `columns` holds only the entity-specific values;
   * every key in it is a hardcoded column name the subclass wrote, never
   * caller-supplied, so building the column list this way carries no injection
   * risk (values are still always bound as `?` params).
   */
  protected async insertRow(
    columns: Record<string, SqlParam>,
    tx?: SqlExecutor,
    options?: { localDate?: string; at?: number },
  ): Promise<{ id: string; createdAt: number; updatedAt: number }> {
    const id = this.generateId();
    const now = options?.at ?? this.now();

    const entries: [string, SqlParam][] = [
      ['id', id],
      ...Object.entries(columns),
      ['created_at', now],
      ['updated_at', now],
    ];
    if (options?.localDate !== undefined) {
      entries.push(['local_date', options.localDate]);
    }

    const columnNames = entries.map(([name]) => name);
    const params = entries.map(([, value]) => value);
    await this.executor(tx).run(
      `INSERT INTO ${this.table} (${columnNames.join(', ')}) VALUES (${columnNames.map(() => '?').join(', ')})`,
      params,
    );

    return { id, createdAt: now, updatedAt: now };
  }

  /**
   * Updates an existing, non-deleted row: stamps `updated_at`, applies
   * `columns`. Never resurrects a soft-deleted row - updating a deleted row
   * throws `RepositoryNotFoundError` the same as updating an id that never
   * existed, because from a caller's perspective both are "not there to edit".
   */
  protected async updateRow(
    id: EntityId,
    columns: Record<string, SqlParam>,
    tx?: SqlExecutor,
  ): Promise<{ updatedAt: number }> {
    const executor = this.executor(tx);
    const now = this.now();

    const entries: [string, SqlParam][] = [...Object.entries(columns), ['updated_at', now]];
    const assignments = entries.map(([name]) => `${name} = ?`).join(', ');
    const params: SqlParam[] = [...entries.map(([, value]) => value), id];

    const result = await executor.run(
      `UPDATE ${this.table} SET ${assignments} WHERE id = ? AND deleted_at IS NULL`,
      params,
    );
    if (result.changes === 0) {
      await this.assertExists(id, executor);
      throw new RepositoryNotFoundError(this.table, id);
    }

    return { updatedAt: now };
  }

  private async assertExists(id: EntityId, executor: SqlExecutor): Promise<void> {
    const row = await executor.selectOne<{ id: string }>(
      `SELECT id FROM ${this.table} WHERE id = ?`,
      [id],
    );
    if (!row) {
      throw new RepositoryNotFoundError(this.table, id);
    }
  }
}
