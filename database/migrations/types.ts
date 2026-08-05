import type { SqlExecutor } from '@/repositories/contracts/database';

/**
 * A single schema migration - ARCHITECTURE.md section 7.2.
 *
 * There is no `down()`: downgrade is not a supported operation on a user's only
 * copy of their data. The recovery path is restoring from a JSON export (a later
 * phase's concern).
 */
export interface Migration {
  version: number;
  name: string;
  up(tx: SqlExecutor): Promise<void>;
}
