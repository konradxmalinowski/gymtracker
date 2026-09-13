import type { EntityId } from '@/repositories/contracts/repository';
import type { GoalType } from '../domain/goalCompletion';

export type { GoalType };

/**
 * One `daily_goal` row, camelCase - the recurring template/config row
 * (survives across days). `active_weekdays` stays the raw bitmask integer
 * here (see `domain/weekdayBitmask.ts` for reading it); this type does not
 * pre-decode it into a day-name array, mirroring how `plan_day.sort_order`
 * stays a raw integer on `PlanDay` rather than being pre-resolved into
 * something friendlier at the entity-type layer.
 */
export interface DailyGoal {
  id: EntityId;
  name: string;
  icon: string | null;
  goalType: GoalType;
  /** Non-null whenever `goalType !== 'boolean'` (`daily_goal`'s own CHECK constraint). */
  targetValue: number | null;
  /** Free-text label ('kroki', 'ml', 'min') - not a canonical-unit conversion target (ADR-0009 does not scope this column). */
  unit: string | null;
  activeWeekdays: number;
  isEnabled: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/**
 * One `daily_goal_entry` row, camelCase - the per-calendar-day progress
 * instance, one row per `(goalId, localDate)`, created lazily on first
 * interaction with that goal on that day. No `deletedAt` - unlike every
 * `AuditedRow`-shaped table in this codebase, `daily_goal_entry` has no soft
 * delete of its own (`database/schema.sql` section 7.12): an entry's history
 * is only ever removed by its parent goal's `ON DELETE CASCADE`.
 */
export interface DailyGoalEntry {
  id: EntityId;
  goalId: EntityId;
  localDate: string;
  progressValue: number;
  createdAt: number;
  updatedAt: number;
}

/** A `DailyGoal` joined with its entry (if any) for one specific `localDate` - `DailyGoalRepository.listActiveGoalsForWeekday`'s own row shape. */
export interface DailyGoalWithTodayEntry {
  goal: DailyGoal;
  entry: DailyGoalEntry | null;
}
