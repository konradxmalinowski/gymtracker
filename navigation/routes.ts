/**
 * navigation/routes.ts - typed route helpers (ARCHITECTURE.md section 10.2:
 * "every navigation goes through navigation/routes.ts helpers rather than
 * raw string paths"). A renamed route becomes a compile error at every call
 * site instead of a dead link discovered at runtime.
 *
 * Each helper returns a value assignable to Expo Router's typed `Href`, so
 * `router.push(routes.onboarding())` / `<Redirect href={routes.onboarding()} />`
 * both type-check against the real route table generated from `app/`.
 *
 * Only routes this phase (P3) actually introduces are listed here. Later
 * phases add their own routes to this file as they build them - this file
 * only ever grows, mirroring how `services/container.ts`'s `AppContainer`
 * is meant to be extended rather than redesigned per phase.
 */
import type { Href } from 'expo-router';

export const routes = {
  onboarding: (): Href => '/onboarding',

  tabs: {
    home: (): Href => '/',
    plans: (): Href => '/plans',
    exercises: (): Href => '/exercises',
    stats: (): Href => '/stats',
    profile: (): Href => '/profile',
  },

  profileSettings: {
    index: (): Href => '/profile/settings',
    units: (): Href => '/profile/settings/units',
    about: (): Href => '/profile/settings/about',
    /** P7: the global rest-timer defaults screen (Step 0 decision 4) - mirrors `units`/`about`'s own shape exactly. */
    timers: (): Href => '/profile/settings/timers',
    /** P8: `oneRm.formula`/`progression.upperIncrementKg`/`progression.lowerIncrementKg`. */
    progression: (): Href => '/profile/settings/progression',
  },

  /**
   * P8: profile-scoped routes that aren't settings (a settings toggle vs. a
   * standalone list screen read differently enough that grouping this under
   * `profileSettings` would misname it) - `profile.records` is the first
   * member, sibling in spirit to `profileSettings` rather than nested under
   * it. P9's `profile.history` follows the exact same precedent - see this
   * plan's "Routing gap this plan resolves" for why the history list lives
   * here rather than under a not-yet-built `HOME --> HIST`/`CAL --> HIST`
   * entry point (P10/P12).
   */
  profile: {
    records: (): Href => '/profile/records',
    history: (): Href => '/profile/history',
  },

  /**
   * P4: the exercise library's own stack, nested under the Exercises tab
   * (`app/(tabs)/exercises/_layout.tsx`). `library` is a plain alias of
   * `tabs.exercises` for call sites that read more naturally grouped with
   * its own siblings (e.g. "navigate back to the library after a delete").
   */
  exercises: {
    library: (): Href => '/exercises',
    detail: (id: string): Href => ({ pathname: '/exercises/[id]', params: { id } }),
    create: (): Href => '/exercises/create',
    edit: (id: string): Href => ({ pathname: '/exercises/edit/[id]', params: { id } }),
  },

  /**
   * P5: the plans feature's own stack, nested under the Plans tab
   * (`app/(tabs)/plans/_layout.tsx`) - same restructure `exercises` above
   * went through in P4. `library` mirrors `exercises.library`'s alias
   * naming for the tab-root route.
   */
  plans: {
    library: (): Href => '/plans',
    detail: (planId: string): Href => ({ pathname: '/plans/[planId]', params: { planId } }),
    day: (planId: string, dayId: string): Href => ({
      pathname: '/plans/[planId]/day/[dayId]',
      params: { planId, dayId },
    }),
  },

  /**
   * P5: the first `(modals)` route group in the app (ARCHITECTURE.md
   * section 9's folder tree, section 10.1's route graph) - a plain `Stack`
   * with `presentation: 'modal'`. `exercisePicker` is used today by the
   * plan-day editor's "Add exercise" action and, per the route graph, is
   * meant to be reused later by the active-workout screen's own
   * "Add exercise" action (P6) - nothing about this route is plans-specific.
   */
  modals: {
    exercisePicker: (): Href => '/(modals)/exercise-picker',
    /**
     * P7: the in-workout rest-timer settings surface (Step 0 decision 4) -
     * `sessionExerciseId` identifies whose override the sheet shows/edits,
     * the same "plain id as a route param" choice `plans.day`/`exercises.detail`
     * already make (unlike `exercisePicker`, this flow's "result" is a
     * single primitive value with an obvious, cheap round trip through the
     * route itself - no store needed the way the unbounded exercise-id list
     * required).
     */
    restTimerSettings: (sessionExerciseId: string): Href => ({
      pathname: '/(modals)/rest-timer-settings',
      params: { sessionExerciseId },
    }),
    /**
     * P10: Home's active-plan card "change day" action - picks a different
     * day than the one `nextSuggestedPlanDay` suggested. Same "plain id as a
     * route param" shape as `restTimerSettings`, not `exercisePicker`'s
     * store: the result here is a single `planDayId` picked once, not an
     * unbounded list.
     */
    planDayPicker: (planId: string): Href => ({
      pathname: '/(modals)/plan-day-picker',
      params: { planId },
    }),
  },

  /**
   * P6: the active-workout route, a root-level `Stack` outside `(tabs)`
   * (ADR-0007) - `fullScreenModal`, gestures disabled, Android back
   * intercepted. `workout.summary` is P9's addition: the celebratory,
   * one-time-per-finish view `useFinishDiscardWorkout`'s `finish()` now
   * navigates to instead of Home directly (see that hook's own doc comment)
   * - reached only from finishing a workout, per the route graph's `SUM -->
   * HOME` edge (nothing routes back into it); the persistent, revisitable
   * view of a finished session is `history.detail`, not this one.
   */
  workout: {
    active: (): Href => '/workout/active',
    summary: (sessionId: string): Href => ({
      pathname: '/workout/summary/[sessionId]',
      params: { sessionId },
    }),
  },

  /**
   * P9: the history detail route, root-level per the ARCHITECTURE.md folder
   * tree (section 9) and its own top-level `history/[sessionId].tsx` entry -
   * not nested under `workout/` (that stack is reserved for the in-progress
   * workout "mode", ADR-0007) and not nested under `profile/` (a session can
   * be reached from more than one place - the history list today, a future
   * calendar/statistics surface later - so it isn't profile-scoped the way
   * `profile.records`/`profile.history` are). Mirrors `plans.detail(planId)`'s
   * exact single-param shape.
   */
  history: {
    detail: (sessionId: string): Href => ({
      pathname: '/history/[sessionId]',
      params: { sessionId },
    }),
  },
} as const;
