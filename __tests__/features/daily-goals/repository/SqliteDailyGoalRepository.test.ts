import { createTestDatabase } from '@/database/node/createTestDatabase';
import { SqliteDailyGoalRepository } from '@/features/daily-goals/repository/SqliteDailyGoalRepository';
import { SqliteDailyReminderRepository } from '@/features/daily-goals/repository/SqliteDailyReminderRepository';
import { RepositoryNotFoundError } from '@/repositories/base';
import type { DatabaseContext } from '@/repositories/contracts/database';
import { FixedClock } from '@/services/clock';
import { Uuid7IdGenerator } from '@/services/id';

function setup() {
  const db: DatabaseContext = createTestDatabase();
  const clock = new FixedClock(Date.UTC(2026, 0, 1, 12));
  const idGenerator = new Uuid7IdGenerator(clock);
  const goals = new SqliteDailyGoalRepository({ db, clock, idGenerator });
  const reminders = new SqliteDailyReminderRepository({ db, clock, idGenerator });
  return { db, clock, goals, reminders };
}

const ALL_DAYS = 127;

describe('SqliteDailyGoalRepository - CHECK constraints', () => {
  it('rejects a counter goal with no targetValue at the database level', async () => {
    const { goals } = setup();
    await expect(
      goals.create({ name: 'Steps', goalType: 'counter', activeWeekdays: ALL_DAYS }),
    ).rejects.toThrow();
  });

  it('rejects a numeric goal with no targetValue at the database level', async () => {
    const { goals } = setup();
    await expect(
      goals.create({ name: 'Water', goalType: 'numeric', activeWeekdays: ALL_DAYS }),
    ).rejects.toThrow();
  });

  it('accepts a boolean goal with no targetValue', async () => {
    const { goals } = setup();
    const goal = await goals.create({
      name: 'Meditate',
      goalType: 'boolean',
      activeWeekdays: ALL_DAYS,
    });
    expect(goal.targetValue).toBeNull();
  });

  it('rejects a non-positive targetValue at the database level, even for a boolean goal', async () => {
    const { goals } = setup();
    await expect(
      goals.create({
        name: 'Meditate',
        goalType: 'boolean',
        targetValue: -1,
        activeWeekdays: ALL_DAYS,
      }),
    ).rejects.toThrow();
    await expect(
      goals.create({
        name: 'Meditate',
        goalType: 'boolean',
        targetValue: 0,
        activeWeekdays: ALL_DAYS,
      }),
    ).rejects.toThrow();
  });

  it('rejects activeWeekdays of 0 (no day set) at the database level', async () => {
    const { goals } = setup();
    await expect(
      goals.create({ name: 'Meditate', goalType: 'boolean', activeWeekdays: 0 }),
    ).rejects.toThrow();
  });

  it('rejects activeWeekdays above 127 at the database level', async () => {
    const { goals } = setup();
    await expect(
      goals.create({ name: 'Meditate', goalType: 'boolean', activeWeekdays: 128 }),
    ).rejects.toThrow();
  });

  it('accepts every value in the valid 1-127 range', async () => {
    const { goals } = setup();
    for (const activeWeekdays of [1, 64, 127]) {
      await expect(
        goals.create({ name: 'Meditate', goalType: 'boolean', activeWeekdays }),
      ).resolves.toBeTruthy();
    }
  });
});

describe('SqliteDailyGoalRepository - entry upsert (ux_daily_goal_entry_goal_date)', () => {
  it('a second write for the same (goalId, localDate) updates in place, not a duplicate row', async () => {
    const { db, goals } = setup();
    const goal = await goals.create({
      name: 'Steps',
      goalType: 'counter',
      targetValue: 10000,
      activeWeekdays: ALL_DAYS,
    });

    await goals.upsertEntryForToday(goal.id, '2026-01-01', 4000);
    await goals.upsertEntryForToday(goal.id, '2026-01-01', 9000);

    const rows = await db.select<{ count: number }>(
      'SELECT COUNT(*) AS count FROM daily_goal_entry WHERE goal_id = ? AND local_date = ?',
      [goal.id, '2026-01-01'],
    );
    expect(rows[0]!.count).toBe(1);

    const entry = await goals.getEntry(goal.id, '2026-01-01');
    expect(entry?.progressValue).toBe(9000);
  });

  it("a different local_date is an independent row - a new day never overwrites a previous day's entry", async () => {
    const { goals } = setup();
    const goal = await goals.create({
      name: 'Steps',
      goalType: 'counter',
      targetValue: 10000,
      activeWeekdays: ALL_DAYS,
    });

    await goals.upsertEntryForToday(goal.id, '2026-01-01', 4000);
    await goals.upsertEntryForToday(goal.id, '2026-01-02', 7000);

    const dayOne = await goals.getEntry(goal.id, '2026-01-01');
    const dayTwo = await goals.getEntry(goal.id, '2026-01-02');
    expect(dayOne?.progressValue).toBe(4000);
    expect(dayTwo?.progressValue).toBe(7000);

    const history = await goals.listEntryHistory(goal.id, '2026-01-01', '2026-01-02');
    expect(history).toHaveLength(2);
  });
});

