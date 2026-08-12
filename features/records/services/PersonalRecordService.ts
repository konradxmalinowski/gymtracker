import { z } from 'zod';
import type { EntityId } from '@/repositories/contracts/repository';
import type {
  PersonalRecord,
  PersonalRecordRepository,
} from '../repository/PersonalRecordRepository';
import type { RecordType } from '../types/PersonalRecord';
import { RecordValidationError } from './errors';

/** Generous enough for any real "latest PR" list or feed; guards against an accidental unbounded query from presentation. */
const MAX_RECENT_LIMIT = 500;
const limitSchema = z.number().int().min(1).max(MAX_RECENT_LIMIT);

function checkLimit(limit: number): number {
  const result = limitSchema.safeParse(limit);
  if (!result.success) {
    throw new RecordValidationError(result.error.issues);
  }
  return result.data;
}

export interface PersonalRecordServiceDependencies {
  repository: PersonalRecordRepository;
}

/**
 * The only door into `PersonalRecordRepository` from presentation
 * (ARCHITECTURE.md section 3.1 rule 3).
 *
 * `evaluateAndUpsert` is deliberately NOT exposed here - it only ever runs
 * inside `SqliteWorkoutSessionRepository.completeSet`'s own transaction,
 * called repository-to-repository (the allowed `workout-logging -> records`
 * direction, ARCHITECTURE.md section 9.1), never from a screen or hook. A
 * service method that took a `tx` parameter would leak a repository-layer
 * concern into a surface presentation is supposed to be shielded from.
 */
export class PersonalRecordService {
  constructor(private readonly deps: PersonalRecordServiceDependencies) {}

  listCurrent(exerciseId?: EntityId): Promise<PersonalRecord[]> {
    return this.deps.repository.listCurrent(exerciseId);
  }

  /** Home's "latest PR" feed. @throws {RecordValidationError} when `limit` is not a positive integer within range. */
  listRecent(limit: number): Promise<PersonalRecord[]> {
    return this.deps.repository.listRecent(checkLimit(limit));
  }

  /** The PR timeline for one exercise/record type - current row plus every superseded one, most recent first. */
  listHistory(exerciseId: EntityId, recordType: RecordType): Promise<PersonalRecord[]> {
    return this.deps.repository.listHistory(exerciseId, recordType);
  }

  /**
   * "Recalculate records" (Settings). A real, potentially expensive bulk
   * recompute over every completed set when `exerciseIds` is omitted -
   * presentation is expected to gate this behind a confirmation dialog
   * before calling it, not this method's own concern to enforce.
   */
  rebuild(exerciseIds?: readonly EntityId[]): Promise<void> {
    return this.deps.repository.rebuild(exerciseIds);
  }
}
