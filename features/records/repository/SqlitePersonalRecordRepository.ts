import type { DatabaseContext, SqlExecutor } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import { boolFromSql } from '@/repositories/mapping';
import type { SettingsRepository } from '@/repositories/settings';
import type { Clock } from '@/services/clock';
import type { IdGenerator } from '@/services/id';
import { evaluateCandidateRecords } from '../domain/evaluateCandidateRecords';
import {
  brzyckiFormula,
  epleyFormula,
  estimated1RM,
  type OneRmFormula,
  type SetType,
} from '../domain/Estimated1RM';
import type { PersonalRecordSnapshot, RecordType, RepBucket } from '../types/PersonalRecord';
import type {
  PersonalRecord,
  PersonalRecordRepository,
  RecordCandidateSet,
} from './PersonalRecordRepository';

export interface PersonalRecordRepositoryDependencies {
  db: DatabaseContext;
  clock: Clock;
  idGenerator: IdGenerator;
  settings: SettingsRepository;
}

interface PersonalRecordRow {
  id: string;
  exercise_id: string;
  record_type: RecordType;
  rep_bucket: number | null;
  value: number;
  weight_kg: number | null;
  reps: number | null;
  workout_set_id: string | null;
  session_id: string | null;
  achieved_at: number;
  previous_value: number | null;
  is_current: number;
  created_at: number;
  updated_at: number;
}

interface EligibleSetRow {
  id: string;
  session_id: string;
  set_type: SetType;
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_m: number | null;
  performed_at: number;
}

