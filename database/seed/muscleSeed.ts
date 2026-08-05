/**
 * Fixed `muscle` lookup vocabulary - ARCHITECTURE.md section 7.4. Matches the
 * muscle set used by the Free Exercise DB (ADR-0011), which `scripts/build-catalog.ts`
 * (a parallel agent's file, not read here) maps `primaryMuscles`/`secondaryMuscles`
 * onto. `body_part` follows the grouping enum documented in the `muscle.body_part`
 * column comment: 'upper','lower','core','arms','back','shoulders','legs'.
 */
export interface MuscleSeedRow {
  slug: string;
  nameEn: string;
  namePl: string | null;
  bodyPart: 'upper' | 'lower' | 'core' | 'arms' | 'back' | 'shoulders' | 'legs';
  sortOrder: number;
}

export const MUSCLE_SEED: readonly MuscleSeedRow[] = [
  { slug: 'chest', nameEn: 'Chest', namePl: null, bodyPart: 'upper', sortOrder: 10 },
  { slug: 'shoulders', nameEn: 'Shoulders', namePl: null, bodyPart: 'shoulders', sortOrder: 20 },
  { slug: 'traps', nameEn: 'Traps', namePl: null, bodyPart: 'back', sortOrder: 30 },
  { slug: 'lats', nameEn: 'Lats', namePl: null, bodyPart: 'back', sortOrder: 40 },
  { slug: 'middle back', nameEn: 'Middle Back', namePl: null, bodyPart: 'back', sortOrder: 50 },
  { slug: 'lower back', nameEn: 'Lower Back', namePl: null, bodyPart: 'back', sortOrder: 60 },
  { slug: 'biceps', nameEn: 'Biceps', namePl: null, bodyPart: 'arms', sortOrder: 70 },
  { slug: 'triceps', nameEn: 'Triceps', namePl: null, bodyPart: 'arms', sortOrder: 80 },
  { slug: 'forearms', nameEn: 'Forearms', namePl: null, bodyPart: 'arms', sortOrder: 90 },
  { slug: 'abdominals', nameEn: 'Abdominals', namePl: null, bodyPart: 'core', sortOrder: 100 },
  { slug: 'neck', nameEn: 'Neck', namePl: null, bodyPart: 'upper', sortOrder: 110 },
  { slug: 'quadriceps', nameEn: 'Quadriceps', namePl: null, bodyPart: 'legs', sortOrder: 120 },
  { slug: 'hamstrings', nameEn: 'Hamstrings', namePl: null, bodyPart: 'legs', sortOrder: 130 },
  { slug: 'glutes', nameEn: 'Glutes', namePl: null, bodyPart: 'legs', sortOrder: 140 },
  { slug: 'calves', nameEn: 'Calves', namePl: null, bodyPart: 'legs', sortOrder: 150 },
  { slug: 'adductors', nameEn: 'Adductors', namePl: null, bodyPart: 'legs', sortOrder: 160 },
  { slug: 'abductors', nameEn: 'Abductors', namePl: null, bodyPart: 'legs', sortOrder: 170 },
];
