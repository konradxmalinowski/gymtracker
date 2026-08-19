import type { DatabaseContext, SqlExecutor } from '@/repositories/contracts/database';

import { endOfMonth } from '../domain/localDate';
import type { CalendarDayDto, CalendarRepository, CalendarYearDayDto } from './CalendarRepository';

export interface CalendarRepositoryDependencies {
  db: DatabaseContext;
}

interface MonthSessionRow {
  id: string;
  local_date: string;
  plan_day_name_snapshot: string | null;
  total_volume_kg: number;
}

interface YearVolumeRow {
  local_date: string;
  volume_kg: number | null;
}

/**
 * SQLite implementation of `CalendarRepository`. Read-only, so - mirroring
 * `SqliteHomeDashboardRepository`/`SqliteStatisticsRepository` - it takes
 * only `db`, no `BaseSqliteRepository`. Neither method reads
 * `v_session_summary` - a real performance fix, not a style choice.
 * `v_session_summary` is itself already a `GROUP BY s.id` aggregate view
 * over the entire `workout_session` table (`database/schema.sql`), and
 * SQLite's planner does not push a `WHERE local_date BETWEEN ? AND ?`
 * predicate through that view's own aggregation - test-agent's benchmark
 * measured `yearOverview` (a full-year range) at 195-347ms against the
 * 75,000-set fixture (`__tests__/database/benchmarks.perf.test.ts`'s
 * `calendar repository (P12)` case) when it went through the view, well
 * over the shared 150ms budget. A manual timing check against the same
 * fixture (`monthOverview`, a one-month range) measured ~206-216ms through
 * the view too - the view's plan doesn't scale down with a narrower range,
 * it always aggregates the whole table first - so both methods needed a
 * fix, not just the one the benchmark caught.
 *
 * `yearOverview` reads `v_working_set` directly and sums `volume_kg` per
 * `local_date` - the exact query shape `SqliteStatisticsRepository.
 * yearlyHeatmap` already uses - measuring ~2-5ms on the fixture.
 * `monthOverview` cannot do the same pure-`v_working_set` read - its DTO
 * needs per-session `plan_day_name_snapshot`, data that lives only on
 * `workout_session`, not on `v_working_set` (a per-working-set, not
 * per-session, view) - and it deliberately does NOT read `workout_session`'s
 * own denormalized `total_volume_kg` column either, even though that column
 * exists and is trustworthy for a real `finish()`-produced row: this
 * project's own repository test fixtures (`insertWorkoutSession` in
 * `__tests__/database/helpers/fixtures.ts`, and every existing
 * `SqliteCalendarRepository.test.ts` case built on it) construct a
 * `completed` session row directly, without going through `finish()`, so
 * that column is never populated in those tests - relying on it here would
 * make `monthOverview` return 0 for every seeded test session and silently
 * diverge from `yearOverview`'s and every other read-model repository's own
 * "derive volume live from working sets" convention.
 *
 * A first attempt drove the query off `workout_session` (`ws`) with a
 * `LEFT JOIN v_working_set (vws) ON vws.session_id = ws.id` -
 * structurally the same computation `v_session_summary`'s own view
 * definition does, just written against the driving table instead of
 * through the pre-built view. Measured against the fixture, that was
 * *still* slow (~145-155ms, barely inside the shared 150ms budget and
 * failing it on some runs): `EXPLAIN QUERY PLAN` showed SQLite choosing to
 * `MATERIALIZE v_working_set` in full (a scan of all 75,000 `workout_set`
 * rows, joined to every `workout_session` row) before ever applying the
 * outer `ws.local_date` filter, because `v_working_set` itself already
 * joins `workout_set` to `workout_session` - joining it a second time gave
 * the planner two copies of `workout_session` to reconcile and it picked
 * the expensive plan. The fix that actually worked, confirmed via
 * `EXPLAIN QUERY PLAN` showing `SEARCH ws USING INDEX ix_session_local_date`
 * as the first step: a **correlated scalar subquery** into `v_working_set`,
 * `(SELECT COALESCE(SUM(vws.volume_kg), 0) FROM v_working_set vws WHERE
 * vws.session_id = ws.id)`, selected per outer `ws` row rather than
 * joined-then-grouped. This reuses `v_working_set`'s own volume formula
 * (no duplicated CASE expression to drift out of sync with the view) and
 * lets the planner filter `workout_session` down to the handful of matching
 * sessions - via `ix_session_local_date` (`"History list, calendar,
 * streaks, weekly summary."`) - before ever touching `workout_set`, then
 * resolves each session's subquery via `ix_set_session (session_id, ...)`.
 * Measured post-fix at 0ms on the fixture (down from ~206-216ms through
 * `v_session_summary` and ~145-155ms through the join-then-group attempt).
 *
 * `monthOverview` groups its session rows into one `CalendarDayDto` per day
 * in a thin JS reduce rather than SQL `GROUP BY`, because its DTO needs
 * index-aligned per-session arrays (`sessionIds`/`planDayNames`) that plain
 * SQL aggregation can't produce without a fragile `group_concat`-and-split
 * hack - the same "day-level SQL, bucket in JS" split
 * `SqliteStatisticsRepository`'s own header comment documents, applied here
 * to session-grouping rather than date-bucketing. `yearOverview` needs only
 * a per-day sum, so it stays a real SQL `GROUP BY`/`HAVING` (no JS
 * aggregation).
 */
