/**
 * CSV import: parsing the app's own column layout into typed rows, grouping
 * those rows into per-session groups, and the exercise-resolution chain -
 * ADR-0013's CSV import section: "Rows are grouped into sessions by
 * `(date, session_id)` when `session_id` is present, or by
 * `(date, session_title)` when it is not. Exercises resolve by
 * `exercise_slug`, then `exercise_id`, then exact name, then
 * diacritic-folded name; unresolved names become custom exercises."
 */
import type { EntityId } from '@/repositories/contracts/repository';
import { CSV_HEADER_ROW } from './csvRowMapper';

/**
 * Deliberately duplicated here rather than imported from
 * `features/exercise-library/repository/SqliteExerciseRepository.ts`: that
 * function is a private, non-barrel-exported implementation detail, and
 * reaching into it would violate the cross-feature-barrel-only import rule
 * (ARCHITECTURE.md section 3.1 rule 4) even though `data-transfer` is
 * allowed to depend on every *feature*, not on another feature's private
 * files. This is the same "duplicate, don't import" call
 * `features/statistics/domain/localDate.ts` and
 * `features/calendar/domain/localDate.ts` already make for their own shared
 * calendar-math primitives, for the identical reason (a real dependency-graph
 * boundary, not a maintenance oversight) - and the same one-line
 * implementation, so import-time resolution agrees with the exercise
 * catalog's own `exercise.name_search` column, which was folded the exact
 * same way at seed/write time (`buildNameSearch` in
 * `SqliteExerciseRepository.ts` also lowercases before folding, mirrored
 * below). `ł` does not decompose under NFD, so this does not fully fold
 * every Polish diacritic in the strictest sense - that is a pre-existing,
 * intentional property of the real implementation this mirrors, not a bug
 * introduced here: "folds the same way, including the same gaps" is what
 * keeps resolution consistent with `name_search`, whereas "folds more
 * correctly than `name_search` does" would make some real exercises
 * *unresolvable* that a byte-identical fold would have matched.
 */
export function foldDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Lowercases then folds - the exact order `buildNameSearch` uses, so a folded query matches a folded `name_search` value. */
export function foldNameForMatch(value: string): string {
  return foldDiacritics(value.toLowerCase());
}

// --- parsing ----------------------------------------------------------

/** One CSV data row, already split into named fields (still raw strings - `''` means "empty cell", not `null`). Field order matches {@link CSV_HEADER_ROW}. */
export interface CsvParsedRow {
  date: string;
  time: string;
  sessionId: string;
  sessionTitle: string;
  plan: string;
  day: string;
  exercise: string;
  exerciseSlug: string;
  exerciseId: string;
  setNumber: string;
  setType: string;
  isWarmup: string;
  weightKg: string;
  weightLb: string;
  reps: string;
  rpe: string;
  durationSeconds: string;
  distanceM: string;
  volumeKg: string;
  estimated1RmKg: string;
  isPr: string;
  setNote: string;
  sessionNote: string;
}

/**
 * Parses one already-`decodeCsv`'d data row (a `string[]` in
 * {@link CSV_HEADER_ROW} column order - the caller is responsible for
 * skipping the header row itself before calling this) into a
 * {@link CsvParsedRow}. Returns `null` for a row shorter than the expected
 * column count rather than throwing - a single malformed line is a
 * per-row import warning, not a reason to fail the whole file (mirrors
 * ADR-0013's exercise-resolution fallback: "unresolved names become custom
 * exercises," not a dropped import).
 */
export function parseCsvDataRow(fields: readonly string[]): CsvParsedRow | null {
  if (fields.length < CSV_HEADER_ROW.length) {
    return null;
  }
  return {
    date: fields[0] ?? '',
    time: fields[1] ?? '',
    sessionId: fields[2] ?? '',
    sessionTitle: fields[3] ?? '',
    plan: fields[4] ?? '',
    day: fields[5] ?? '',
    exercise: fields[6] ?? '',
    exerciseSlug: fields[7] ?? '',
    exerciseId: fields[8] ?? '',
    setNumber: fields[9] ?? '',
    setType: fields[10] ?? '',
    isWarmup: fields[11] ?? '',
    weightKg: fields[12] ?? '',
    weightLb: fields[13] ?? '',
    reps: fields[14] ?? '',
    rpe: fields[15] ?? '',
    durationSeconds: fields[16] ?? '',
    distanceM: fields[17] ?? '',
    volumeKg: fields[18] ?? '',
    estimated1RmKg: fields[19] ?? '',
    isPr: fields[20] ?? '',
    setNote: fields[21] ?? '',
    sessionNote: fields[22] ?? '',
  };
}

// --- grouping -----------------------------------------------------------

