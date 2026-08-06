import { create } from 'zustand';

/**
 * Ephemeral UI flow state only (CLAUDE.md's Zustand scope) - carries a
 * single in-flight "pick some exercises" request from whichever screen
 * opened `(modals)/exercise-picker` to the picker screen itself.
 *
 * This is the mechanism for the modal-picker's data return. Expo Router
 * (like the rest of React Navigation) has no built-in "push a route and
 * await its result" primitive - a pushed screen is a sibling in the
 * navigation tree, not a called function, so there is no return value to
 * hand back through `router.push()`/`router.back()` alone. Two options
 * exist for closing that gap: encode the result as route params on the way
 * back, or hold it in a small piece of shared state both ends read/write.
 * Route params were rejected here because the "result" is a list of
 * exercise ids of unbounded length - Expo Router serializes params into the
 * URL, and a large selection would round-trip through a query string for no
 * reason. A store scoped to exactly this flow (cleared on both open and
 * close, never left holding a stale request) fits the project's own stated
 * boundary better: `stores/` already holds cross-app ephemeral flow state
 * for the same reason (`sheetStore.ts`, `toastStore.ts`) rather than
 * inventing a new persistence mechanism for one modal.
 *
 * Lives at the project root (not inside `features/plans` or
 * `features/exercise-library`) because both sides of this flow need it
 * without creating a cross-feature dependency in either direction: the
 * exercise-library picker screen reads it, the plans day editor writes it,
 * and per ARCHITECTURE.md section 9.1 `exercise-library` must stay a leaf
 * (it cannot import from `plans`) while `plans` is only allowed to depend
 * on `exercise-library` through its barrel - neither feature owning this
 * store keeps both rules intact. It is also explicitly not plans-specific:
 * the route graph (ARCHITECTURE.md section 10.1) shows the same
 * `(modals)/exercise-picker` route reused by the future active-workout
 * screen (P6), which will be a third, equally unrelated consumer.
 */
export interface ExercisePickerRequest {
  /** Exercise ids already present in the destination (e.g. already in this plan day) - the picker shows these as checked/disabled rather than omitting them, so the caller's list stays visible for context. */
  alreadySelectedIds: readonly string[];
  onConfirm: (selectedIds: string[]) => void;
}

interface ExercisePickerState {
  request: ExercisePickerRequest | null;
  open: (request: ExercisePickerRequest) => void;
  close: () => void;
}

export const useExercisePickerStore = create<ExercisePickerState>((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null }),
}));
