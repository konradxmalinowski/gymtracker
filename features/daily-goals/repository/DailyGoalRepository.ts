import type { SqlExecutor } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import type { MondayBasedWeekdayIndex } from '../domain/weekdayBitmask';
import type {
  DailyGoal,
  DailyGoalEntry,
  DailyGoalWithTodayEntry,
  GoalType,
} from '../types/DailyGoal';

export interface CreateDailyGoalInput {
  name: string;
  icon?: string | null;
  goalType: GoalType;
  /** Required (and must be `> 0`) whenever `goalType !== 'boolean'` - `daily_goal`'s own CHECK constraint; enforced again at the Zod layer by `DailyGoalService`. */
  targetValue?: number | null;
  unit?: string | null;
  activeWeekdays: number;
}

export interface UpdateDailyGoalPatch {
  name?: string;
  icon?: string | null;
  goalType?: GoalType;
  targetValue?: number | null;
  unit?: string | null;
  activeWeekdays?: number;
}

/**
 * Daily-goal repository (`daily_goal`/`daily_goal_entry`,
 * `database/schema.sql` section 7.12, P17). `findById`/`softDelete`/
 * `restore`/`purge` come from `BaseSqliteRepository`, scoped to `daily_goal` -
 * not re-declared here, mirroring `BodyMetricRepository`'s own doc comment.
 */
export interface DailyGoalRepository {
  findById(id: EntityId, tx?: SqlExecutor): Promise<DailyGoal | null>;
  softDelete(id: EntityId, tx?: SqlExecutor): Promise<void>;
  restore(id: EntityId, tx?: SqlExecutor): Promise<void>;
  purge(id: EntityId, tx?: SqlExecutor): Promise<void>;

  create(input: CreateDailyGoalInput, tx?: SqlExecutor): Promise<DailyGoal>;
  update(id: EntityId, patch: UpdateDailyGoalPatch, tx?: SqlExecutor): Promise<DailyGoal>;

  /** Every non-deleted goal, `sort_order ASC` - the management screen's full list, enabled or not. */
  listAll(tx?: SqlExecutor): Promise<DailyGoal[]>;

  setEnabled(id: EntityId, isEnabled: boolean, tx?: SqlExecutor): Promise<void>;

  /** Re-sequences `sort_order` to match `orderedIds`' own order - mirrors `PlanRepository.reorderPlans`'s exact shape (one `UPDATE` per id, joined in a transaction when no `tx` is supplied). */
  reorder(orderedIds: readonly EntityId[], tx?: SqlExecutor): Promise<void>;

  /**
   * Every enabled, non-deleted goal whose `active_weekdays` bit for
   * `weekdayIndex` is set, each paired with its `localDate` entry if one
   * already exists - one query, so the daily view renders progress with no
   * N+1. `weekdayIndex` is the caller's own responsibility to derive from
   * `localDate` via `domain/weekdayBitmask.ts`'s `weekdayIndexOf()` (not
   * re-derived here, keeping this repository free of any implicit "what day
   * is `localDate`" assumption beyond the raw bitwise check).
   */
  listActiveGoalsForWeekday(
    localDate: string,
    weekdayIndex: MondayBasedWeekdayIndex,
    tx?: SqlExecutor,
  ): Promise<DailyGoalWithTodayEntry[]>;

  /**
   * Upserts the `(goalId, localDate)` entry: a fresh `daily_goal_entry` row
   * on first write for that day, an in-place `progress_value` update on any
   * later write the same day - `ux_daily_goal_entry_goal_date`'s own unique
   * index is what makes "a new calendar day never overwrites a previous
   * day's entry" (ARCHITECTURE.md section 7.12) automatic: a different
   * `localDate` is simply a different row.
   */
  upsertEntryForToday(
    goalId: EntityId,
    localDate: string,
    progressValue: number,
    tx?: SqlExecutor,
  ): Promise<DailyGoalEntry>;

  getEntry(goalId: EntityId, localDate: string, tx?: SqlExecutor): Promise<DailyGoalEntry | null>;

  /** Flat, unbounded read - `local_date ASC` - for a single goal's own history/streak/completion-rate calculators. */
  listEntryHistory(
    goalId: EntityId,
    dateRangeFrom: string,
    dateRangeTo: string,
    tx?: SqlExecutor,
  ): Promise<DailyGoalEntry[]>;
}
