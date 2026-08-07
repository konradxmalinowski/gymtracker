import { create } from 'zustand';

import type {
  ActiveSessionAggregate,
  SessionExercise,
  WorkoutSet,
} from '@/features/workout-logging';

/**
 * ADR-0008's "one deliberate exception": the only place in the app where a
 * Zustand store mirrors persisted data (SQLite, via `WorkoutSessionRepository`
 * through `WorkoutSessionService`) rather than owning it. The rules that keep
 * this from becoming a second source of truth (restated from the ADR, and
 * enforced by how this file and `features/workout-logging/hooks/*` are
 * written, not by anything the type system can check on its own):
 *
 * 1. Hydrated from SQLite on mount, and only on mount
 *    (`useActiveSessionHydration` in `features/workout-logging/hooks/
 *    useActiveSession.ts` is the one call site that does this - nowhere else
 *    calls `setSession` in response to a component mounting).
 * 2. Every edit updates this store synchronously *and* dispatches a
 *    repository write through `sessionService` - the mutation hooks in
 *    `features/workout-logging/hooks/{useSetMutations,useExerciseMutations}.ts`
 *    are where that pairing happens; this file only exposes the synchronous
 *    half.
 * 3. If a write fails, the store is reconciled *from the database*
 *    (`reconcileActiveSession` in `hooks/sessionSync.ts`, calling
 *    `sessionService.findInProgress()` and `setSession()` with the result) -
 *    never the other way around. This file provides `setSession` as a plain
 *    replace so that reconciliation is a single, total operation rather than
 *    a partial patch that could itself drift from the database.
 * 4. Cleared on finish, discard and unmount (`clear()` below;
 *    `useFinishDiscardWorkout` calls it after a successful `finish()`/
 *    `discard()`, and `ActiveWorkoutScreen`'s own unmount effect calls it
 *    defensively for the minimize-then-navigate-away-entirely case).
 * 5. Consumed only via selectors
 *    (`useActiveWorkoutStore((state) => state.session)`, never
 *    `useActiveWorkoutStore()` with no selector) so a change to one set's
 *    weight doesn't re-render every card in the exercise list.
 *
 * `pendingWrites` is the "dirty-write queue status" the ADR-0008 store
 * inventory table names as part of this store's contents - a plain counter
 * incremented/decremented by whichever mutation hook has an in-flight
 * repository write, so the screen can show a subtle "syncing" affordance if
 * it chooses to. Nothing in P6 currently blocks on it; it exists because the
 * ADR names it as part of this store's shape, not as a placeholder for a
 * later phase to define ADR-0004 would forbid.
 */
export interface ActiveWorkoutStoreState {
  session: ActiveSessionAggregate | null;
  isHydrated: boolean;
  /** Ephemeral UI selection - which set `QuickAdjustBar` currently targets. Not part of the persisted aggregate. */
  focusedSetId: string | null;
  pendingWrites: number;
}

interface ActiveWorkoutStoreActions {
  /** Full replace - the only way `session` changes. Used for both hydration (mount) and reconciliation (write failure). */
  setSession: (session: ActiveSessionAggregate | null) => void;
  markHydrated: () => void;
  /** Rule 4: finish, discard, unmount. */
  clear: () => void;
  setFocusedSetId: (id: string | null) => void;
  beginWrite: () => void;
  endWrite: () => void;

  /** Inserts a new `SessionExercise` or replaces an existing one by id - used both for a freshly added exercise and for restoring one from the undo toast. */
  upsertExercise: (exercise: SessionExercise) => void;
  removeExerciseLocally: (sessionExerciseId: string) => void;
  reorderExercisesLocally: (orderedIds: readonly string[]) => void;
  setSupersetGroupLocally: (sessionExerciseIds: readonly string[], group: number | null) => void;
  /** Shallow-merges `patch` onto the named exercise - today's one caller is the FR-16 exercise-note write, kept generic (mirroring `patchSet`) rather than a single-purpose `setExerciseNoteLocally` in case a later phase needs to patch another exercise-level field the same way. */
  patchExercise: (sessionExerciseId: string, patch: Partial<SessionExercise>) => void;
  /** FR-16 workout-level note - the one root-aggregate field besides `exercises` this store's mutators ever write directly. */
  setSessionNotes: (notes: string | null) => void;

  /** Inserts or replaces a set by id, located by `set.sessionExerciseId` - covers append, complete, update and drop-set creation alike. */
  upsertSet: (set: WorkoutSet) => void;
  /** Shallow-merges `patch` onto whichever set has this id, across every exercise (a set never moves exercises, so a single-exercise lookup would only save an already-cheap scan). */
  patchSet: (setId: string, patch: Partial<WorkoutSet>) => void;
  removeSetLocally: (setId: string) => void;
}

