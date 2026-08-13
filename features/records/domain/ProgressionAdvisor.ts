/**
 * ADR-0015 Decision 2 - double progression.
 *
 * ```
 * given: the last completed session for this exercise, and the plan's target rep range
 *
 * if no history                        -> no suggestion; show "first time"
 * if no target rep range on the plan   -> derive one from the last session's rep count (+/- 2)
 * if every working set last time hit target_rep_max
 *                                      -> suggest weight + increment, reps = target_rep_min
 * if any working set was below target_rep_min
 *                                      -> suggest the same weight, same reps ("repeat")
 * otherwise                            -> suggest the same weight, reps = last + 1
 * ```
 *
 * A pure function: the caller (a later pass's repository/service) supplies
 * the last session's already-filtered working sets, the target rep range (or
 * `null`), the exercise's primary muscle's `body_part`, its `equipment_slug`,
 * and the two increment settings as plain numbers. This module reads no
 * settings and touches no database, per ADR-0015's "all of it is pure and
 * table-testable" consequence.
 *
 * Which sets count as "working sets" is the caller's decision to make when
 * it queries history (same "no opinion, caller decides" precedent
 * `SetVolume.totalVolumeKg`'s own doc comment already established in this
 * codebase) - in practice that means `normal`/`failure` sets, matching PR
 * eligibility, but this module does not enforce or assume it.
 */

/** One working set from the exercise's last completed session, ordered oldest to newest (matches `set_index`/`performed_at` ordering used elsewhere in this codebase). */
export interface WorkingSetPerformance {
  weightKg: number;
  reps: number;
}

export interface RepRange {
  targetRepMin: number;
  targetRepMax: number;
}

export interface ProgressionIncrements {
  /** `progression.upperIncrementKg` - default 2.5 per ADR-0015. */
  upperIncrementKg: number;
  /** `progression.lowerIncrementKg` - default 5 per ADR-0015's own prose and worked example. See this module's header note on the settings-schema mismatch. */
  lowerIncrementKg: number;
}

export interface ProgressionAdviceInput {
  /** Empty when the exercise has never been performed - triggers the `first_time` branch. */
  lastSessionWorkingSets: readonly WorkingSetPerformance[];
  /** `plan_day_exercise.target_rep_min`/`target_rep_max`, both present or both absent. `null` when the plan has no rep range set. */
  targetRepRange: RepRange | null;
  /**
   * `muscle.body_part` of the exercise's primary muscle. `database/schema.sql`
   * defines seven values (`upper`,`lower`,`core`,`arms`,`back`,`shoulders`,`legs`),
   * not the clean binary ADR-0015's prose assumes ("upper-body group" /
   * "lower-body group") - see `UPPER_BODY_PARTS`/`LOWER_BODY_PARTS` below for
   * the explicit mapping this module defines to bridge that gap. `null` when
   * the exercise has no primary muscle recorded (falls back to the upper
   * increment - see `resolveIncrementKg`).
   */
  primaryMuscleBodyPart: string | null;
  /** `exercise.equipment_slug`. Compared against `'dumbbell'` to decide whether the suggested weight snaps to the nearest 2 kg. */
  equipmentSlug: string | null;
  increments: ProgressionIncrements;
}

export type ProgressionSuggestion =
  | { kind: 'first_time' }
  | { kind: 'increase_weight'; weightKg: number; reps: number; usedRepRange: RepRange }
  | { kind: 'repeat'; weightKg: number; reps: number; usedRepRange: RepRange }
  | { kind: 'increase_reps'; weightKg: number; reps: number; usedRepRange: RepRange };

/**
 * Judgment call (documented, not silently guessed - the schema's
 * `muscle.body_part` values don't line up 1:1 with ADR-0015's binary
 * "upper-body"/"lower-body" language): `arms`, `back`, `shoulders` and `core`
 * are grouped with `upper` because the exercises that train them (curls,
 * rows, shrugs, planks/ab work) take small-increment upper-body-style loading
 * progressions, not the 5+ kg jumps a squat or deadlift can absorb. `legs` is
 * grouped with `lower` for the same reason in the opposite direction - it is
 * the schema's synonym for `lower` in the free-exercise-db-derived catalog,
 * not a distinct category.
 */
