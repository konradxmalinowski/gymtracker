import { createTestDatabase } from '@/database/node/createTestDatabase';
import { SqliteDailyGoalRepository } from '@/features/daily-goals/repository/SqliteDailyGoalRepository';
import { SqliteDailyReminderRepository } from '@/features/daily-goals/repository/SqliteDailyReminderRepository';
import { DailyGoalService } from '@/features/daily-goals/services/DailyGoalService';
import { DailyGoalValidationError } from '@/features/daily-goals/services/errors';
import type { DatabaseContext } from '@/repositories/contracts/database';
import { FixedClock } from '@/services/clock';
import { Uuid7IdGenerator } from '@/services/id';

const ALL_DAYS = 127;

function setup() {
  const db: DatabaseContext = createTestDatabase();
  const clock = new FixedClock(Date.UTC(2026, 0, 1, 12));
  const idGenerator = new Uuid7IdGenerator(clock);
  const goalRepository = new SqliteDailyGoalRepository({ db, clock, idGenerator });
  const reminderRepository = new SqliteDailyReminderRepository({ db, clock, idGenerator });
  const goalService = new DailyGoalService({ repository: goalRepository });
  return { db, goalRepository, reminderRepository, goalService };
}

describe('DailyGoalService.createGoal - validation', () => {
  it('rejects a counter goal with no targetValue before ever reaching the repository', async () => {
    const { goalService } = setup();
    await expect(
      goalService.createGoal({ name: 'Steps', goalType: 'counter', activeWeekdays: ALL_DAYS }),
    ).rejects.toThrow(DailyGoalValidationError);
  });

  it('rejects activeWeekdays outside 1-127', async () => {
    const { goalService } = setup();
    await expect(
      goalService.createGoal({ name: 'Meditate', goalType: 'boolean', activeWeekdays: 0 }),
    ).rejects.toThrow(DailyGoalValidationError);
  });

  it('accepts a valid boolean goal', async () => {
    const { goalService } = setup();
    const goal = await goalService.createGoal({
      name: 'Meditate',
      goalType: 'boolean',
      activeWeekdays: ALL_DAYS,
    });
    expect(goal.id).toBeTruthy();
  });
});

/**
 * The regression class this suite exists to close: a prior draft of this
 * service called `repository.softDelete()` from `deleteGoal()`, which never
 * fires `daily_goal`'s `ON DELETE CASCADE`/`ON DELETE SET NULL` triggers
 * (those only fire on a real `DELETE FROM` - a soft delete is just an
 * `UPDATE deleted_at`). The fix routes `deleteGoal()` through `purge()`
 * instead. These tests exercise the fix through the SERVICE call a real
 * "Delete goal" UI action will actually invoke - not just the repository's
 * own `purge()` method directly (already covered by
 * `SqliteDailyGoalRepository.test.ts`'s "cascade/set-null behavior" suite),
 * so a future regression back to `softDelete()` fails here too.
 */
describe('DailyGoalService.deleteGoal - real cascade/set-null via the service call path', () => {
  it('removes the goal entirely (not just soft-deleted) and cascades its own entries', async () => {
    const { db, goalRepository, goalService } = setup();
    const goal = await goalService.createGoal({
      name: 'Steps',
      goalType: 'counter',
      targetValue: 10000,
      activeWeekdays: ALL_DAYS,
    });
    await goalRepository.upsertEntryForToday(goal.id, '2026-01-01', 500);

    await goalService.deleteGoal(goal.id);

    expect(await goalRepository.findById(goal.id)).toBeNull();
    const entryRows = await db.select<{ count: number }>(
      'SELECT COUNT(*) AS count FROM daily_goal_entry WHERE goal_id = ?',
      [goal.id],
    );
    expect(entryRows[0]!.count).toBe(0);
    // Not merely soft-deleted: no row survives at all, deleted_at included.
    const rawRow = await db.selectOne('SELECT * FROM daily_goal WHERE id = ?', [goal.id]);
    expect(rawRow).toBeNull();
  });

  it('degrades a linked reminder to standalone, and the reminder survives, via the service call', async () => {
    const { goalRepository, reminderRepository, goalService } = setup();
    const goal = await goalService.createGoal({
      name: 'Steps',
      goalType: 'boolean',
      activeWeekdays: ALL_DAYS,
    });
    const reminder = await reminderRepository.create({
      goalId: goal.id,
      name: 'Steps reminder',
      reminderType: 'scheduled',
      timeOfDay: '09:00',
      activeWeekdays: ALL_DAYS,
    });

    await goalService.deleteGoal(goal.id);

    const survived = await reminderRepository.findById(reminder.id);
    expect(survived).not.toBeNull();
    expect(survived?.goalId).toBeNull();
    expect(await goalRepository.findById(goal.id)).toBeNull();
  });

  it('has no restoreGoal method - a hard delete has nothing to undo', () => {
    const { goalService } = setup();
    expect((goalService as unknown as { restoreGoal?: unknown }).restoreGoal).toBeUndefined();
  });
});

describe('DailyGoalService.setEnabled - the real "hide without losing history" affordance', () => {
  it('removes a disabled goal from listTodaysGoals but keeps its entry history intact', async () => {
    const { goalRepository, goalService } = setup();
    const goal = await goalService.createGoal({
      name: 'Steps',
      goalType: 'boolean',
      activeWeekdays: ALL_DAYS,
    });
    await goalRepository.upsertEntryForToday(goal.id, '2026-01-01', 1);

    await goalService.setEnabled(goal.id, false);

    expect(await goalService.listTodaysGoals('2026-01-05')).toEqual([]);
    expect(await goalRepository.getEntry(goal.id, '2026-01-01')).not.toBeNull();
  });
});
