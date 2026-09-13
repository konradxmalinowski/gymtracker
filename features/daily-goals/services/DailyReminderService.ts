import { z } from 'zod';
import type { EntityId } from '@/repositories/contracts/repository';
import { enumerateLocalDates } from '../domain/localDate';
import { isWeekdayActive, weekdayIndexOf } from '../domain/weekdayBitmask';
import type {
  DailyReminder,
  DailyReminderResponse,
  ReminderResponseValue,
  ReminderStats,
  ReminderType,
} from '../types/DailyReminder';
import type {
  CreateDailyReminderInput,
  DailyReminderRepository,
  UpdateDailyReminderPatch,
} from '../repository/DailyReminderRepository';
import { DailyReminderValidationError } from './errors';

/** Same rough shape as `DAILY_GOAL_NAME_MAX_LENGTH` - a short, user-typed label. */
export const DAILY_REMINDER_NAME_MAX_LENGTH = 100;
export const DAILY_REMINDER_ICON_MAX_LENGTH = 50;

const REMINDER_TYPES: readonly ReminderType[] = ['scheduled', 'interval'];
const RESPONSE_VALUES: readonly ReminderResponseValue[] = ['done', 'not_done'];

/** `daily_reminder.time_of_day` CHECK constraint: `GLOB '[0-2][0-9]:[0-5][0-9]'`. Slightly stricter than the raw GLOB (which would accept `29:59`) - matches `WorkoutReminderService.parseTimeOfDay()`'s own regex shape, written fresh here per this phase's brief (domain/service code can't import a `services/notifications/*` file). */
const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'timeOfDay must be HH:mm.');
/** `daily_reminder.interval_minutes` CHECK constraint: `interval_minutes IS NULL OR interval_minutes >= 15`. */
const intervalMinutesSchema = z.number().int().min(15);
/** `daily_reminder.active_weekdays` CHECK constraint - same as `daily_goal`'s. */
const activeWeekdaysSchema = z.number().int().min(1).max(127);

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Reminder name is required.')
  .max(DAILY_REMINDER_NAME_MAX_LENGTH);
const iconSchema = z.string().trim().min(1).max(DAILY_REMINDER_ICON_MAX_LENGTH).nullish();
const goalIdSchema = z.string().trim().min(1).nullish();

/**
 * `daily_reminder`'s own CHECK constraint XOR-ing `reminder_type` against
 * `time_of_day`/`interval_minutes`:
 * `(reminder_type = 'scheduled' AND time_of_day IS NOT NULL AND interval_minutes IS NULL)
 *  OR (reminder_type = 'interval' AND interval_minutes IS NOT NULL AND time_of_day IS NULL)`.
 * A `.refine()` over the full shape, the same "custom refinement over related
 * fields" precedent `PlanService.repRangeIsValid` already establishes,
 * chosen over a `z.discriminatedUnion` because the discriminant
 * (`reminderType`) and the two fields it constrains all need to keep living
 * as flat, optional-on-update sibling fields rather than being restructured
 * into two literal-tagged variant shapes that `UpdateDailyReminderPatch`
 * would then also have to mirror.
 */
function reminderTypeFieldsAreValid(input: {
  reminderType: ReminderType;
  timeOfDay?: string | null | undefined;
  intervalMinutes?: number | null | undefined;
}): boolean {
  if (input.reminderType === 'scheduled') {
    return input.timeOfDay != null && input.intervalMinutes == null;
  }
  return input.intervalMinutes != null && input.timeOfDay == null;
}

const reminderTypeRefinement = {
  message:
    'A scheduled reminder needs timeOfDay (and no intervalMinutes); an interval reminder needs intervalMinutes (and no timeOfDay).',
  path: ['reminderType'],
};

const createReminderSchema = z
  .object({
    goalId: goalIdSchema,
    name: nameSchema,
    icon: iconSchema,
    reminderType: z.enum(REMINDER_TYPES as [ReminderType, ...ReminderType[]]),
    timeOfDay: timeOfDaySchema.nullish(),
    intervalMinutes: intervalMinutesSchema.nullish(),
    activeWeekdays: activeWeekdaysSchema,
  })
  .refine(reminderTypeFieldsAreValid, reminderTypeRefinement);

/**
 * Every field optional (a patch). Unlike `DailyGoalService.updateGoalSchema`,
 * this one DOES re-check the `reminderType`/`timeOfDay`/`intervalMinutes`
 * relationship even on a partial patch, using `.nullish()` defaults
 * (`undefined` reads as "not part of this refine's own three-field group" is
 * not representable with a plain `.optional()` triple, so instead this
 * schema requires all three of `reminderType`/`timeOfDay`/`intervalMinutes`
 * to be provided together whenever any one of them changes - a stricter but
 * simpler contract than trying to merge a partial update against the
 * reminder's current stored state at the Zod layer, which none of this
 * codebase's other patch schemas attempt either).
 */
const updateReminderSchema = z
  .object({
    goalId: goalIdSchema,
    name: nameSchema.optional(),
    icon: iconSchema,
    reminderType: z.enum(REMINDER_TYPES as [ReminderType, ...ReminderType[]]).optional(),
    timeOfDay: timeOfDaySchema.nullish(),
    intervalMinutes: intervalMinutesSchema.nullish(),
    activeWeekdays: activeWeekdaysSchema.optional(),
  })
  .refine((input) => {
    if (input.reminderType === undefined) {
      return true;
    }
    return reminderTypeFieldsAreValid({
      reminderType: input.reminderType,
      timeOfDay: input.timeOfDay,
      intervalMinutes: input.intervalMinutes,
    });
  }, reminderTypeRefinement);