export type ActiveWorkoutStore = ActiveWorkoutStoreState & ActiveWorkoutStoreActions;

const initialState: ActiveWorkoutStoreState = {
  session: null,
  isHydrated: false,
  focusedSetId: null,
  pendingWrites: 0,
};

export const useActiveWorkoutStore = create<ActiveWorkoutStore>((set) => ({
  ...initialState,

  setSession: (session) => set({ session }),
  markHydrated: () => set({ isHydrated: true }),
  clear: () => set({ ...initialState }),
  setFocusedSetId: (focusedSetId) => set({ focusedSetId }),
  beginWrite: () => set((state) => ({ pendingWrites: state.pendingWrites + 1 })),
  endWrite: () => set((state) => ({ pendingWrites: Math.max(0, state.pendingWrites - 1) })),

  upsertExercise: (exercise) =>
    set((state) => {
      if (!state.session) {
        return state;
      }
      const exists = state.session.exercises.some((candidate) => candidate.id === exercise.id);
      const exercises = exists
        ? state.session.exercises.map((candidate) =>
            candidate.id === exercise.id ? exercise : candidate,
          )
        : [...state.session.exercises, exercise];
      return { session: { ...state.session, exercises } };
    }),

  removeExerciseLocally: (sessionExerciseId) =>
    set((state) => {
      if (!state.session) {
        return state;
      }
      return {
        session: {
          ...state.session,
          exercises: state.session.exercises.filter(
            (exercise) => exercise.id !== sessionExerciseId,
          ),
        },
      };
    }),

  reorderExercisesLocally: (orderedIds) =>
    set((state) => {
      if (!state.session) {
        return state;
      }
      const byId = new Map(state.session.exercises.map((exercise) => [exercise.id, exercise]));
      const ordered = orderedIds
        .map((id) => byId.get(id))
        .filter((exercise): exercise is SessionExercise => exercise !== undefined);
      // Defensive: anything not named in `orderedIds` (should not happen -
      // the caller always reorders the full current list) is appended rather
      // than silently dropped.
      const orderedIdSet = new Set(orderedIds);
      const missing = state.session.exercises.filter((exercise) => !orderedIdSet.has(exercise.id));
      return { session: { ...state.session, exercises: [...ordered, ...missing] } };
    }),

  setSupersetGroupLocally: (sessionExerciseIds, group) =>
    set((state) => {
      if (!state.session) {
        return state;
      }
      const idSet = new Set(sessionExerciseIds);
      return {
        session: {
          ...state.session,
          exercises: state.session.exercises.map((exercise) =>
            idSet.has(exercise.id) ? { ...exercise, supersetGroup: group } : exercise,
          ),
        },
      };
    }),

  patchExercise: (sessionExerciseId, patch) =>
    set((state) => {
      if (!state.session) {
        return state;
      }
      return {
        session: {
          ...state.session,
          exercises: state.session.exercises.map((exercise) =>
            exercise.id === sessionExerciseId ? { ...exercise, ...patch } : exercise,
          ),
        },
      };
    }),

  setSessionNotes: (notes) =>
    set((state) => {
      if (!state.session) {
        return state;
      }
      return { session: { ...state.session, notes } };
    }),

  upsertSet: (workoutSet) =>
    set((state) => {
      if (!state.session) {
        return state;
      }
      return {
        session: {
          ...state.session,
          exercises: state.session.exercises.map((exercise) => {
            if (exercise.id !== workoutSet.sessionExerciseId) {
              return exercise;
            }
            const exists = exercise.sets.some((candidate) => candidate.id === workoutSet.id);
            const sets = exists
              ? exercise.sets.map((candidate) =>
                  candidate.id === workoutSet.id ? workoutSet : candidate,
                )
              : [...exercise.sets, workoutSet];
            return { ...exercise, sets };
          }),
        },
      };
    }),

  patchSet: (setId, patch) =>
    set((state) => {
      if (!state.session) {
        return state;
      }
      return {
        session: {
          ...state.session,
          exercises: state.session.exercises.map((exercise) => {
            if (!exercise.sets.some((candidate) => candidate.id === setId)) {
              return exercise;
            }
            return {
              ...exercise,
              sets: exercise.sets.map((candidate) =>
                candidate.id === setId ? { ...candidate, ...patch } : candidate,
              ),
            };
          }),
        },
      };
    }),

  removeSetLocally: (setId) =>
    set((state) => {
      if (!state.session) {
        return state;
      }
      return {
        session: {
          ...state.session,
          exercises: state.session.exercises.map((exercise) => ({
            ...exercise,
            sets: exercise.sets.filter((candidate) => candidate.id !== setId),
          })),
        },
      };
    }),
}));
