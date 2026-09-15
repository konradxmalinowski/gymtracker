import type { SqlExecutor, SqlParam } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import type { RepositoryDependencies } from '@/repositories/base';
import { boolFromSql, boolToSql, jsonFromSql, jsonToSql } from '@/repositories/mapping';
import type { ExerciseMuscleRef } from '@/features/exercise-library';
import { computeSessionTotals } from '@/features/workout-logging';
import type { SessionStatus, SetType } from '@/features/workout-logging';
import type { GoalType, ReminderType, ReminderResponseValue } from '@/features/daily-goals';
import { foldNameForMatch } from '../domain/csvImportGrouping';
import type { CsvSetRowInput } from '../domain/csvRowMapper';
import type { ExportCounts, DataTransferRepository } from './DataTransferRepository';
import type {
  ExportBodyMetric,
  ExportCustomExercise,
  ExportDailyGoal,
  ExportDailyGoalEntry,
  ExportDailyReminder,
  ExportDailyReminderResponse,
  ExportExerciseUserData,
  ExportExerciseVideo,
  ExportPersonalRecord,
  ExportPlan,
  ExportPlanDay,
  ExportPlanDayExercise,
  ExportProfile,
  ExportProgressPhoto,
  ExportSession,
  ExportSessionExercise,
  ExportSetting,
  ExportWorkoutSet,
} from '../types/ExportEnvelope';

// ============================================================================
// Raw row shapes - one per source table, snake_case, mirroring
// `database/schema.sql` exactly (the same "Row extends ..." pattern every
// other feature repository in this codebase uses).
// ============================================================================

interface ProfileRow {
  id: string;
  nickname: string;
  avatar_file_name: string | null;
  birth_date: string | null;
  sex: 'male' | 'female' | 'unspecified' | null;
  created_at: number;
  updated_at: number;
}

interface SettingRow {
  key: string;
  value: string;
  updated_at: number;
}