describe('SqliteDailyGoalRepository - listActiveGoalsForWeekday', () => {
  it("returns only enabled, non-deleted goals active on the given weekday, joined with the day's own entry", async () => {
    const { goals } = setup();
    // Monday only (bit0).
    const mondayGoal = await goals.create({
      name: 'Monday only',
      goalType: 'boolean',
      activeWeekdays: 0b0000001,
    });
    // Tuesday only (bit1) - must not appear when we query Monday.
    await goals.create({ name: 'Tuesday only', goalType: 'boolean', activeWeekdays: 0b0000010 });
    // Every day, but disabled.
    const disabled = await goals.create({
      name: 'Disabled',
      goalType: 'boolean',
      activeWeekdays: ALL_DAYS,
    });
    await goals.setEnabled(disabled.id, false);

    await goals.upsertEntryForToday(mondayGoal.id, '2026-09-07', 1);

    const result = await goals.listActiveGoalsForWeekday('2026-09-07', 0); // 2026-09-07 is a Monday
    expect(result).toHaveLength(1);
    expect(result[0]!.goal.id).toBe(mondayGoal.id);
    expect(result[0]!.entry?.progressValue).toBe(1);
  });

  it('returns entry: null for a goal with no entry yet on that date', async () => {
    const { goals } = setup();
    await goals.create({ name: 'Every day', goalType: 'boolean', activeWeekdays: ALL_DAYS });
    const result = await goals.listActiveGoalsForWeekday('2026-09-07', 0);
    expect(result).toHaveLength(1);
    expect(result[0]!.entry).toBeNull();
  });
});

describe('SqliteDailyGoalRepository - reorder', () => {
  it('re-sequences sort_order to match the given id order', async () => {
    const { goals } = setup();
    const a = await goals.create({ name: 'A', goalType: 'boolean', activeWeekdays: ALL_DAYS });
    const b = await goals.create({ name: 'B', goalType: 'boolean', activeWeekdays: ALL_DAYS });
    const c = await goals.create({ name: 'C', goalType: 'boolean', activeWeekdays: ALL_DAYS });

    await goals.reorder([c.id, a.id, b.id]);

    const all = await goals.listAll();
    expect(all.map((goal) => goal.id)).toEqual([c.id, a.id, b.id]);
  });

  it('throws RepositoryNotFoundError for an id that does not exist', async () => {
    const { goals } = setup();
    const a = await goals.create({ name: 'A', goalType: 'boolean', activeWeekdays: ALL_DAYS });
    await expect(goals.reorder([a.id, 'not-a-real-id'])).rejects.toThrow(RepositoryNotFoundError);
  });
});

describe('SqliteDailyGoalRepository - cascade/set-null behavior (purge only)', () => {
  it('ON DELETE CASCADE: purging a goal removes its daily_goal_entry rows', async () => {
    const { db, goals } = setup();
    const goal = await goals.create({
      name: 'Steps',
      goalType: 'counter',
      targetValue: 10000,
      activeWeekdays: ALL_DAYS,
    });
    await goals.upsertEntryForToday(goal.id, '2026-01-01', 500);

    await goals.purge(goal.id);

    const rows = await db.select<{ count: number }>(
      'SELECT COUNT(*) AS count FROM daily_goal_entry WHERE goal_id = ?',
      [goal.id],
    );
    expect(rows[0]!.count).toBe(0);
  });

  it('ON DELETE SET NULL: purging a goal degrades its linked reminder to standalone, and the reminder survives', async () => {
    const { goals, reminders } = setup();
    const goal = await goals.create({
      name: 'Steps',
      goalType: 'boolean',
      activeWeekdays: ALL_DAYS,
    });
    const reminder = await reminders.create({
      goalId: goal.id,
      name: 'Steps reminder',
      reminderType: 'scheduled',
      timeOfDay: '09:00',
      activeWeekdays: ALL_DAYS,
    });

    await goals.purge(goal.id);

    const survived = await reminders.findById(reminder.id);
    expect(survived).not.toBeNull();
    expect(survived?.goalId).toBeNull();
  });

  it('a soft-deleted (not purged) goal is excluded from listAll/listActiveGoalsForWeekday but its entries/reminder are untouched', async () => {
    const { goals, reminders } = setup();
    const goal = await goals.create({
      name: 'Steps',
      goalType: 'boolean',
      activeWeekdays: ALL_DAYS,
    });
    await goals.upsertEntryForToday(goal.id, '2026-01-01', 1);
    const reminder = await reminders.create({
      goalId: goal.id,
      name: 'Steps reminder',
      reminderType: 'scheduled',
      timeOfDay: '09:00',
      activeWeekdays: ALL_DAYS,
    });

    await goals.softDelete(goal.id);

    expect(await goals.listAll()).toEqual([]);
    expect(await goals.getEntry(goal.id, '2026-01-01')).not.toBeNull();
    expect((await reminders.findById(reminder.id))?.goalId).toBe(goal.id);

    await goals.restore(goal.id);
    expect(await goals.listAll()).toHaveLength(1);
  });
});