function mapRow(row: PersonalRecordRow): PersonalRecord {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    recordType: row.record_type,
    repBucket: row.rep_bucket as RepBucket | null,
    value: row.value,
    weightKg: row.weight_kg,
    reps: row.reps,
    workoutSetId: row.workout_set_id,
    sessionId: row.session_id,
    achievedAt: row.achieved_at,
    previousValue: row.previous_value,
    isCurrent: boolFromSql(row.is_current),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * SQLite implementation of `PersonalRecordRepository`.
 *
 * Deliberately does NOT extend `BaseSqliteRepository`: that base class's
 * generic constraint (`TRow extends AuditedRow`) and its `findById`/
 * `softDelete`/`restore`/`updateRow` all assume a `deleted_at` column
 * (`repositories/base/BaseSqliteRepository.ts`'s own doc comment: "tables
 * that don't carry all three [audit columns] ... aren't the case it exists
 * for"). `personal_record` (`database/schema.sql` section 7.7) has no
 * `deleted_at` column at all - by ADR-0015 design, a record is never soft
 * deleted, only superseded via `is_current = 0`. Extending the base class
 * here would either fail to type-check (`PersonalRecordRow` cannot satisfy
 * `AuditedRow`) or silently break at runtime the first time an inherited
 * method referenced a `deleted_at` column that doesn't exist. This class
 * instead takes the same `db`/`clock`/`idGenerator` shape directly, plus
 * `settings` (see below), and writes its own small, table-scoped SQL - the
 * same kind of documented deviation `docs/architecture-snapshot.md`'s
 * `services/settings` and the project-root `domain/` folder already are.
 *
 * `settings` is a real dependency here (unlike every other feature
 * repository, which stays free of settings-schema knowledge per the layering
 * rule P7's rest-timer wiring established): `oneRm.formula` selects Epley vs.
 * Brzycki, and both `evaluateAndUpsert` and `rebuild` need to resolve it to
 * compute `estimated_1rm` candidates. ADR-0015 already assigns "one module
 * owns every training formula" to `records`, so reading its own setting here
 * - rather than pushing formula resolution up into `WorkoutSessionService`,
 * which would need to import `records`' formula functions to do it - keeps
 * that ownership in one place instead of splitting it across two features.
 */
export class SqlitePersonalRecordRepository implements PersonalRecordRepository {
  constructor(private readonly deps: PersonalRecordRepositoryDependencies) {}

  async listCurrent(exerciseId?: EntityId, tx?: SqlExecutor): Promise<PersonalRecord[]> {
    const executor = tx ?? this.deps.db;
    const rows = exerciseId
      ? await executor.select<PersonalRecordRow>(
          `SELECT * FROM personal_record WHERE exercise_id = ? AND is_current = 1
           ORDER BY record_type ASC, IFNULL(rep_bucket, -1) ASC`,
          [exerciseId],
        )
      : await executor.select<PersonalRecordRow>(
          `SELECT * FROM personal_record WHERE is_current = 1
           ORDER BY exercise_id ASC, record_type ASC, IFNULL(rep_bucket, -1) ASC`,
        );
    return rows.map(mapRow);
  }

  async listRecent(limit: number, tx?: SqlExecutor): Promise<PersonalRecord[]> {
    const executor = tx ?? this.deps.db;
    const rows = await executor.select<PersonalRecordRow>(
      `SELECT * FROM personal_record WHERE is_current = 1 ORDER BY achieved_at DESC LIMIT ?`,
      [limit],
    );
    return rows.map(mapRow);
  }

  async listHistory(
    exerciseId: EntityId,
    recordType: RecordType,
    tx?: SqlExecutor,
  ): Promise<PersonalRecord[]> {
    const executor = tx ?? this.deps.db;
    const rows = await executor.select<PersonalRecordRow>(
      `SELECT * FROM personal_record WHERE exercise_id = ? AND record_type = ? ORDER BY achieved_at DESC`,
      [exerciseId, recordType],
    );
    return rows.map(mapRow);
  }

  async evaluateAndUpsert(
    exerciseId: EntityId,
    candidate: RecordCandidateSet,
    tx: SqlExecutor,
  ): Promise<PersonalRecord[]> {
    const formula = await this.resolveFormula(tx);
    return this.evaluateAndWrite(exerciseId, candidate, formula, tx);
  }

  async rebuild(exerciseIds?: readonly EntityId[], tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      const formula = await this.resolveFormula(t);
      const targetIds =
        exerciseIds && exerciseIds.length > 0 ? exerciseIds : await this.allCandidateExerciseIds(t);

      for (const exerciseId of targetIds) {
        await t.run('DELETE FROM personal_record WHERE exercise_id = ?', [exerciseId]);

        // Chronological order, tie-broken deterministically - this is what
        // makes rebuild() reproduce exactly what incremental evaluation would
        // have produced had it seen these sets one at a time in this order.
        // `v_working_set` already encodes "completed, non-deleted, session
        // completed" (`database/schema.sql` section 7.10); the `set_type`
        // filter here is redundant with `evaluateCandidateRecords`' own
        // eligibility check (it returns `[]` for anything but
        // normal/failure) but avoids walking sets that can never produce a
        // record at all.
        const sets = await t.select<EligibleSetRow>(
          `SELECT id, session_id, set_type, weight_kg, reps, duration_seconds, distance_m, performed_at
           FROM v_working_set
           WHERE exercise_id = ? AND set_type IN ('normal', 'failure')
           ORDER BY performed_at ASC, created_at ASC, id ASC`,
          [exerciseId],
        );

        for (const set of sets) {
          await this.evaluateAndWrite(
            exerciseId,
            {
              setType: set.set_type,
              weightKg: set.weight_kg,
              reps: set.reps,
              durationSeconds: set.duration_seconds,
              distanceM: set.distance_m,
              workoutSetId: set.id,
              sessionId: set.session_id,
              achievedAt: set.performed_at,
            },
            formula,
            t,
          );
        }
      }
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  // --- internals -----------------------------------------------------------

  private async resolveFormula(tx?: SqlExecutor): Promise<OneRmFormula> {
    const key = await this.deps.settings.get('oneRm.formula', tx);
    return key === 'brzycki' ? brzyckiFormula : epleyFormula;
  }

  /**
   * The one place both `evaluateAndUpsert` and `rebuild` write - reads the
   * exercise's current records fresh (never assumes anything about prior
   * calls), hands them to Pass 1's pure `evaluateCandidateRecords`, and
   * performs ADR-0015's two-step write for every beaten slot: supersede the
   * old current row (if any), insert the new one. This equivalence is the
   * whole property the equivalence test exists to verify.
   */
  private async evaluateAndWrite(
    exerciseId: EntityId,
    candidate: RecordCandidateSet,
    formula: OneRmFormula,
    tx: SqlExecutor,
  ): Promise<PersonalRecord[]> {
    const currentRows = await tx.select<PersonalRecordRow>(
      'SELECT * FROM personal_record WHERE exercise_id = ? AND is_current = 1',
      [exerciseId],
    );
    const snapshots: PersonalRecordSnapshot[] = currentRows.map((row) => ({
      recordType: row.record_type,
      repBucket: row.rep_bucket as RepBucket | null,
      value: row.value,
    }));

    const estimated1RmKg =
      candidate.weightKg !== null && candidate.reps !== null
        ? estimated1RM(
            { weightKg: candidate.weightKg, reps: candidate.reps, setType: candidate.setType },
            formula,
          )
        : null;

    const beaten = evaluateCandidateRecords(snapshots, {
      setType: candidate.setType,
      weightKg: candidate.weightKg,
      reps: candidate.reps,
      durationSeconds: candidate.durationSeconds,
      distanceM: candidate.distanceM,
      estimated1RmKg,
    });

    const created: PersonalRecord[] = [];
    const now = this.deps.clock.now();

    for (const beat of beaten) {
      const currentRow = currentRows.find(
        (row) => row.record_type === beat.recordType && row.rep_bucket === beat.repBucket,
      );
      if (currentRow) {
        await tx.run('UPDATE personal_record SET is_current = 0, updated_at = ? WHERE id = ?', [
          now,
          currentRow.id,
        ]);
      }

      const id = this.deps.idGenerator.generate();
      const previousValue = currentRow ? currentRow.value : null;
      await tx.run(
        `INSERT INTO personal_record (
           id, exercise_id, record_type, rep_bucket, value, weight_kg, reps,
           workout_set_id, session_id, achieved_at, previous_value, is_current,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          id,
          exerciseId,
          beat.recordType,
          beat.repBucket,
          beat.newValue,
          candidate.weightKg,
          candidate.reps,
          candidate.workoutSetId,
          candidate.sessionId,
          candidate.achievedAt,
          previousValue,
          now,
          now,
        ],
      );

      created.push({
        id,
        exerciseId,
        recordType: beat.recordType,
        repBucket: beat.repBucket,
        value: beat.newValue,
        weightKg: candidate.weightKg,
        reps: candidate.reps,
        workoutSetId: candidate.workoutSetId,
        sessionId: candidate.sessionId,
        achievedAt: candidate.achievedAt,
        previousValue,
        isCurrent: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    return created;
  }

  /**
   * Union of every exercise that currently has a record row and every
   * exercise that has any eligible completed set - a default (no
   * `exerciseIds` given) `rebuild()` must cover both, otherwise an exercise
   * whose last eligible set was deleted would keep a stale record forever
   * (the "user deletes the session that held their only PR" edge case).
   */
  private async allCandidateExerciseIds(executor: SqlExecutor): Promise<EntityId[]> {
    const rows = await executor.select<{ exercise_id: string }>(
      `SELECT DISTINCT exercise_id FROM personal_record
       UNION
       SELECT DISTINCT exercise_id FROM v_working_set WHERE set_type IN ('normal', 'failure')`,
    );
    return rows.map((row) => row.exercise_id);
  }
}
