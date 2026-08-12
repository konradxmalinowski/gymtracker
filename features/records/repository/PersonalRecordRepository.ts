import type { SqlExecutor } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import type { SetType } from '../domain/Estimated1RM';
import type { RecordType, RepBucket } from '../types/PersonalRecord';

/**
 * One `personal_record` row (`database/schema.sql` section 7.7), current or
 * superseded. Richer than Pass 1's `PersonalRecordSnapshot`
 * (`features/records/types/PersonalRecord.ts`), which only carries what
 * `evaluateCandidateRecords` needs to compare a value against - this is the
 * full row shape a real consumer (a PR badge, a PR timeline, `rebuild()`'s
 * own regenerated table) needs.
 */
export interface PersonalRecord {
  id: EntityId;
  exerciseId: EntityId;
  recordType: RecordType;
  /** Only meaningful for `weight_at_reps`; `null` for every other record type. */
  repBucket: RepBucket | null;
  /** The comparable magnitude for this `recordType` - what `evaluateCandidateRecords` compared. */
  value: number;
  /** The full context of the set that achieved this record, regardless of `recordType` - e.g. a `max_reps` row's `weightKg` says what weight those reps were performed at. */
  weightKg: number | null;
  reps: number | null;
  /** `ON DELETE SET NULL` - survives the set/session being hard-deleted so the record itself is never silently dropped. */
  workoutSetId: EntityId | null;
  sessionId: EntityId | null;
  achievedAt: number;
  /** The value this row superseded, or `null` for a first-ever record in this slot. */
  previousValue: number | null;
  isCurrent: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * One newly-completed, not-yet-evaluated `workout_set`'s raw values - the
 * input `evaluateAndUpsert`/`rebuild` need to decide which records it beats.
 *
 * Deliberately does NOT carry a pre-computed `estimated1RmKg` the way Pass 1's
 * `CandidateSetInput` (`features/records/domain/evaluateCandidateRecords.ts`)
 * does - this repository is the one place that resolves `oneRm.formula` from
 * settings and calls `estimated1RM()` with it (ADR-0015's "one module owns
 * every training formula", extended from the pure calculator down to the
 * repository layer that actually reads the setting), so neither
 * `SqliteWorkoutSessionRepository.completeSet` nor `rebuild()`'s own internal
 * walk needs any settings-schema knowledge of its own - the same layering
 * rule P7's rest-timer wiring already established for this codebase (a
 * repository stays free of settings-schema knowledge; whichever layer reads
 * the setting passes down a plain resolved value).
 */
export interface RecordCandidateSet {
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceM: number | null;
  workoutSetId: EntityId;
  sessionId: EntityId;
  /** Becomes the new record row's `achieved_at` - the set's `performed_at` (already re-anchored to `completed_at` by `completeSet`). */
  achievedAt: number;
}

/**
 * `PersonalRecordRepository` (feature: `records`) - ARCHITECTURE.md section
 * 8.3's exact method list, unchanged in name or shape.
 */
export interface PersonalRecordRepository {
  /** Current records only, optionally scoped to one exercise. */
  listCurrent(exerciseId?: EntityId, tx?: SqlExecutor): Promise<PersonalRecord[]>;
  /** Most recently achieved current records across every exercise - Home's "latest PR". */
  listRecent(limit: number, tx?: SqlExecutor): Promise<PersonalRecord[]>;
  /**
   * Evaluates one newly-completed set against the exercise's current records
   * and upserts whichever it beats. `tx` is REQUIRED, not optional (ADR-0015
   * Decision 3: "PRs are evaluated inside the same transaction as the set
   * completion that might beat them") - there is no legitimate standalone
   * call to this method outside a set-completion transaction or `rebuild()`'s
   * own internal walk, both of which always have a `tx` in hand.
   *
   * Returns only the newly-created current rows (what a PR badge renders) -
   * not the superseded rows this call may also have written.
   */
  evaluateAndUpsert(
    exerciseId: EntityId,
    candidate: RecordCandidateSet,
    tx: SqlExecutor,
  ): Promise<PersonalRecord[]>;
  /** Every row (current and superseded) for one exercise/record type, most recently achieved first - the PR timeline. */
  listHistory(
    exerciseId: EntityId,
    recordType: RecordType,
    tx?: SqlExecutor,
  ): Promise<PersonalRecord[]>;
  /**
   * Fully regenerates `personal_record` from `workout_set` - ADR-0015's
   * safety net and the property the equivalence test verifies. Scoped to
   * `exerciseIds` when given, otherwise every exercise that currently has
   * any eligible completed set or any existing record row (so an exercise
   * whose only eligible sets were all deleted still has its now-stale
   * records cleared).
   *
   * Walks `v_working_set` (`database/schema.sql` section 7.10), which only
   * includes sets belonging to a `status = 'completed'` session - by design,
   * not an oversight: an in-progress session's completed sets already have
   * their `personal_record` rows written incrementally, right as each one is
   * completed, by `evaluateAndUpsert` itself (ADR-0015 Decision 3's whole
   * point). `rebuild()` exists as a safety net for *historical* data that can
   * drift after the fact (an edited or deleted past session); it does not
   * need to also cover a workout still being logged, and the moment that
   * workout finishes, its sets become visible here like any other completed
   * session's. Calling `rebuild()` while a session is in progress therefore
   * never erases that session's already-earned PRs - it simply does not
   * re-derive them a second time until the session is finished.
   *
   * Runs inside `tx` when given (composed into a larger transaction, e.g. a
   * future session-edit rebuild call - see this repository's own
   * implementation note on why P8 does not wire that call site yet); opens
   * its own transaction otherwise, since this is also a standalone entry
   * point (the "Recalculate records" settings action).
   */
  rebuild(exerciseIds?: readonly EntityId[], tx?: SqlExecutor): Promise<void>;
}
