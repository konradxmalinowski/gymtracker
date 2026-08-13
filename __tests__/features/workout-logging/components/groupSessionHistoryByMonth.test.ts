import { groupSessionHistoryByMonth } from '@/features/workout-logging/components/groupSessionHistoryByMonth';
import type { SessionListItem } from '@/features/workout-logging';

function session(overrides: Partial<SessionListItem>): SessionListItem {
  return {
    id: 'session-id',
    title: 'Workout',
    localDate: '2026-08-11',
    startedAt: Date.UTC(2026, 7, 11, 12, 0, 0),
    finishedAt: Date.UTC(2026, 7, 11, 13, 0, 0),
    durationSeconds: 3600,
    totalVolumeKg: 1000,
    totalSets: 10,
    totalReps: 80,
    estimatedKcal: null,
    planNameSnapshot: null,
    planDayNameSnapshot: null,
    ...overrides,
  };
}

describe('groupSessionHistoryByMonth', () => {
  it('returns an empty array for no sessions', () => {
    expect(groupSessionHistoryByMonth([])).toEqual([]);
  });

  it('inserts one header before the first session of each month, in input order', () => {
    const sessions = [
      session({ id: 's1', localDate: '2026-08-11' }),
      session({ id: 's2', localDate: '2026-08-05' }),
      session({ id: 's3', localDate: '2026-07-30' }),
    ];

    const entries = groupSessionHistoryByMonth(sessions);

    expect(entries.map((entry) => entry.type)).toEqual(['header', 'row', 'row', 'header', 'row']);
    expect(entries[0]).toMatchObject({ type: 'header', label: 'August 2026' });
    expect(entries[3]).toMatchObject({ type: 'header', label: 'July 2026' });
    expect(entries.map((entry) => (entry.type === 'row' ? entry.session.id : null))).toEqual([
      null,
      's1',
      's2',
      null,
      's3',
    ]);
  });

  it('does not duplicate a header for consecutive sessions in the same month, even across what would be separate pages', () => {
    // Simulates two `listHistory` pages already flattened together, both
    // falling in the same month - grouping must run over the whole
    // flattened list, not per page, so this produces exactly one header.
    const pageOne = [session({ id: 's1', localDate: '2026-08-11' })];
    const pageTwo = [session({ id: 's2', localDate: '2026-08-01' })];

    const entries = groupSessionHistoryByMonth([...pageOne, ...pageTwo]);

    expect(entries.filter((entry) => entry.type === 'header')).toHaveLength(1);
  });

  it('gives every row a stable key derived from the session id, and every header a key derived from its month', () => {
    const entries = groupSessionHistoryByMonth([session({ id: 's1', localDate: '2026-08-11' })]);

    expect(entries[0]?.key).toBe('header-2026-08');
    expect(entries[1]?.key).toBe('s1');
  });
});
