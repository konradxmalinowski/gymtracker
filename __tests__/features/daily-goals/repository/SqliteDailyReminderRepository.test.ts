import { createTestDatabase } from '@/database/node/createTestDatabase';
import { SqliteDailyGoalRepository } from '@/features/daily-goals/repository/SqliteDailyGoalRepository';
import { SqliteDailyReminderRepository } from '@/features/daily-goals/repository/SqliteDailyReminderRepository';
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

describe('SqliteDailyReminderRepository - CHECK constraints', () => {
  it('rejects a scheduled reminder with no timeOfDay at the database level', async () => {
    const { reminders } = setup();
    await expect(
      reminders.create({
        name: 'Drink water',
        reminderType: 'scheduled',
        activeWeekdays: ALL_DAYS,
      }),
    ).rejects.toThrow();
  });

  it('rejects a scheduled reminder that also sets intervalMinutes', async () => {
    const { reminders } = setup();
    await expect(
      reminders.create({
        name: 'Drink water',
        reminderType: 'scheduled',
        timeOfDay: '09:00',
        intervalMinutes: 30,
        activeWeekdays: ALL_DAYS,
      }),
    ).rejects.toThrow();
  });

  it('rejects an interval reminder with no intervalMinutes at the database level', async () => {
    const { reminders } = setup();
    await expect(
      reminders.create({ name: 'Drink water', reminderType: 'interval', activeWeekdays: ALL_DAYS }),
    ).rejects.toThrow();
  });

  it('rejects an interval reminder that also sets timeOfDay', async () => {
    const { reminders } = setup();
    await expect(
      reminders.create({
        name: 'Drink water',
        reminderType: 'interval',
        intervalMinutes: 30,
        timeOfDay: '09:00',
        activeWeekdays: ALL_DAYS,
      }),
    ).rejects.toThrow();
  });

  it('rejects an intervalMinutes below 15', async () => {
    const { reminders } = setup();
    await expect(
      reminders.create({
        name: 'Drink water',
        reminderType: 'interval',
        intervalMinutes: 10,
        activeWeekdays: ALL_DAYS,
      }),
    ).rejects.toThrow();
  });

  it('rejects a malformed timeOfDay (fails the GLOB pattern) at the database level', async () => {
    const { reminders } = setup();
    await expect(
      reminders.create({
        name: 'Drink water',
        reminderType: 'scheduled',
        timeOfDay: '12:60',
        activeWeekdays: ALL_DAYS,
      }),
    ).rejects.toThrow();
  });

  it('accepts a valid scheduled reminder and a valid interval reminder', async () => {
    const { reminders } = setup();
    await expect(
      reminders.create({
        name: 'Scheduled',
        reminderType: 'scheduled',
        timeOfDay: '09:00',
        activeWeekdays: ALL_DAYS,
      }),
    ).resolves.toBeTruthy();
    await expect(
      reminders.create({
        name: 'Interval',
        reminderType: 'interval',
        intervalMinutes: 60,
        activeWeekdays: ALL_DAYS,
      }),
    ).resolves.toBeTruthy();
  });

  it('rejects activeWeekdays outside 1-127 at the database level', async () => {
    const { reminders } = setup();
    await expect(
      reminders.create({
        name: 'Scheduled',
        reminderType: 'scheduled',
        timeOfDay: '09:00',
        activeWeekdays: 0,
      }),
    ).rejects.toThrow();
  });

  it('rejects an invalid response value at the raw database level (bypassing the typed repository method)', async () => {
    const { db, reminders } = setup();
    const reminder = await reminders.create({
      name: 'Scheduled',
      reminderType: 'scheduled',
      timeOfDay: '09:00',
      activeWeekdays: ALL_DAYS,
    });
    await expect(
      db.run(
        `INSERT INTO daily_reminder_response (id, reminder_id, local_date, response, responded_at, created_at)
         VALUES ('bad-response-id', ?, '2026-01-01', 'maybe', 0, 0)`,
        [reminder.id],
      ),
    ).rejects.toThrow();
  });
});