export const UPPER_BODY_PARTS = ['upper', 'arms', 'back', 'shoulders', 'core'] as const;
export const LOWER_BODY_PARTS = ['lower', 'legs'] as const;

const LOWER_BODY_PART_SET: ReadonlySet<string> = new Set(LOWER_BODY_PARTS);

/** Dumbbells come in pairs and in discrete sizes (ADR-0015); `exercise.equipment_slug` for this equipment is `'dumbbell'` per `database/schema.sql`'s `equipment` table. */
const DUMBBELL_EQUIPMENT_SLUG = 'dumbbell';
const DUMBBELL_SNAP_KG = 2;

function snapIfDumbbell(weightKg: number, equipmentSlug: string | null): number {
  if (equipmentSlug !== DUMBBELL_EQUIPMENT_SLUG) {
    return weightKg;
  }
  return Math.round(weightKg / DUMBBELL_SNAP_KG) * DUMBBELL_SNAP_KG;
}

/**
 * `primaryMuscleBodyPart === null` (exercise has no recorded primary muscle)
 * falls back to the upper-body increment - the smaller, more conservative
 * default of the two, rather than silently guessing a body part.
 */
function resolveIncrementKg(input: ProgressionAdviceInput): number {
  const isLowerBody =
    input.primaryMuscleBodyPart !== null && LOWER_BODY_PART_SET.has(input.primaryMuscleBodyPart);
  return isLowerBody ? input.increments.lowerIncrementKg : input.increments.upperIncrementKg;
}

/**
 * The "weakest set gates progression" reading of ADR-0015's pseudocode: "every
 * working set hit target_rep_max" and "any working set was below
 * target_rep_min" are both naturally expressed as comparisons against the
 * *minimum* reps performed across the session's working sets. Deriving a
 * missing rep range from "the last session's rep count" uses that same
 * anchor for consistency, rather than introducing a second, different
 * representative value.
 */
function minReps(sets: readonly WorkingSetPerformance[]): number {
  return Math.min(...sets.map((set) => set.reps));
}

/** `+/- 2` around the last session's (minimum) rep count, clamped so `targetRepMin` never drops below 1 rep. */
function deriveRepRangeFromLastSession(sets: readonly WorkingSetPerformance[]): RepRange {
  const anchor = minReps(sets);
  return {
    targetRepMin: Math.max(1, anchor - 2),
    targetRepMax: anchor + 2,
  };
}

/**
 * Suggests the next session's weight/reps for an exercise, per ADR-0015
 * Decision 2's double-progression rules. Never throws; an exercise with no
 * history returns `{ kind: 'first_time' }` rather than a fabricated
 * suggestion, matching `Estimated1RM`'s "silence is more honest" precedent.
 *
 * "Same weight" in the `repeat`/`increase_reps` branches, and the weight the
 * increment is added to in `increase_weight`, is read from the
 * chronologically last working set in `lastSessionWorkingSets` - "what I used
 * last time," the way a lifter would answer the question.
 */
export function suggestNextProgression(input: ProgressionAdviceInput): ProgressionSuggestion {
  const { lastSessionWorkingSets } = input;
  if (lastSessionWorkingSets.length === 0) {
    return { kind: 'first_time' };
  }

  const usedRepRange =
    input.targetRepRange ?? deriveRepRangeFromLastSession(lastSessionWorkingSets);
  const anchorReps = minReps(lastSessionWorkingSets);
  const lastSet = lastSessionWorkingSets[lastSessionWorkingSets.length - 1]!;

  if (anchorReps >= usedRepRange.targetRepMax) {
    const increment = resolveIncrementKg(input);
    return {
      kind: 'increase_weight',
      weightKg: snapIfDumbbell(lastSet.weightKg + increment, input.equipmentSlug),
      reps: usedRepRange.targetRepMin,
      usedRepRange,
    };
  }

  if (anchorReps < usedRepRange.targetRepMin) {
    return {
      kind: 'repeat',
      weightKg: lastSet.weightKg,
      reps: anchorReps,
      usedRepRange,
    };
  }

  return {
    kind: 'increase_reps',
    weightKg: lastSet.weightKg,
    reps: anchorReps + 1,
    usedRepRange,
  };
}
