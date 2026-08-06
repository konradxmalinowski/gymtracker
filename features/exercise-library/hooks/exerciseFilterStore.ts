import { create } from 'zustand';

import type { ExerciseContext, ExerciseLevel } from '@/features/exercise-library';

/**
 * Ephemeral UI state only (CLAUDE.md's Zustand scope), scoped to this feature rather
 * than `stores/` (which holds cross-app singletons like `sheetStore`/`toastStore`) -
 * mirrors how a feature-local concern doesn't need to live at the app root.
 *
 * A plain `useState` in `ExerciseLibraryScreen` would not work here: the filter sheet
 * is rendered by the app-root `SheetHost` (`components/feedback/SheetHost.tsx`) from
 * a `ReactNode` stored in `stores/sheetStore.ts`, created once at the moment
 * `present()` is called. A chip tap inside that sheet updating a *prop* passed at
 * creation time would never be reflected back in the already-rendered sheet element -
 * the element's props are frozen at creation, only its own re-renders would pick up
 * new prop values, but nothing re-creates it. Both `ExerciseLibraryScreen` and
 * `ExerciseFilterSheetContent` instead read/write this store directly, so a filter
 * change re-renders both independently through Zustand's own subscription, with no
 * prop drilling across the sheet-host boundary. Filters intentionally persist across
 * navigating away from and back to the Exercises tab (a session-scoped convenience,
 * not reset per screen mount) - only an explicit "Clear all" resets them.
 */
export interface ExerciseFilterState {
  muscleSlugs: string[];
  equipmentSlugs: string[];
  bodyParts: string[];
  level: ExerciseLevel | null;
  context: ExerciseContext | null;
  favoritesOnly: boolean;
}

export const DEFAULT_EXERCISE_FILTERS: ExerciseFilterState = {
  muscleSlugs: [],
  equipmentSlugs: [],
  bodyParts: [],
  level: null,
  context: null,
  favoritesOnly: false,
};

interface ExerciseFilterStore {
  filters: ExerciseFilterState;
  toggleMuscle: (slug: string) => void;
  toggleEquipment: (slug: string) => void;
  toggleBodyPart: (bodyPart: string) => void;
  setLevel: (level: ExerciseLevel | null) => void;
  setContext: (context: ExerciseContext | null) => void;
  setFavoritesOnly: (value: boolean) => void;
  clear: () => void;
}

function toggleInArray(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export const useExerciseFilterStore = create<ExerciseFilterStore>((set) => ({
  filters: DEFAULT_EXERCISE_FILTERS,
  toggleMuscle: (slug) =>
    set((state) => ({
      filters: { ...state.filters, muscleSlugs: toggleInArray(state.filters.muscleSlugs, slug) },
    })),
  toggleEquipment: (slug) =>
    set((state) => ({
      filters: {
        ...state.filters,
        equipmentSlugs: toggleInArray(state.filters.equipmentSlugs, slug),
      },
    })),
  toggleBodyPart: (bodyPart) =>
    set((state) => ({
      filters: { ...state.filters, bodyParts: toggleInArray(state.filters.bodyParts, bodyPart) },
    })),
  setLevel: (level) => set((state) => ({ filters: { ...state.filters, level } })),
  setContext: (context) => set((state) => ({ filters: { ...state.filters, context } })),
  setFavoritesOnly: (favoritesOnly) =>
    set((state) => ({ filters: { ...state.filters, favoritesOnly } })),
  clear: () => set({ filters: DEFAULT_EXERCISE_FILTERS }),
}));

/** Count of non-default filter categories currently active - drives the badge on the "Filters" button and the sheet's own summary line. */
export function countActiveFilterCategories(filters: ExerciseFilterState): number {
  let count = 0;
  if (filters.muscleSlugs.length > 0) count += 1;
  if (filters.equipmentSlugs.length > 0) count += 1;
  if (filters.bodyParts.length > 0) count += 1;
  if (filters.level !== null) count += 1;
  if (filters.context !== null) count += 1;
  if (filters.favoritesOnly) count += 1;
  return count;
}