/** One imported session's worth of CSV rows, grouped per ADR-0013's `(date, session_id)` / `(date, session_title)` rule. */
export interface CsvSessionGroup {
  /** Internal grouping key - not written anywhere, just what rows were grouped by. */
  groupKey: string;
  date: string;
  /** The original `session_id` when every row in the group carried one (a re-export of this app's own CSV), else `null` for a foreign/hand-edited file grouped by title instead. */
  sessionId: string | null;
  sessionTitle: string;
  planName: string | null;
  dayName: string | null;
  /** The first non-empty `session_note` seen in the group - every row in a real export of this app's own CSV carries the same value for a given session. */
  sessionNote: string | null;
  rows: readonly CsvParsedRow[];
}

interface MutableCsvSessionGroup {
  groupKey: string;
  date: string;
  sessionId: string | null;
  sessionTitle: string;
  planName: string | null;
  dayName: string | null;
  sessionNote: string | null;
  rows: CsvParsedRow[];
}

/**
 * Groups parsed rows into sessions by `(date, session_id)` when
 * `session_id` is present, else `(date, session_title)` - preserving each
 * group's first-seen order (not sorted), matching how a spreadsheet or
 * hand-edited export naturally lists rows in roughly chronological order.
 */
export function groupCsvRowsBySession(rows: readonly CsvParsedRow[]): CsvSessionGroup[] {
  const groups = new Map<string, MutableCsvSessionGroup>();
  const order: string[] = [];

  for (const row of rows) {
    const sessionId = row.sessionId.trim();
    const key =
      sessionId !== '' ? `id:${row.date}:${sessionId}` : `title:${row.date}:${row.sessionTitle}`;

    let group = groups.get(key);
    if (!group) {
      group = {
        groupKey: key,
        date: row.date,
        sessionId: sessionId !== '' ? sessionId : null,
        sessionTitle: row.sessionTitle,
        planName: row.plan.trim() !== '' ? row.plan : null,
        dayName: row.day.trim() !== '' ? row.day : null,
        sessionNote: row.sessionNote.trim() !== '' ? row.sessionNote : null,
        rows: [],
      };
      groups.set(key, group);
      order.push(key);
    }
    group.rows.push(row);
  }

  return order.map((key) => groups.get(key)!);
}

// --- exercise resolution --------------------------------------------------

/** The three fields a CSV row carries that might identify an exercise. */
export interface CsvExerciseRef {
  /** `exercise_slug` column, `''` treated as "absent". */
  slug: string;
  /** `exercise_id` column, `''` treated as "absent". */
  id: string;
  /** `exercise` column - the display-name snapshot, always present, the final fallback. */
  name: string;
}

/**
 * DB-backed lookups the resolution chain below calls, in order - supplied by
 * the repository layer (`DataTransferRepository.findExerciseIdBySlug` etc.),
 * never implemented here. Keeping this function pure of any direct SQLite
 * access is what lets it live in `domain/` at all (the `gymtracker/sqlite-boundary`
 * ESLint rule would otherwise block it).
 */
export interface ExerciseResolutionLookups {
  resolveBySlug(slug: string): Promise<EntityId | null>;
  resolveById(id: EntityId): Promise<EntityId | null>;
  resolveByExactName(name: string): Promise<EntityId | null>;
  resolveByFoldedName(foldedName: string): Promise<EntityId | null>;
}

export type ExerciseResolution =
  { kind: 'resolved'; exerciseId: EntityId } | { kind: 'unresolved'; name: string };

/**
 * ADR-0013's exercise-resolution chain: slug, then id, then exact name, then
 * diacritic-folded name. Stops at the first lookup that resolves; returns
 * `{ kind: 'unresolved', name }` when none do, which the caller (repository/
 * service layer) turns into a new custom exercise via
 * `DataTransferRepository.createExerciseFromName` per ADR-0013 ("unresolved
 * names become custom exercises").
 */
export async function resolveCsvExercise(
  ref: CsvExerciseRef,
  lookups: ExerciseResolutionLookups,
): Promise<ExerciseResolution> {
  const slug = ref.slug.trim();
  if (slug !== '') {
    const bySlug = await lookups.resolveBySlug(slug);
    if (bySlug !== null) {
      return { kind: 'resolved', exerciseId: bySlug };
    }
  }

  const id = ref.id.trim();
  if (id !== '') {
    const byId = await lookups.resolveById(id);
    if (byId !== null) {
      return { kind: 'resolved', exerciseId: byId };
    }
  }

  const name = ref.name.trim();
  if (name !== '') {
    const byExactName = await lookups.resolveByExactName(name);
    if (byExactName !== null) {
      return { kind: 'resolved', exerciseId: byExactName };
    }

    const byFoldedName = await lookups.resolveByFoldedName(foldNameForMatch(name));
    if (byFoldedName !== null) {
      return { kind: 'resolved', exerciseId: byFoldedName };
    }
  }

  return { kind: 'unresolved', name: ref.name };
}
