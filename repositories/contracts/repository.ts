/**
 * Shared repository contracts - ARCHITECTURE.md section 8.2.
 *
 * Not explicitly called out in this phase's task list (only `database.ts` was), but
 * it is the other half of the same "shared contracts" section, lives in the same
 * owned directory (`repositories/contracts/**`), and every later feature repository
 * (built in this phase's step 2a and every subsequent feature phase) implements
 * against these shapes. Included now so that boundary is fixed once, in the same
 * review pass as `SqlExecutor`/`DatabaseContext`, rather than improvised per-feature
 * later.
 */
import type { SqlExecutor } from './database';

/** UUIDv7 TEXT primary key (ADR-0002 decision 1). Opaque outside the id generator. */
export type EntityId = string;

export interface ReadRepository<TEntity, TQuery = void> {
  findById(id: EntityId, tx?: SqlExecutor): Promise<TEntity | null>;
  findMany(query: TQuery, tx?: SqlExecutor): Promise<TEntity[]>;
  count(query: TQuery, tx?: SqlExecutor): Promise<number>;
}

export interface WriteRepository<TEntity, TCreate, TUpdate> {
  create(input: TCreate, tx?: SqlExecutor): Promise<TEntity>;
  update(id: EntityId, patch: TUpdate, tx?: SqlExecutor): Promise<TEntity>;
  softDelete(id: EntityId, tx?: SqlExecutor): Promise<void>;
  restore(id: EntityId, tx?: SqlExecutor): Promise<void>;
  purge(id: EntityId, tx?: SqlExecutor): Promise<void>; // hard delete, explicit only
}
