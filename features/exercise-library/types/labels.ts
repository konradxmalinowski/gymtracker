/**
 * Presentation-only slug -> display label lookups for the muscle/equipment/body-part
 * vocabularies. There is no repository method for listing muscles/equipment as a
 * lookup (out of scope for the repository phase) - per this phase's task brief, the
 * vocabulary is fixed and small enough to hardcode a matching presentation-layer map
 * here rather than reach into `database/seed/muscleSeed.ts`/`equipmentSeed.ts`
 * directly from presentation code (those are infrastructure/seed data, not something
 * a route or a feature screen should import - CLAUDE.md's layering rules keep
 * presentation from reaching into `database/` at all, even though no ESLint rule
 * happens to ban this specific case mechanically). Keep this list in sync with
 * `database/seed/muscleSeed.ts`/`equipmentSeed.ts` if either ever changes - both
 * vocabularies are described there as "rarely if ever change".
 */
import type { ExerciseContext, ExerciseLevel } from '@/features/exercise-library';

export const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  traps: 'Traps',
  lats: 'Lats',
  'middle back': 'Middle Back',
  'lower back': 'Lower Back',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abdominals: 'Abdominals',
  neck: 'Neck',
  quadriceps: 'Quadriceps',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  adductors: 'Adductors',
  abductors: 'Abductors',
};

export const EQUIPMENT_LABELS: Record<string, string> = {
  'body only': 'Body Only',
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  kettlebells: 'Kettlebell',
  bands: 'Resistance Band',
  'medicine ball': 'Medicine Ball',
  'exercise ball': 'Exercise Ball',
  'e-z curl bar': 'EZ Curl Bar',
  'foam roll': 'Foam Roller',
  other: 'Other',
};

/** Matches `exercise.body_part`'s vocabulary, which is the same fixed set `muscle.body_part` uses (ARCHITECTURE.md section 7.4). */
export const BODY_PART_LABELS: Record<string, string> = {
  upper: 'Upper Body',
  lower: 'Lower Body',
  core: 'Core',
  arms: 'Arms',
  back: 'Back',
  shoulders: 'Shoulders',
  legs: 'Legs',
};

export const LEVEL_LABELS: Record<ExerciseLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  expert: 'Expert',
};

export const CONTEXT_LABELS: Record<ExerciseContext, string> = {
  gym: 'Gym',
  home: 'Home',
};

function titleCase(slug: string): string {
  return slug.replace(/(^|\s)\w/g, (letter) => letter.toUpperCase());
}

/** Falls back to a title-cased version of the raw slug for any value outside the known vocabulary, rather than rendering nothing. */
export function getMuscleLabel(slug: string): string {
  return MUSCLE_LABELS[slug] ?? titleCase(slug);
}

export function getEquipmentLabel(slug: string): string {
  return EQUIPMENT_LABELS[slug] ?? titleCase(slug);
}

export function getBodyPartLabel(bodyPart: string): string {
  return BODY_PART_LABELS[bodyPart] ?? titleCase(bodyPart);
}

export function getLevelLabel(level: ExerciseLevel): string {
  return LEVEL_LABELS[level];
}

export function getContextLabel(context: ExerciseContext): string {
  return CONTEXT_LABELS[context];
}