/** Validation-only counterpart, same shape as `DailyGoalService`'s own `checkWithSchema()`. */
function checkWithSchema(schema: z.ZodTypeAny, input: unknown): void {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new DailyReminderValidationError(result.error.issues);
  }
}

export interface DailyReminderServiceDependencies {
  repository: DailyReminderRepository;
}

/**
 * The only door into `DailyReminderRepository` (ARCHITECTURE.md section 3.1,
 * rule 3 - presentation never touches a repository directly).
 */
export class DailyReminderService {
  constructor(private readonly deps: DailyReminderServiceDependencies) {}

  /** @throws {DailyReminderValidationError} */
  async createReminder(input: CreateDailyReminderInput): Promise<DailyReminder> {
    checkWithSchema(createReminderSchema, input);
    return this.deps.repository.create(input);
  }

  /** @throws {DailyReminderValidationError} */
  async updateReminder(id: EntityId, patch: UpdateDailyReminderPatch): Promise<DailyReminder> {
    checkWithSchema(updateReminderSchema, patch);
    return this.deps.repository.update(id, patch);
  }

  /**
   * Hard delete - matches `DailyGoalService.deleteGoal()`'s own corrected
   * reasoning exactly (see that method's doc comment for the full argument):
   * a `daily_reminder` is a top-level, standalone object, not a sub-item of
   * some other aggregate, so it gets the same `ConfirmDialog`-gated,
   * no-undo, hard-delete treatment `PlanService.deletePlan()`/
   * `WorkoutSessionService.deleteSession()` already establish for that shape
   * of object - not the soft-delete-plus-undo-toast treatment this codebase
   * reserves for a sub-item one level down inside another aggregate.
   *
   * Concretely: `ON DELETE CASCADE` on `daily_reminder_response.reminder_id`
   * (this reminder's own response log) only fires on a real `DELETE FROM`,
   * never on a soft-delete `UPDATE deleted_at` - `purge()` is what actually
   * fires it, so a reminder's response history is deliberately NOT preserved
   * after a genuine delete, consistent with the schema's own FK definition.
   *
   * `softDelete`/`restore` stay available on the repository (inherited from
   * `BaseSqliteRepository`) but are not wired to any reachable service
   * method - there is no "undo a reminder delete" flow, matching
   * `deleteGoal()`. `setEnabled` is this feature's real "pause without
   * losing history" affordance.
   */
  deleteReminder(id: EntityId): Promise<void> {
    return this.deps.repository.purge(id);
  }

  setEnabled(id: EntityId, isEnabled: boolean): Promise<void> {
    return this.deps.repository.setEnabled(id, isEnabled);
  }

  listAll(): Promise<DailyReminder[]> {
    return this.deps.repository.listAll();
  }

  listByGoal(goalId: EntityId): Promise<DailyReminder[]> {
    return this.deps.repository.listByGoalId(goalId);
  }

  getReminder(id: EntityId): Promise<DailyReminder | null> {
    return this.deps.repository.findById(id);
  }

  /** Every enabled reminder active on `localDate`'s weekday - `NotificationScheduler`'s own re-arm read, routed through the service per ARCHITECTURE.md section 3.1 rule 3. */
  listActiveToday(localDate: string): Promise<DailyReminder[]> {
    return this.deps.repository.listActiveForWeekday(localDate, weekdayIndexOf(localDate));
  }

  recordResponse(
    reminderId: EntityId,
    localDate: string,
    response: ReminderResponseValue,
  ): Promise<DailyReminderResponse> {
    checkWithSchema(
      z.enum(RESPONSE_VALUES as [ReminderResponseValue, ...ReminderResponseValue[]]),
      response,
    );
    return this.deps.repository.recordResponse(reminderId, localDate, response);
  }

  getResponseHistory(
    reminderId: EntityId,
    dateRangeFrom: string,
    dateRangeTo: string,
  ): Promise<DailyReminderResponse[]> {
    return this.deps.repository.listResponses(reminderId, dateRangeFrom, dateRangeTo);
  }

  /**
   * `{ done, notDone, ignored }` over `[dateRangeFrom, dateRangeTo]`
   * (inclusive) - "ignored" is computed here, never stored or computed in
   * the repository (ARCHITECTURE.md section 7.12's own explicit instruction):
   * `(active days in range) - (rows present in range)`, where "active days"
   * is `reminder.activeWeekdays` evaluated per calendar day via
   * `domain/weekdayBitmask.ts`'s `isWeekdayActive()`, not just "every day in
   * the range" - a day the reminder was never even scheduled to fire on must
   * not count as an ignored occurrence.
   *
   * Returns all-zero stats (rather than throwing) if `reminderId` does not
   * resolve to a real reminder - callers that already validated the id
   * (every real UI entry point) see a harmless empty result; nothing about
   * this method itself is a write, so there is no invariant to protect by
   * throwing instead.
   */
  async getReminderStats(
    reminderId: EntityId,
    dateRangeFrom: string,
    dateRangeTo: string,
  ): Promise<ReminderStats> {
    const reminder = await this.deps.repository.findById(reminderId);
    const responses = await this.deps.repository.listResponses(
      reminderId,
      dateRangeFrom,
      dateRangeTo,
    );

    const done = responses.filter((response) => response.response === 'done').length;
    const notDone = responses.filter((response) => response.response === 'not_done').length;

    if (!reminder) {
      return { done, notDone, ignored: 0 };
    }

    const respondedDates = new Set(responses.map((response) => response.localDate));
    const activeDayCount = enumerateLocalDates(dateRangeFrom, dateRangeTo).filter((localDate) =>
      isWeekdayActive(reminder.activeWeekdays, weekdayIndexOf(localDate)),
    ).length;
    const ignored = Math.max(0, activeDayCount - respondedDates.size);

    return { done, notDone, ignored };
  }
}