export class SqliteCalendarRepository implements CalendarRepository {
  constructor(private readonly deps: CalendarRepositoryDependencies) {}

  async monthOverview(year: number, month: number, tx?: SqlExecutor): Promise<CalendarDayDto[]> {
    const executor = tx ?? this.deps.db;
    const localDateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
    const localDateTo = endOfMonth(localDateFrom);
    const rows = await executor.select<MonthSessionRow>(
      `SELECT ws.id AS id, ws.local_date AS local_date,
              ws.plan_day_name_snapshot AS plan_day_name_snapshot,
              (SELECT COALESCE(SUM(vws.volume_kg), 0)
               FROM v_working_set vws
               WHERE vws.session_id = ws.id) AS total_volume_kg
       FROM workout_session ws
       WHERE ws.status = 'completed' AND ws.deleted_at IS NULL AND ws.local_date BETWEEN ? AND ?
       ORDER BY ws.local_date ASC`,
      [localDateFrom, localDateTo],
    );
    return groupSessionRowsByDay(rows);
  }

  async yearOverview(year: number, tx?: SqlExecutor): Promise<CalendarYearDayDto[]> {
    const executor = tx ?? this.deps.db;
    const rows = await executor.select<YearVolumeRow>(
      `SELECT local_date, SUM(volume_kg) AS volume_kg
       FROM v_working_set
       WHERE local_date BETWEEN ? AND ?
       GROUP BY local_date
       HAVING SUM(volume_kg) > 0
       ORDER BY local_date ASC`,
      [`${year}-01-01`, `${year}-12-31`],
    );
    return rows.map((row) => ({ localDate: row.local_date, totalVolumeKg: row.volume_kg ?? 0 }));
  }
}

/**
 * Reduces `workout_session`-driven rows (one per completed, non-deleted
 * session in range, `total_volume_kg` already `COALESCE`d to 0 in SQL,
 * already ordered by `local_date` ascending) into one `CalendarDayDto` per
 * distinct day - `Map` insertion order preserves the query's own
 * `ORDER BY`, so the result needs no separate sort.
 */
function groupSessionRowsByDay(rows: MonthSessionRow[]): CalendarDayDto[] {
  const byDate = new Map<string, CalendarDayDto>();
  for (const row of rows) {
    const day = byDate.get(row.local_date);
    if (day) {
      day.sessionIds.push(row.id);
      day.planDayNames.push(row.plan_day_name_snapshot);
      day.totalVolumeKg += row.total_volume_kg;
    } else {
      byDate.set(row.local_date, {
        localDate: row.local_date,
        sessionIds: [row.id],
        planDayNames: [row.plan_day_name_snapshot],
        totalVolumeKg: row.total_volume_kg,
      });
    }
  }
  return Array.from(byDate.values());
}
