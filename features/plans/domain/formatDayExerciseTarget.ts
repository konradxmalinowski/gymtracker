/**
 * Pure formatting for a `PlanDayExercise`'s target fields into one summary
 * line (e.g. "3 x 8-12 @ RPE 8 - rest 90s"). Domain-pure (no React/RN
 * import, per ARCHITECTURE.md section 3.1 rule 1's `domain-purity` ESLint
 * block) so it can be unit-tested without any component harness, mirroring
 * `features/exercise-library/domain/formatExerciseName.ts`'s precedent.
 * Every field is optional on the underlying entity (a target is a hint, not
 * a requirement), so this returns `null` rather than an empty string when
 * there is nothing at all to show - callers render their own "no target
 * set" copy in that case instead of an empty line.
 */
export interface DayExerciseTargetFields {
  targetSets: number | null;
  targetRepMin: number | null;
  targetRepMax: number | null;
  targetRpe: number | null;
  restSeconds: number | null;
}

function formatRepRange(min: number | null, max: number | null): string | null {
  if (min === null && max === null) {
    return null;
  }
  if (min !== null && max !== null) {
    return min === max ? String(min) : `${min}-${max}`;
  }
  return String(min ?? max);
}

export function formatDayExerciseTarget(fields: DayExerciseTargetFields): string | null {
  const parts: string[] = [];

  const repRange = formatRepRange(fields.targetRepMin, fields.targetRepMax);
  if (fields.targetSets !== null && repRange !== null) {
    parts.push(`${fields.targetSets} x ${repRange}`);
  } else if (fields.targetSets !== null) {
    parts.push(`${fields.targetSets} sets`);
  } else if (repRange !== null) {
    parts.push(repRange);
  }

  if (fields.targetRpe !== null) {
    parts.push(`RPE ${fields.targetRpe}`);
  }

  if (parts.length === 0 && fields.restSeconds === null) {
    return null;
  }

  const summary = parts.join(' @ ');
  if (fields.restSeconds !== null) {
    return summary === '' ? `Rest ${fields.restSeconds}s` : `${summary} - rest ${fields.restSeconds}s`;
  }
  return summary;
}
