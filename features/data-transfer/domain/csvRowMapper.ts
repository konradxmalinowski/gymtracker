/**
 * Maps one denormalized "set + its joins" row into the app's own CSV column
 * layout - ADR-0013's CSV format section, verbatim column order. This file
 * only shapes rows into strings; the repository layer (`SqliteDataTransferRepository`)
 * owns the actual SQL join that produces a `CsvSetRowInput`, and `csv.ts`
 * owns the RFC 4180 string encoding these rows are eventually joined into.
 *
 * Reuses the app's own existing formulas rather than reimplementing them -
 * `setVolumeKg`/`SET_TYPES` (`@/features/workout-logging`) and
 * `estimated1RM`/`OneRmFormula` (`@/features/records`) - so the CSV always
 * agrees with what the app itself shows for the same set (ADR-0013:
 * "`volume_kg` and `estimated_1rm_kg` are computed per the ADR-0006
 * semantics table, so the CSV agrees with what the app shows"). `weight_lb`
 * goes through `domain/Weight.ts`, the only place a kg<->lb conversion
 * factor may live (`gymtracker/unit-conversion-boundary` ESLint rule).
 */
import { Weight } from '@/domain/Weight';
import { setVolumeKg, type SetType } from '@/features/workout-logging';
import { estimated1RM, type OneRmFormula } from '@/features/records';

/** ADR-0013's CSV column layout, in order - the file's literal header row. */
export const CSV_HEADER_ROW: readonly string[] = [
  'date',
  'time',
  'session_id',
  'session_title',
  'plan',
  'day',
  'exercise',
  'exercise_slug',
  'exercise_id',
  'set_number',
  'set_type',
  'is_warmup',
  'weight_kg',
  'weight_lb',
  'reps',
  'rpe',
  'duration_seconds',
  'distance_m',
  'volume_kg',
  'estimated_1rm_kg',
  'is_pr',
  'set_note',
  'session_note',
];

/**
 * Everything one CSV row needs, already denormalized and joined by the
 * repository layer - a flat, settings-free DTO (mirroring every other
 * repository-to-domain handoff in this codebase: the repository never reads
 * `oneRm.formula` itself, `formula` is passed into {@link mapSetToCsvRow}
 * separately by whichever layer already resolved it from settings, the same
 * "repository stays free of settings-schema knowledge" rule
 * `SqliteWorkoutSessionRepository.startFromPlanDay`'s own doc comment
 * establishes for `globalDefaultRestSeconds`).
 */
export interface CsvSetRowInput {
  /** `workout_session.local_date`. */
  localDate: string;
  /** `workout_set.performed_at`, epoch ms - combined with `tzOffsetMinutes` to render the `time` column. */
  performedAtMs: number;
  /** `workout_session.tz_offset_minutes` - the offset in effect when the session started, not the export device's current offset. */
  tzOffsetMinutes: number;
  sessionId: string;
  sessionTitle: string;
  /** `workout_session.plan_name_snapshot`, `null` for a session with no plan. */
  planName: string | null;
  /** `workout_session.plan_day_name_snapshot`, `null` for a session with no plan day. */
  dayName: string | null;
  /** `session_exercise.exercise_name_snapshot`. */
  exerciseName: string;
  /** `exercise.catalog_slug`, `null` for a custom exercise. */
  exerciseSlug: string | null;
  exerciseId: string;
  /** `workout_set.set_index` (1-based within its `session_exercise`; a drop segment shares its parent's value, per ADR-0006). */
  setNumber: number;
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  durationSeconds: number | null;
  distanceM: number | null;
  /** Whether this exact `workout_set.id` currently holds a current personal record - a repository-layer join (`personal_record.workout_set_id = ? AND is_current = 1`), not domain logic. */
  isPr: boolean;
  setNote: string | null;
  sessionNote: string | null;
}

/** Rounds to 2 decimal places and renders without forcing trailing zeros - `Math.round`-based, no floating-point string noise from a raw `kg * lb-factor` multiplication. */
function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * `performedAtMs`/`tzOffsetMinutes` -> a `HH:MM` local-time-of-day string,
 * computed purely arithmetically rather than via `Date`'s own
 * runtime-timezone-dependent getters (which would use the exporting
 * device's *current* offset, not the offset the session actually started
 * under) - the same "epoch ms + stored offset, computed by hand" approach
 * `features/statistics/domain/localDate.ts`/`features/calendar/domain/localDate.ts`
 * already use for the equivalent date-side computation.
 */
function formatLocalTimeOfDay(performedAtMs: number, tzOffsetMinutes: number): string {
  const totalMinutes = Math.floor(performedAtMs / 60000) + tzOffsetMinutes;
  const minutesOfDay = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(minutesOfDay / 60);
  const minutes = minutesOfDay % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Shapes one `CsvSetRowInput` into a row of strings in `CSV_HEADER_ROW`'s
 * exact column order, ready for `csv.ts#encodeCsv`. `formula` is the
 * caller's already-resolved `oneRm.formula` setting (Epley by default) -
 * this function never reads settings itself.
 */
export function mapSetToCsvRow(input: CsvSetRowInput, formula: OneRmFormula): string[] {
  const volumeKg = setVolumeKg({
    setType: input.setType,
    weightKg: input.weightKg,
    reps: input.reps,
  });
  const estimated1RmKg =
    input.weightKg !== null && input.reps !== null
      ? estimated1RM(
          { weightKg: input.weightKg, reps: input.reps, setType: input.setType },
          formula,
        )
      : null;
  const weight = input.weightKg !== null ? Weight.fromKilograms(input.weightKg) : null;

  return [
    input.localDate,
    formatLocalTimeOfDay(input.performedAtMs, input.tzOffsetMinutes),
    input.sessionId,
    input.sessionTitle,
    input.planName ?? '',
    input.dayName ?? '',
    input.exerciseName,
    input.exerciseSlug ?? '',
    input.exerciseId,
    String(input.setNumber),
    input.setType,
    input.setType === 'warmup' ? '1' : '0',
    weight !== null ? formatNumber(weight.toKilograms()) : '',
    weight !== null ? formatNumber(weight.toPounds()) : '',
    input.reps !== null ? String(input.reps) : '',
    input.rpe !== null ? formatNumber(input.rpe) : '',
    input.durationSeconds !== null ? String(input.durationSeconds) : '',
    input.distanceM !== null ? formatNumber(input.distanceM) : '',
    formatNumber(volumeKg),
    estimated1RmKg !== null ? formatNumber(estimated1RmKg) : '',
    input.isPr ? '1' : '0',
    input.setNote ?? '',
    input.sessionNote ?? '',
  ];
}
