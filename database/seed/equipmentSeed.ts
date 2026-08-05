/**
 * Fixed `equipment` lookup vocabulary - ARCHITECTURE.md section 7.4. Matches the
 * equipment set used by the Free Exercise DB (ADR-0011). `is_gym`/`is_home` back the
 * `ExerciseQuery.context: 'gym' | 'home'` filter (ARCHITECTURE.md section 8.3).
 */
export interface EquipmentSeedRow {
  slug: string;
  nameEn: string;
  namePl: string | null;
  isGym: boolean;
  isHome: boolean;
  sortOrder: number;
}

export const EQUIPMENT_SEED: readonly EquipmentSeedRow[] = [
  {
    slug: 'body only',
    nameEn: 'Body Only',
    namePl: null,
    isGym: true,
    isHome: true,
    sortOrder: 10,
  },
  { slug: 'barbell', nameEn: 'Barbell', namePl: null, isGym: true, isHome: false, sortOrder: 20 },
  { slug: 'dumbbell', nameEn: 'Dumbbell', namePl: null, isGym: true, isHome: true, sortOrder: 30 },
  { slug: 'machine', nameEn: 'Machine', namePl: null, isGym: true, isHome: false, sortOrder: 40 },
  { slug: 'cable', nameEn: 'Cable', namePl: null, isGym: true, isHome: false, sortOrder: 50 },
  {
    slug: 'kettlebells',
    nameEn: 'Kettlebell',
    namePl: null,
    isGym: true,
    isHome: true,
    sortOrder: 60,
  },
  {
    slug: 'bands',
    nameEn: 'Resistance Band',
    namePl: null,
    isGym: true,
    isHome: true,
    sortOrder: 70,
  },
  {
    slug: 'medicine ball',
    nameEn: 'Medicine Ball',
    namePl: null,
    isGym: true,
    isHome: true,
    sortOrder: 80,
  },
  {
    slug: 'exercise ball',
    nameEn: 'Exercise Ball',
    namePl: null,
    isGym: true,
    isHome: true,
    sortOrder: 90,
  },
  {
    slug: 'e-z curl bar',
    nameEn: 'EZ Curl Bar',
    namePl: null,
    isGym: true,
    isHome: false,
    sortOrder: 100,
  },
  {
    slug: 'foam roll',
    nameEn: 'Foam Roller',
    namePl: null,
    isGym: true,
    isHome: true,
    sortOrder: 110,
  },
  { slug: 'other', nameEn: 'Other', namePl: null, isGym: true, isHome: false, sortOrder: 120 },
];