describe('SqliteDailyReminderRepository - response upsert (ux_daily_reminder_response_reminder_date)', () => {
  it('a second tap the same day updates in place - last tap wins, not a duplicate row', async () => {
    const { db, reminders } = setup();
    const reminder = await reminders.create({
      name: 'Scheduled',
      reminderType: 'scheduled',
      timeOfDay: '09:00',
      activeWeekdays: ALL_DAYS,
    });

    await reminders.recordResponse(reminder.id, '2026-01-01', 'not_done');
    await reminders.recordResponse(reminder.id, '2026-01-01', 'done');

    const rows = await db.select<{ count: number }>(
      'SELECT COUNT(*) AS count FROM daily_reminder_response WHERE reminder_id = ? AND local_date = ?',
      [reminder.id, '2026-01-01'],
    );
    expect(rows[0]!.count).toBe(1);

    const history = await reminders.listResponses(reminder.id, '2026-01-01', '2026-01-01');
    expect(history).toHaveLength(1);
    expect(history[0]!.response).toBe('done');
  });

  it('a different local_date is an independent row', async () => {
    const { reminders } = setup();
    const reminder = await reminders.create({
      name: 'Scheduled',
      reminderType: 'scheduled',
      timeOfDay: '09:00',
      activeWeekdays: ALL_DAYS,
    });

    await reminders.recordResponse(reminder.id, '2026-01-01', 'done');
    await reminders.recordResponse(reminder.id, '2026-01-02', 'not_done');

    const history = await reminders.listResponses(reminder.id, '2026-01-01', '2026-01-02');
    expect(history).toHaveLength(2);
    expect(history.map((r) => r.response)).toEqual(['done', 'not_done']);
  });
});

describe('SqliteDailyReminderRepository - listActiveForWeekday / listByGoalId', () => {
  it('returns only enabled, non-deleted reminders active on the given weekday', async () => {
    const { reminders } = setup();
    const monday = await reminders.create({
      name: 'Monday only',
      reminderType: 'scheduled',
      timeOfDay: '09:00',
      activeWeekdays: 0b0000001,
    });
    await reminders.create({
      name: 'Tuesday only',
      reminderType: 'scheduled',
      timeOfDay: '09:00',
      activeWeekdays: 0b0000010,
    });
    const disabled = await reminders.create({
      name: 'Disabled every day',
      reminderType: 'scheduled',
      timeOfDay: '09:00',
      activeWeekdays: ALL_DAYS,
    });
    await reminders.setEnabled(disabled.id, false);

    const result = await reminders.listActiveForWeekday('2026-09-07', 0); // Monday
    expect(result.map((r) => r.id)).toEqual([monday.id]);
  });

  it('listByGoalId returns only reminders linked to that goal', async () => {
    const { goals, reminders } = setup();
    const goal = await goals.create({
      name: 'Steps',
      goalType: 'boolean',
      activeWeekdays: ALL_DAYS,
    });
    const linked = await reminders.create({
      goalId: goal.id,
      name: 'Steps reminder',
      reminderType: 'scheduled',
      timeOfDay: '09:00',
      activeWeekdays: ALL_DAYS,
    });
    await reminders.create({
      name: 'Standalone',
      reminderType: 'scheduled',
      timeOfDay: '09:00',
      activeWeekdays: ALL_DAYS,
    });

    const result = await reminders.listByGoalId(goal.id);
    expect(result.map((r) => r.id)).toEqual([linked.id]);
  });
});

describe('SqliteDailyReminderRepository - ON DELETE CASCADE (purge only)', () => {
  it('purging a reminder removes its daily_reminder_response rows', async () => {
    const { db, reminders } = setup();
    const reminder = await reminders.create({
      name: 'Scheduled',
      reminderType: 'scheduled',
      timeOfDay: '09:00',
      activeWeekdays: ALL_DAYS,
    });
    await reminders.recordResponse(reminder.id, '2026-01-01', 'done');

    await reminders.purge(reminder.id);

    const rows = await db.select<{ count: number }>(
      'SELECT COUNT(*) AS count FROM daily_reminder_response WHERE reminder_id = ?',
      [reminder.id],
    );
    expect(rows[0]!.count).toBe(0);
  });

  it('a soft-deleted (not purged) reminder is excluded from listAll but its responses are untouched', async () => {
    const { reminders } = setup();
    const reminder = await reminders.create({
      name: 'Scheduled',
      reminderType: 'scheduled',
      timeOfDay: '09:00',
      activeWeekdays: ALL_DAYS,
    });
    await reminders.recordResponse(reminder.id, '2026-01-01', 'done');

    await reminders.softDelete(reminder.id);

    expect(await reminders.listAll()).toEqual([]);
    const history = await reminders.listResponses(reminder.id, '2026-01-01', '2026-01-01');
    expect(history).toHaveLength(1);

    await reminders.restore(reminder.id);
    expect(await reminders.listAll()).toHaveLength(1);
  });
});
