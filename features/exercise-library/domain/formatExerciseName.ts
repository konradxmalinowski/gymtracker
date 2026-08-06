/**
 * FR-04: "Optional Polish display name rendered as `English Name (Polska nazwa)`
 * when a translation exists." Pure formatter - no React/RN/Expo imports (domain
 * purity rule, ARCHITECTURE.md section 3.1 rule 1).
 */
export interface ExerciseNameParts {
  nameEn: string;
  namePl: string | null;
  /** A user-set override (`exercise_user_data.display_name_override`) wins outright over both `nameEn` and `namePl` - see the rule below. */
  displayNameOverride?: string | null;
}

/**
 * A user who overrides the display name gets exactly what they typed back -
 * never wrapped in a parenthetical, never combined with `namePl`. Otherwise:
 * `namePl` present -> `"${nameEn} (${namePl})"`; `namePl` absent -> `nameEn` alone.
 * A whitespace-only override or `namePl` is treated as absent.
 */
export function formatExerciseName(exercise: ExerciseNameParts): string {
  const override = exercise.displayNameOverride;
  if (override != null && override.trim().length > 0) {
    return override;
  }

  const namePl = exercise.namePl;
  if (namePl != null && namePl.trim().length > 0) {
    return `${exercise.nameEn} (${namePl})`;
  }

  return exercise.nameEn;
}