interface ExerciseRow {
  id: string;
  source: 'catalog' | 'custom';
  catalog_slug: string | null;
  name_en: string;
  name_pl: string | null;
  name_search: string;
  aliases: string;
  category: string | null;
  force: 'push' | 'pull' | 'static' | null;
  mechanic: 'compound' | 'isolation' | null;
  level: 'beginner' | 'intermediate' | 'expert' | null;
  equipment_slug: string | null;
  body_part: string | null;
  tracking_type: ExportCustomExercise['trackingType'];
  instructions: string;
  images: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface ExerciseMuscleRow {
  exercise_id: string;
  muscle_slug: string;
  role: 'primary' | 'secondary';
}

interface ExerciseUserDataRow {
  exercise_id: string;
  is_favorite: number;
  favorited_at: number | null;
  note: string | null;
  default_rest_seconds: number | null;
  display_name_override: string | null;
  last_performed_at: number | null;
  created_at: number;
  updated_at: number;
}

interface ExerciseVideoRow {
  id: string;
  exercise_id: string;
  url: string;
  title: string;
  channel: string | null;
  language: 'en' | 'pl';
  sort_order: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface PlanRow {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  is_active: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface PlanDayRow {
  id: string;
  plan_id: string;
  name: string;
  note: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface PlanDayExerciseRow {
  id: string;
  plan_day_id: string;
  exercise_id: string;
  sort_order: number;
  target_sets: number | null;
  target_rep_min: number | null;
  target_rep_max: number | null;
  target_rpe: number | null;
  rest_seconds: number | null;
  superset_group: number | null;
  note: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface SessionRow {
  id: string;
  plan_id: string | null;
  plan_day_id: string | null;
  plan_name_snapshot: string | null;
  plan_day_name_snapshot: string | null;
  title: string;
  status: SessionStatus;
  started_at: number;
  finished_at: number | null;
  local_date: string;
  tz_offset_minutes: number;
  duration_seconds: number | null;
  paused_ms: number;
  total_volume_kg: number | null;
  total_sets: number | null;
  total_reps: number | null;
  estimated_kcal: number | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface SessionExerciseRow {
  id: string;
  session_id: string;
  exercise_id: string;
  exercise_name_snapshot: string;
  sort_order: number;
  superset_group: number | null;
  rest_seconds_override: number | null;
  note: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface WorkoutSetRow {
  id: string;
  session_exercise_id: string;
  session_id: string;
  exercise_id: string;
  set_index: number;
  set_type: SetType;
  parent_set_id: string | null;
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_m: number | null;
  rpe: number | null;
  is_completed: number;
  completed_at: number | null;
  performed_at: number;
  note: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface PersonalRecordRow {
  id: string;
  exercise_id: string;
  record_type: ExportPersonalRecord['recordType'];
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

interface BodyMetricRow {
  id: string;
  metric: ExportBodyMetric['metric'];
  value: number;
  measured_at: number;
  local_date: string;
  note: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface ProgressPhotoRow {
  id: string;
  file_name: string;
  thumb_name: string;
  pose: ExportProgressPhoto['pose'];
  taken_at: number;
  local_date: string;
  width: number;
  height: number;
  byte_size: number;
  note: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface DailyGoalRow {
  id: string;
  name: string;
  icon: string | null;
  goal_type: GoalType;
  target_value: number | null;
  unit: string | null;
  active_weekdays: number;
  is_enabled: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface DailyGoalEntryRow {
  id: string;
  goal_id: string;
  local_date: string;
  progress_value: number;
  created_at: number;
  updated_at: number;
}

interface DailyReminderRow {
  id: string;
  goal_id: string | null;
  name: string;
  icon: string | null;
  is_enabled: number;
  reminder_type: ReminderType;
  time_of_day: string | null;
  interval_minutes: number | null;
  active_weekdays: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface DailyReminderResponseRow {
  id: string;
  reminder_id: string;
  local_date: string;
  response: ReminderResponseValue;
  responded_at: number;
  created_at: number;
}

/** The flat, already-joined-and-computed row `exportCsvSetRowsBatch`'s SQL produces - column-for-column what `CsvSetRowInput` needs, snake_case. */
interface CsvJoinedRow {
  local_date: string;
  performed_at_ms: number;
  tz_offset_minutes: number;
  session_id: string;
  session_title: string;
  plan_name: string | null;
  day_name: string | null;
  exercise_name: string;
  exercise_slug: string | null;
  exercise_id: string;
  set_number: number;
  set_type: SetType;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  duration_seconds: number | null;
  distance_m: number | null;
  set_note: string | null;
  session_note: string | null;
  is_pr: number;
}

// ============================================================================
// Row -> Export* mapping
// ============================================================================

function mapExportProfileRow(row: ProfileRow): ExportProfile {
  return {
    nickname: row.nickname,
    avatarFileName: row.avatar_file_name,
    birthDate: row.birth_date,
    sex: row.sex,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapExportSettingRow(row: SettingRow): ExportSetting {
  return {
    key: row.key,
    value: jsonFromSql<unknown>(row.value, null),
    updatedAt: row.updated_at,
  };
}

function mapExportCustomExerciseRow(
  row: ExerciseRow,
  muscles: readonly ExerciseMuscleRef[],
): ExportCustomExercise {
  return {
    id: row.id,
    nameEn: row.name_en,
    namePl: row.name_pl,
    nameSearch: row.name_search,
    aliases: jsonFromSql<string[]>(row.aliases, []),
    category: row.category,
    force: row.force,
    mechanic: row.mechanic,
    level: row.level,
    equipmentSlug: row.equipment_slug,
    bodyPart: row.body_part,
    trackingType: row.tracking_type,
    instructions: jsonFromSql<string[]>(row.instructions, []),
    images: jsonFromSql<string[]>(row.images, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    muscles: [...muscles],
  };
}

function mapExportExerciseUserDataRow(row: ExerciseUserDataRow): ExportExerciseUserData {
  return {
    exerciseId: row.exercise_id,
    isFavorite: boolFromSql(row.is_favorite),
    favoritedAt: row.favorited_at,
    note: row.note,
    defaultRestSeconds: row.default_rest_seconds,
    displayNameOverride: row.display_name_override,
    lastPerformedAt: row.last_performed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapExportExerciseVideoRow(row: ExerciseVideoRow): ExportExerciseVideo {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    url: row.url,
    title: row.title,
    channel: row.channel,
    language: row.language,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapExportPlanDayExerciseRow(row: PlanDayExerciseRow): ExportPlanDayExercise {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    sortOrder: row.sort_order,
    targetSets: row.target_sets,
    targetRepMin: row.target_rep_min,
    targetRepMax: row.target_rep_max,
    targetRpe: row.target_rpe,
    restSeconds: row.rest_seconds,
    supersetGroup: row.superset_group,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapExportPlanDayRow(
  row: PlanDayRow,
  exercises: readonly ExportPlanDayExercise[],
): ExportPlanDay {
  return {
    id: row.id,
    name: row.name,
    note: row.note,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    exercises: [...exercises],
  };
}

function mapExportPlanRow(row: PlanRow, days: readonly ExportPlanDay[]): ExportPlan {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    isActive: boolFromSql(row.is_active),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    days: [...days],
  };
}

function mapExportWorkoutSetRow(row: WorkoutSetRow): ExportWorkoutSet {
  return {
    id: row.id,
    setIndex: row.set_index,
    setType: row.set_type,
    parentSetId: row.parent_set_id,
    weightKg: row.weight_kg,
    reps: row.reps,
    durationSeconds: row.duration_seconds,
    distanceM: row.distance_m,
    rpe: row.rpe,
    isCompleted: boolFromSql(row.is_completed),
    completedAt: row.completed_at,
    performedAt: row.performed_at,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapExportSessionExerciseRow(
  row: SessionExerciseRow,
  sets: readonly ExportWorkoutSet[],
): ExportSessionExercise {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    exerciseNameSnapshot: row.exercise_name_snapshot,
    sortOrder: row.sort_order,
    supersetGroup: row.superset_group,
    restSecondsOverride: row.rest_seconds_override,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    sets: [...sets],
  };
}

function mapExportSessionRow(
  row: SessionRow,
  exercises: readonly ExportSessionExercise[],
): ExportSession {
  return {
    id: row.id,
    planId: row.plan_id,
    planDayId: row.plan_day_id,
    planNameSnapshot: row.plan_name_snapshot,
    planDayNameSnapshot: row.plan_day_name_snapshot,
    title: row.title,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    localDate: row.local_date,
    tzOffsetMinutes: row.tz_offset_minutes,
    durationSeconds: row.duration_seconds,
    pausedMs: row.paused_ms,
    totalVolumeKg: row.total_volume_kg,
    totalSets: row.total_sets,
    totalReps: row.total_reps,
    estimatedKcal: row.estimated_kcal,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    exercises: [...exercises],
  };
}

function mapExportPersonalRecordRow(row: PersonalRecordRow): ExportPersonalRecord {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    recordType: row.record_type,
    repBucket: row.rep_bucket,
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

function mapExportBodyMetricRow(row: BodyMetricRow): ExportBodyMetric {
  return {
    id: row.id,
    metric: row.metric,
    value: row.value,
    measuredAt: row.measured_at,
    localDate: row.local_date,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapExportProgressPhotoRow(row: ProgressPhotoRow): ExportProgressPhoto {
  return {
    id: row.id,
    fileName: row.file_name,
    thumbName: row.thumb_name,
    pose: row.pose,
    takenAt: row.taken_at,
    localDate: row.local_date,
    width: row.width,
    height: row.height,
    byteSize: row.byte_size,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapExportDailyGoalRow(row: DailyGoalRow): ExportDailyGoal {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    goalType: row.goal_type,
    targetValue: row.target_value,
    unit: row.unit,
    activeWeekdays: row.active_weekdays,
    isEnabled: boolFromSql(row.is_enabled),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapExportDailyGoalEntryRow(row: DailyGoalEntryRow): ExportDailyGoalEntry {
  return {
    id: row.id,
    goalId: row.goal_id,
    localDate: row.local_date,
    progressValue: row.progress_value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapExportDailyReminderRow(row: DailyReminderRow): ExportDailyReminder {
  return {
    id: row.id,
    goalId: row.goal_id,
    name: row.name,
    icon: row.icon,
    isEnabled: boolFromSql(row.is_enabled),
    reminderType: row.reminder_type,
    timeOfDay: row.time_of_day,
    intervalMinutes: row.interval_minutes,
    activeWeekdays: row.active_weekdays,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapExportDailyReminderResponseRow(
  row: DailyReminderResponseRow,
): ExportDailyReminderResponse {
  return {
    id: row.id,
    reminderId: row.reminder_id,
    localDate: row.local_date,
    response: row.response,
    respondedAt: row.responded_at,
    createdAt: row.created_at,
  };
}

function mapCsvJoinedRow(row: CsvJoinedRow): CsvSetRowInput {
  return {
    localDate: row.local_date,
    performedAtMs: row.performed_at_ms,
    tzOffsetMinutes: row.tz_offset_minutes,
    sessionId: row.session_id,
    sessionTitle: row.session_title,
    planName: row.plan_name,
    dayName: row.day_name,
    exerciseName: row.exercise_name,
    exerciseSlug: row.exercise_slug,
    exerciseId: row.exercise_id,
    setNumber: row.set_number,
    setType: row.set_type,
    weightKg: row.weight_kg,
    reps: row.reps,
    rpe: row.rpe,
    durationSeconds: row.duration_seconds,
    distanceM: row.distance_m,
    isPr: boolFromSql(row.is_pr),
    setNote: row.set_note,
    sessionNote: row.session_note,
  };
}

/** `IN (?, ?, ...)` placeholder helper - every caller here already guards the empty-list case itself before reaching this. */
function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

// ============================================================================
// Repository
// ============================================================================

/**
 * SQLite implementation of `DataTransferRepository` - see that interface's
 * own doc comment for the full design rationale (streaming shape, merge
 * semantics, transaction shape). Deliberately does NOT extend
 * `BaseSqliteRepository`: that base class is scoped to one table per
 * instance (`protected abstract readonly table`), and this repository reads
 * and writes across more than a dozen tables with no single aggregate root -
 * the same judgment call `SqlitePlanRepository`/`SqliteWorkoutSessionRepository`
 * document for their own `plan_day`/`session_exercise` child tables, just
 * with every table in the schema instead of two.
 */
export class SqliteDataTransferRepository implements DataTransferRepository {
  constructor(private readonly deps: RepositoryDependencies) {}

  private executor(tx?: SqlExecutor): SqlExecutor {
    return tx ?? this.deps.db;
  }

  /**
   * Generic "upsert by id, newer `updated_at` wins" writer every `upsert*`
   * method below composes with its own table name and column set - see
   * `DataTransferRepository`'s own "Merge semantics" doc comment.
   * `columns` must include `updated_at`; `excludeFromUpdate` (default
   * `['created_at']`) lists columns written only on a fresh `INSERT`, never
   * touched by the `DO UPDATE` branch - `created_at` must never change once
   * a row exists, regardless of what an imported file's own (necessarily
   * identical, since ids are stable) `created_at` says.
   *
   * `table`/`primaryKeyColumn`/every key of `columns` are always this file's
   * own hardcoded literals, never caller/file input - the same
   * interpolation-safety reasoning every other repository in this codebase
   * documents for its own dynamic SQL. Returns whether the write actually
   * applied (`false` when a conflict existed but the local row's
   * `updated_at` was already >= the file's).
   */
  private async upsertRow(
    table: string,
    primaryKeyColumn: string,
    primaryKeyValue: SqlParam,
    columns: Record<string, SqlParam>,
    tx: SqlExecutor,
    excludeFromUpdate: readonly string[] = ['created_at'],
  ): Promise<boolean> {
    const excluded = new Set(excludeFromUpdate);
    const entries: [string, SqlParam][] = [
      [primaryKeyColumn, primaryKeyValue],
      ...Object.entries(columns),
    ];
    const columnNames = entries.map(([name]) => name);
    const updateAssignments = Object.keys(columns)
      .filter((name) => !excluded.has(name))
      .map((name) => `${name} = excluded.${name}`)
      .join(', ');
    const result = await tx.run(
      `INSERT INTO ${table} (${columnNames.join(', ')}) VALUES (${columnNames.map(() => '?').join(', ')})
       ON CONFLICT(${primaryKeyColumn}) DO UPDATE SET ${updateAssignments}
       WHERE excluded.updated_at > ${table}.updated_at`,
      entries.map(([, value]) => value),
    );
    return result.changes > 0;
  }

  // --- export: header counts ---------------------------------------------

  async getExportCounts(tx?: SqlExecutor): Promise<ExportCounts> {
    const executor = this.executor(tx);
    const sessionsRow = await executor.selectOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM workout_session',
    );
    const setsRow = await executor.selectOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM v_working_set',
    );
    const exercisesRow = await executor.selectOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM exercise WHERE deleted_at IS NULL',
    );
    return {
      sessions: sessionsRow?.count ?? 0,
      sets: setsRow?.count ?? 0,
      exercises: exercisesRow?.count ?? 0,
    };
  }

  // --- export: small/unbounded tables -------------------------------------

  async exportProfile(tx?: SqlExecutor): Promise<ExportProfile | null> {
    const row = await this.executor(tx).selectOne<ProfileRow>(
      'SELECT * FROM user_profile WHERE id = ?',
      ['local'],
    );
    return row ? mapExportProfileRow(row) : null;
  }

  async exportSettings(tx?: SqlExecutor): Promise<ExportSetting[]> {
    const rows = await this.executor(tx).select<SettingRow>('SELECT * FROM app_setting');
    return rows.map(mapExportSettingRow);
  }

  async exportCustomExercises(tx?: SqlExecutor): Promise<ExportCustomExercise[]> {
    const executor = this.executor(tx);
    const rows = await executor.select<ExerciseRow>(
      "SELECT * FROM exercise WHERE source = 'custom'",
    );
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((row) => row.id);
    const muscleRows = await executor.select<ExerciseMuscleRow>(
      `SELECT exercise_id, muscle_slug, role FROM exercise_muscle
       WHERE exercise_id IN (${placeholders(ids.length)})
       ORDER BY exercise_id ASC, role ASC, muscle_slug ASC`,
      ids,
    );
    const musclesByExercise = new Map<string, ExerciseMuscleRef[]>();
    for (const row of muscleRows) {
      const list = musclesByExercise.get(row.exercise_id) ?? [];
      list.push({ slug: row.muscle_slug, role: row.role });
      musclesByExercise.set(row.exercise_id, list);
    }
    return rows.map((row) => mapExportCustomExerciseRow(row, musclesByExercise.get(row.id) ?? []));
  }

  async exportExerciseUserData(tx?: SqlExecutor): Promise<ExportExerciseUserData[]> {
    const rows = await this.executor(tx).select<ExerciseUserDataRow>(
      'SELECT * FROM exercise_user_data',
    );
    return rows.map(mapExportExerciseUserDataRow);
  }

  async exportExerciseVideos(tx?: SqlExecutor): Promise<ExportExerciseVideo[]> {
    const rows = await this.executor(tx).select<ExerciseVideoRow>(
      "SELECT * FROM exercise_video WHERE source = 'user'",
    );
    return rows.map(mapExportExerciseVideoRow);
  }

  async exportPlans(tx?: SqlExecutor): Promise<ExportPlan[]> {
    const executor = this.executor(tx);
    const planRows = await executor.select<PlanRow>('SELECT * FROM plan ORDER BY id ASC');
    if (planRows.length === 0) {
      return [];
    }
    const planIds = planRows.map((row) => row.id);
    const dayRows = await executor.select<PlanDayRow>(
      `SELECT * FROM plan_day WHERE plan_id IN (${placeholders(planIds.length)}) ORDER BY plan_id ASC, sort_order ASC`,
      planIds,
    );

    let dayExerciseRows: PlanDayExerciseRow[] = [];
    if (dayRows.length > 0) {
      const dayIds = dayRows.map((row) => row.id);
      dayExerciseRows = await executor.select<PlanDayExerciseRow>(
        `SELECT * FROM plan_day_exercise WHERE plan_day_id IN (${placeholders(dayIds.length)}) ORDER BY plan_day_id ASC, sort_order ASC`,
        dayIds,
      );
    }

    const exercisesByDay = new Map<string, ExportPlanDayExercise[]>();
    for (const row of dayExerciseRows) {
      const list = exercisesByDay.get(row.plan_day_id) ?? [];
      list.push(mapExportPlanDayExerciseRow(row));
      exercisesByDay.set(row.plan_day_id, list);
    }

    const daysByPlan = new Map<string, ExportPlanDay[]>();
    for (const row of dayRows) {
      const list = daysByPlan.get(row.plan_id) ?? [];
      list.push(mapExportPlanDayRow(row, exercisesByDay.get(row.id) ?? []));
      daysByPlan.set(row.plan_id, list);
    }

    return planRows.map((row) => mapExportPlanRow(row, daysByPlan.get(row.id) ?? []));
  }

  async exportPersonalRecords(tx?: SqlExecutor): Promise<ExportPersonalRecord[]> {
    const rows = await this.executor(tx).select<PersonalRecordRow>('SELECT * FROM personal_record');
    return rows.map(mapExportPersonalRecordRow);
  }

  async exportBodyMetrics(tx?: SqlExecutor): Promise<ExportBodyMetric[]> {
    const rows = await this.executor(tx).select<BodyMetricRow>('SELECT * FROM body_metric_entry');
    return rows.map(mapExportBodyMetricRow);
  }

  async exportProgressPhotos(tx?: SqlExecutor): Promise<ExportProgressPhoto[]> {
    const rows = await this.executor(tx).select<ProgressPhotoRow>('SELECT * FROM progress_photo');
    return rows.map(mapExportProgressPhotoRow);
  }

  async exportDailyGoals(tx?: SqlExecutor): Promise<ExportDailyGoal[]> {
    const rows = await this.executor(tx).select<DailyGoalRow>('SELECT * FROM daily_goal');
    return rows.map(mapExportDailyGoalRow);
  }

  async exportDailyGoalEntries(tx?: SqlExecutor): Promise<ExportDailyGoalEntry[]> {
    const rows = await this.executor(tx).select<DailyGoalEntryRow>(
      'SELECT * FROM daily_goal_entry',
    );
    return rows.map(mapExportDailyGoalEntryRow);
  }

  async exportDailyReminders(tx?: SqlExecutor): Promise<ExportDailyReminder[]> {
    const rows = await this.executor(tx).select<DailyReminderRow>('SELECT * FROM daily_reminder');
    return rows.map(mapExportDailyReminderRow);
  }

  async exportDailyReminderResponses(tx?: SqlExecutor): Promise<ExportDailyReminderResponse[]> {
    const rows = await this.executor(tx).select<DailyReminderResponseRow>(
      'SELECT * FROM daily_reminder_response',
    );
    return rows.map(mapExportDailyReminderResponseRow);
  }

  // --- export: large tables, batched/streamed -----------------------------

  async countExportSessions(tx?: SqlExecutor): Promise<number> {
    const row = await this.executor(tx).selectOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM workout_session',
    );
    return row?.count ?? 0;
  }

  async exportSessionsBatch(
    offset: number,
    limit: number,
    tx?: SqlExecutor,
  ): Promise<ExportSession[]> {
    const executor = this.executor(tx);
    const sessionRows = await executor.select<SessionRow>(
      'SELECT * FROM workout_session ORDER BY id ASC LIMIT ? OFFSET ?',
      [limit, offset],
    );
    if (sessionRows.length === 0) {
      return [];
    }
    const sessionIds = sessionRows.map((row) => row.id);
    const sessionExerciseRows = await executor.select<SessionExerciseRow>(
      `SELECT * FROM session_exercise WHERE session_id IN (${placeholders(sessionIds.length)}) ORDER BY session_id ASC, sort_order ASC`,
      sessionIds,
    );

    let setRows: WorkoutSetRow[] = [];
    if (sessionExerciseRows.length > 0) {
      setRows = await executor.select<WorkoutSetRow>(
        // `created_at ASC, id ASC` guarantees a drop segment (created after
        // its parent) always follows its own parent in this array - the
        // ordering `upsertSession`'s FK-safety contract depends on.
        `SELECT * FROM workout_set WHERE session_id IN (${placeholders(sessionIds.length)}) ORDER BY session_exercise_id ASC, created_at ASC, id ASC`,
        sessionIds,
      );
    }

    const setsByExercise = new Map<string, ExportWorkoutSet[]>();
    for (const row of setRows) {
      const list = setsByExercise.get(row.session_exercise_id) ?? [];
      list.push(mapExportWorkoutSetRow(row));
      setsByExercise.set(row.session_exercise_id, list);
    }

    const exercisesBySession = new Map<string, ExportSessionExercise[]>();
    for (const row of sessionExerciseRows) {
      const list = exercisesBySession.get(row.session_id) ?? [];
      list.push(mapExportSessionExerciseRow(row, setsByExercise.get(row.id) ?? []));
      exercisesBySession.set(row.session_id, list);
    }

    return sessionRows.map((row) => mapExportSessionRow(row, exercisesBySession.get(row.id) ?? []));
  }

  async countCsvSetRows(tx?: SqlExecutor): Promise<number> {
    const row = await this.executor(tx).selectOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM v_working_set',
    );
    return row?.count ?? 0;
  }

  async exportCsvSetRowsBatch(
    offset: number,
    limit: number,
    tx?: SqlExecutor,
  ): Promise<CsvSetRowInput[]> {
    const rows = await this.executor(tx).select<CsvJoinedRow>(
      `SELECT
         vws.local_date        AS local_date,
         vws.performed_at      AS performed_at_ms,
         s.tz_offset_minutes   AS tz_offset_minutes,
         s.id                  AS session_id,
         s.title               AS session_title,
         s.plan_name_snapshot  AS plan_name,
         s.plan_day_name_snapshot AS day_name,
         se.exercise_name_snapshot AS exercise_name,
         e.catalog_slug        AS exercise_slug,
         vws.exercise_id       AS exercise_id,
         vws.set_index         AS set_number,
         vws.set_type          AS set_type,
         vws.weight_kg         AS weight_kg,
         vws.reps              AS reps,
         vws.rpe               AS rpe,
         vws.duration_seconds  AS duration_seconds,
         vws.distance_m        AS distance_m,
         vws.note              AS set_note,
         s.notes               AS session_note,
         CASE WHEN pr.id IS NOT NULL THEN 1 ELSE 0 END AS is_pr
       FROM v_working_set vws
       JOIN workout_session s ON s.id = vws.session_id
       JOIN session_exercise se ON se.id = vws.session_exercise_id
       JOIN exercise e ON e.id = vws.exercise_id
       LEFT JOIN personal_record pr ON pr.workout_set_id = vws.id AND pr.is_current = 1
       ORDER BY vws.id ASC
       LIMIT ? OFFSET ?`,
      [limit, offset],
    );
    return rows.map(mapCsvJoinedRow);
  }

  // --- import: merge (upsert-by-id, newer `updated_at` wins) --------------

  async upsertProfile(profile: ExportProfile, tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      await this.upsertRow(
        'user_profile',
        'id',
        'local',
        {
          nickname: profile.nickname,
          avatar_file_name: profile.avatarFileName,
          birth_date: profile.birthDate,
          sex: profile.sex,
          created_at: profile.createdAt,
          updated_at: profile.updatedAt,
        },
        t,
      );
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async upsertSetting(setting: ExportSetting, tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      await this.upsertRow(
        'app_setting',
        'key',
        setting.key,
        { value: jsonToSql(setting.value), updated_at: setting.updatedAt },
        t,
      );
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async upsertCustomExercise(exercise: ExportCustomExercise, tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      const applied = await this.upsertRow(
        'exercise',
        'id',
        exercise.id,
        {
          source: 'custom',
          catalog_slug: null,
          name_en: exercise.nameEn,
          name_pl: exercise.namePl,
          name_search: exercise.nameSearch,
          aliases: jsonToSql(exercise.aliases),
          category: exercise.category,
          force: exercise.force,
          mechanic: exercise.mechanic,
          level: exercise.level,
          equipment_slug: exercise.equipmentSlug,
          body_part: exercise.bodyPart,
          tracking_type: exercise.trackingType,
          instructions: jsonToSql(exercise.instructions),
          images: jsonToSql(exercise.images),
          created_at: exercise.createdAt,
          updated_at: exercise.updatedAt,
          deleted_at: exercise.deletedAt,
        },
        t,
      );
      // Only replace the muscle list when the exercise row itself actually
      // won the merge - an older file's row must not touch a newer local
      // row's muscles either, or "newer updated_at wins" would be true for
      // the parent but silently false for this one child relation.
      if (applied) {
        await t.run('DELETE FROM exercise_muscle WHERE exercise_id = ?', [exercise.id]);
        for (const muscle of exercise.muscles) {
          await t.run(
            'INSERT INTO exercise_muscle (exercise_id, muscle_slug, role) VALUES (?, ?, ?)',
            [exercise.id, muscle.slug, muscle.role],
          );
        }
      }
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async upsertExerciseUserData(row: ExportExerciseUserData, tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      await this.upsertRow(
        'exercise_user_data',
        'exercise_id',
        row.exerciseId,
        {
          is_favorite: boolToSql(row.isFavorite),
          favorited_at: row.favoritedAt,
          note: row.note,
          default_rest_seconds: row.defaultRestSeconds,
          display_name_override: row.displayNameOverride,
          last_performed_at: row.lastPerformedAt,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        },
        t,
      );
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async upsertExerciseVideo(video: ExportExerciseVideo, tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      await this.upsertRow(
        'exercise_video',
        'id',
        video.id,
        {
          exercise_id: video.exerciseId,
          url: video.url,
          title: video.title,
          channel: video.channel,
          language: video.language,
          source: 'user',
          sort_order: video.sortOrder,
          created_at: video.createdAt,
          updated_at: video.updatedAt,
          deleted_at: video.deletedAt,
        },
        t,
      );
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  /**
   * See {@link DataTransferRepository.upsertPlan}'s own doc comment.
   *
   * **Known limitation, not handled here** (documented rather than silently
   * risked): `plan.is_active` feeds `ux_plan_single_active`, a partial
   * unique index allowing at most one active plan. Merge-importing a plan
   * whose file-side `isActive` is `true` while a different local plan is
   * already active will fail this upsert with a SQLite constraint error
   * (rolling back this one plan's transaction, per this repository's own
   * per-entity-batch transaction contract - it does not corrupt anything,
   * it just fails that plan's import). Resolving this requires a product
   * decision (does an import ever get to change which plan is "active"?)
   * that belongs at the service-orchestration layer, not silently decided
   * here by, say, deactivating whatever plan is locally active first.
   */
  async upsertPlan(plan: ExportPlan, tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      await this.upsertRow(
        'plan',
        'id',
        plan.id,
        {
          name: plan.name,
          description: plan.description,
          color: plan.color,
          is_active: boolToSql(plan.isActive),
          sort_order: plan.sortOrder,
          created_at: plan.createdAt,
          updated_at: plan.updatedAt,
          deleted_at: plan.deletedAt,
        },
        t,
      );
      for (const day of plan.days) {
        await this.upsertRow(
          'plan_day',
          'id',
          day.id,
          {
            plan_id: plan.id,
            name: day.name,
            note: day.note,
            sort_order: day.sortOrder,
            created_at: day.createdAt,
            updated_at: day.updatedAt,
            deleted_at: day.deletedAt,
          },
          t,
        );
        for (const dayExercise of day.exercises) {
          await this.upsertRow(
            'plan_day_exercise',
            'id',
            dayExercise.id,
            {
              plan_day_id: day.id,
              exercise_id: dayExercise.exerciseId,
              sort_order: dayExercise.sortOrder,
              target_sets: dayExercise.targetSets,
              target_rep_min: dayExercise.targetRepMin,
              target_rep_max: dayExercise.targetRepMax,
              target_rpe: dayExercise.targetRpe,
              rest_seconds: dayExercise.restSeconds,
              superset_group: dayExercise.supersetGroup,
              note: dayExercise.note,
              created_at: dayExercise.createdAt,
              updated_at: dayExercise.updatedAt,
              deleted_at: dayExercise.deletedAt,
            },
            t,
          );
        }
      }
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  /**
   * See {@link DataTransferRepository.upsertSession}'s own doc comment for
   * the set-ordering FK requirement.
   *
   * **Known limitation, not handled here**, the same class as `upsertPlan`'s
   * own: `session.status = 'in_progress'` feeds `ux_session_single_in_progress`,
   * a partial unique index allowing at most one in-progress session. Merge-
   * importing a session whose file-side `status` is `'in_progress'` while a
   * different local session is already in progress fails this upsert with a
   * SQLite constraint error, rolling back that one session's transaction
   * only. Left for the service-orchestration layer to decide (e.g. normalize
   * an imported `in_progress` session before calling this, or surface the
   * conflict to the user) rather than silently resolved here.
   */
  async upsertSession(session: ExportSession, tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      await this.upsertRow(
        'workout_session',
        'id',
        session.id,
        {
          plan_id: session.planId,
          plan_day_id: session.planDayId,
          plan_name_snapshot: session.planNameSnapshot,
          plan_day_name_snapshot: session.planDayNameSnapshot,
          title: session.title,
          status: session.status,
          started_at: session.startedAt,
          finished_at: session.finishedAt,
          local_date: session.localDate,
          tz_offset_minutes: session.tzOffsetMinutes,
          duration_seconds: session.durationSeconds,
          paused_ms: session.pausedMs,
          total_volume_kg: session.totalVolumeKg,
          total_sets: session.totalSets,
          total_reps: session.totalReps,
          estimated_kcal: session.estimatedKcal,
          notes: session.notes,
          created_at: session.createdAt,
          updated_at: session.updatedAt,
          deleted_at: session.deletedAt,
        },
        t,
      );
      for (const exercise of session.exercises) {
        await this.upsertRow(
          'session_exercise',
          'id',
          exercise.id,
          {
            session_id: session.id,
            exercise_id: exercise.exerciseId,
            exercise_name_snapshot: exercise.exerciseNameSnapshot,
            sort_order: exercise.sortOrder,
            superset_group: exercise.supersetGroup,
            rest_seconds_override: exercise.restSecondsOverride,
            note: exercise.note,
            created_at: exercise.createdAt,
            updated_at: exercise.updatedAt,
            deleted_at: exercise.deletedAt,
          },
          t,
        );
        // In file order, deliberately not re-sorted - see this method's own
        // doc comment on the interface for why that order is load-bearing.
        for (const set of exercise.sets) {
          await this.upsertRow(
            'workout_set',
            'id',
            set.id,
            {
              session_exercise_id: exercise.id,
              session_id: session.id,
              exercise_id: exercise.exerciseId,
              set_index: set.setIndex,
              set_type: set.setType,
              parent_set_id: set.parentSetId,
              weight_kg: set.weightKg,
              reps: set.reps,
              duration_seconds: set.durationSeconds,
              distance_m: set.distanceM,
              rpe: set.rpe,
              is_completed: boolToSql(set.isCompleted),
              completed_at: set.completedAt,
              performed_at: set.performedAt,
              note: set.note,
              created_at: set.createdAt,
              updated_at: set.updatedAt,
              deleted_at: set.deletedAt,
            },
            t,
          );
        }
      }
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async upsertBodyMetric(entry: ExportBodyMetric, tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      await this.upsertRow(
        'body_metric_entry',
        'id',
        entry.id,
        {
          metric: entry.metric,
          value: entry.value,
          measured_at: entry.measuredAt,
          local_date: entry.localDate,
          note: entry.note,
          created_at: entry.createdAt,
          updated_at: entry.updatedAt,
          deleted_at: entry.deletedAt,
        },
        t,
      );
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async upsertProgressPhoto(photo: ExportProgressPhoto, tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      await this.upsertRow(
        'progress_photo',
        'id',
        photo.id,
        {
          file_name: photo.fileName,
          thumb_name: photo.thumbName,
          pose: photo.pose,
          taken_at: photo.takenAt,
          local_date: photo.localDate,
          width: photo.width,
          height: photo.height,
          byte_size: photo.byteSize,
          note: photo.note,
          created_at: photo.createdAt,
          updated_at: photo.updatedAt,
          deleted_at: photo.deletedAt,
        },
        t,
      );
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async upsertDailyGoal(goal: ExportDailyGoal, tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      await this.upsertRow(
        'daily_goal',
        'id',
        goal.id,
        {
          name: goal.name,
          icon: goal.icon,
          goal_type: goal.goalType,
          target_value: goal.targetValue,
          unit: goal.unit,
          active_weekdays: goal.activeWeekdays,
          is_enabled: boolToSql(goal.isEnabled),
          sort_order: goal.sortOrder,
          created_at: goal.createdAt,
          updated_at: goal.updatedAt,
          deleted_at: goal.deletedAt,
        },
        t,
      );
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  /**
   * See {@link DataTransferRepository.upsertDailyGoalEntry}'s own doc comment
   * for why this targets the `(goal_id, local_date)` composite key rather
   * than reusing `upsertRow` - same shape as
   * `SqliteDailyGoalRepository.upsertEntryForToday`'s own `ON
   * CONFLICT(goal_id, local_date)`, except "newer `updated_at` wins" replaces
   * that method's unconditional overwrite, matching every other merge-mode
   * writer in this repository.
   */
  async upsertDailyGoalEntry(entry: ExportDailyGoalEntry, tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      await t.run(
        `INSERT INTO daily_goal_entry (id, goal_id, local_date, progress_value, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(goal_id, local_date) DO UPDATE SET
           progress_value = excluded.progress_value,
           updated_at = excluded.updated_at
         WHERE excluded.updated_at > daily_goal_entry.updated_at`,
        [
          entry.id,
          entry.goalId,
          entry.localDate,
          entry.progressValue,
          entry.createdAt,
          entry.updatedAt,
        ],
      );
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async upsertDailyReminder(reminder: ExportDailyReminder, tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      await this.upsertRow(
        'daily_reminder',
        'id',
        reminder.id,
        {
          goal_id: reminder.goalId,
          name: reminder.name,
          icon: reminder.icon,
          is_enabled: boolToSql(reminder.isEnabled),
          reminder_type: reminder.reminderType,
          time_of_day: reminder.timeOfDay,
          interval_minutes: reminder.intervalMinutes,
          active_weekdays: reminder.activeWeekdays,
          created_at: reminder.createdAt,
          updated_at: reminder.updatedAt,
          deleted_at: reminder.deletedAt,
        },
        t,
      );
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  /**
   * See {@link DataTransferRepository.upsertDailyReminderResponse}'s own doc
   * comment. Targets the `(reminder_id, local_date)` composite key - same
   * shape as `SqliteDailyReminderRepository.recordResponse`'s own `ON
   * CONFLICT(reminder_id, local_date)` - and uses `responded_at` (not
   * `updated_at`, which this table has none of) as the "newer wins"
   * comparator.
   */
  async upsertDailyReminderResponse(
    response: ExportDailyReminderResponse,
    tx?: SqlExecutor,
  ): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      await t.run(
        `INSERT INTO daily_reminder_response (id, reminder_id, local_date, response, responded_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(reminder_id, local_date) DO UPDATE SET
           response = excluded.response,
           responded_at = excluded.responded_at
         WHERE excluded.responded_at > daily_reminder_response.responded_at`,
        [
          response.id,
          response.reminderId,
          response.localDate,
          response.response,
          response.respondedAt,
          response.createdAt,
        ],
      );
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  // --- import: replace mode ------------------------------------------------

  async purgeAllUserData(tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      await t.run('DELETE FROM workout_set');
      await t.run('DELETE FROM session_exercise');
      await t.run('DELETE FROM workout_session');
      await t.run('DELETE FROM active_session_state');
      await t.run('DELETE FROM personal_record');
      await t.run('DELETE FROM plan_day_exercise');
      await t.run('DELETE FROM plan_day');
      await t.run('DELETE FROM plan');
      await t.run(
        "DELETE FROM exercise_muscle WHERE exercise_id IN (SELECT id FROM exercise WHERE source = 'custom')",
      );
      await t.run('DELETE FROM exercise_user_data');
      await t.run("DELETE FROM exercise WHERE source = 'custom'");
      await t.run("DELETE FROM exercise_video WHERE source = 'user'");
      await t.run('DELETE FROM body_metric_entry');
      await t.run('DELETE FROM progress_photo');
      await t.run('DELETE FROM daily_reminder_response');
      await t.run('DELETE FROM daily_goal_entry');
      await t.run('DELETE FROM daily_reminder');
      await t.run('DELETE FROM daily_goal');
      await t.run('DELETE FROM app_setting');
      // user_profile is deliberately never deleted - see this interface
      // method's own doc comment.
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  // --- import: exercise resolution ------------------------------------------

  async findExerciseIdBySlug(catalogSlug: string, tx?: SqlExecutor): Promise<EntityId | null> {
    const row = await this.executor(tx).selectOne<{ id: string }>(
      'SELECT id FROM exercise WHERE catalog_slug = ? AND deleted_at IS NULL',
      [catalogSlug],
    );
    return row?.id ?? null;
  }

  async findExerciseIdById(exerciseId: EntityId, tx?: SqlExecutor): Promise<EntityId | null> {
    const row = await this.executor(tx).selectOne<{ id: string }>(
      'SELECT id FROM exercise WHERE id = ? AND deleted_at IS NULL',
      [exerciseId],
    );
    return row?.id ?? null;
  }

  async findExerciseIdByExactName(name: string, tx?: SqlExecutor): Promise<EntityId | null> {
    const row = await this.executor(tx).selectOne<{ id: string }>(
      `SELECT id FROM exercise
       WHERE deleted_at IS NULL AND (name_en = ? OR name_pl = ?)
       ORDER BY (source = 'catalog') DESC
       LIMIT 1`,
      [name, name],
    );
    return row?.id ?? null;
  }

  async findExerciseIdByFoldedName(foldedName: string, tx?: SqlExecutor): Promise<EntityId | null> {
    const row = await this.executor(tx).selectOne<{ id: string }>(
      `SELECT id FROM exercise
       WHERE deleted_at IS NULL AND name_search LIKE '%' || ? || '%'
       ORDER BY (source = 'catalog') DESC
       LIMIT 1`,
      [foldedName],
    );
    return row?.id ?? null;
  }

  async createExerciseFromName(name: string, tx?: SqlExecutor): Promise<EntityId> {
    const runner = async (t: SqlExecutor): Promise<EntityId> => {
      const id = this.deps.idGenerator.generate();
      const now = this.deps.clock.now();
      await t.run(
        `INSERT INTO exercise (
           id, source, catalog_slug, name_en, name_pl, name_search, aliases, category,
           force, mechanic, level, equipment_slug, body_part, tracking_type,
           instructions, images, created_at, updated_at
         ) VALUES (?, 'custom', NULL, ?, NULL, ?, '[]', NULL, NULL, NULL, NULL, NULL, NULL, 'weight_reps', '[]', '[]', ?, ?)`,
        [id, name, foldNameForMatch(name), now, now],
      );
      return id;
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  // --- import: post-import rebuild support ---------------------------------

  /** See {@link DataTransferRepository.recomputeSessionTotals}'s own doc comment. */
  async recomputeSessionTotals(sessionId: EntityId, tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      // Same join `SqliteWorkoutSessionRepository`'s private
      // `computeTotalsForSession` uses - sets belonging to a soft-deleted
      // exercise are excluded here as well as by their own `deleted_at`.
      const setRows = await t.select<{
        set_type: SetType;
        weight_kg: number | null;
        reps: number | null;
        is_completed: number;
      }>(
        `SELECT ws.set_type, ws.weight_kg, ws.reps, ws.is_completed
         FROM workout_set ws
         JOIN session_exercise se ON se.id = ws.session_exercise_id
         WHERE ws.session_id = ? AND ws.deleted_at IS NULL AND se.deleted_at IS NULL`,
        [sessionId],
      );
      // `duration` is a required argument of `computeSessionTotals` but its
      // own `durationSeconds` output is deliberately discarded below - see
      // this method's own doc comment on the interface for why
      // `duration_seconds` is never touched here.
      const totals = computeSessionTotals(
        { startedAt: 0, finishedAt: 0, pausedMs: 0 },
        setRows.map((row) => ({
          setType: row.set_type,
          weightKg: row.weight_kg,
          reps: row.reps,
          isCompleted: boolFromSql(row.is_completed),
        })),
      );
      await t.run(
        'UPDATE workout_session SET total_volume_kg = ?, total_sets = ?, total_reps = ? WHERE id = ?',
        [totals.totalVolumeKg, totals.totalSets, totals.totalReps, sessionId],
      );
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }
}
