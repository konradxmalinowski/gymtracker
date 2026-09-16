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
    /**
     * P14: the data-transfer feature's three settings-nested routes
     * (ADR-0013 / `docs/ROADMAP.md`'s own P14 line: "export/import screens
     * in settings") - `dataExport`/`dataImport` mirror `units`/`timers`/
     * `progression`'s flat naming exactly; `dataImportPreview` is the one
     * addition beyond that three-screen precedent, since import (unlike
     * every other settings screen) is a two-step flow (pick a file, then
     * review what it would do before anything commits).
     */
    dataExport: (): Href => '/profile/settings/export',
    dataImport: (): Href => '/profile/settings/import',
    dataImportPreview: (): Href => '/profile/settings/import-preview',
    /**
     * Gravitus-inspired refresh: the plate calculator's configurable inputs
     * and the local workout-reminder schedule - both mirror `timers`/
     * `progression`'s flat naming exactly.
     */
    plates: (): Href => '/profile/settings/plates',
    reminders: (): Href => '/profile/settings/reminders',
  },

  /**
   * P8: profile-scoped routes that aren't settings (a settings toggle vs. a
   * standalone list screen read differently enough that grouping this under
   * `profileSettings` would misname it) - `profile.records` is the first
   * member, sibling in spirit to `profileSettings` rather than nested under
   * it. P9's `profile.history` follows the exact same precedent - see this
   * plan's "Routing gap this plan resolves" for why the history list lives
   * here rather than under a not-yet-built `HOME --> HIST`/`CAL --> HIST`
   * entry point (P10/P12). P12's `profile.calendar` follows the same
   * precedent again - `docs/ARCHITECTURE.md` section 10.1's route graph
   * names this route `PR --> CAL[profile/calendar]`, reached from
   * `ProfileScreen`'s own "Training calendar" row exactly like
   * `records`/`history`.
   */
  profile: {
    records: (): Href => '/profile/records',
    history: (): Href => '/profile/history',
    calendar: (): Href => '/profile/calendar',
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
    /**
     * P17: the daily-goals feature's quick "add an exact amount" entry for a
     * `numeric` goal (a `counter`/`boolean` goal's quick actions never need
     * this - they mutate in place on `DailyGoalsScreen` itself). Same "plain
     * id as a route param" shape as `restTimerSettings`/`planDayPicker` -
     * this flow's result is a single write against an already-known goal id,
     * nothing to accumulate.
     */
    goalProgressEntry: (goalId: string): Href => ({
      pathname: '/(modals)/goal-progress-entry',
      params: { goalId },
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

  /**
   * P11: the statistics feature's own stack, nested under the Stats tab
   * (`app/(tabs)/stats/_layout.tsx`) - same restructure `exercises`/`plans`
   * went through in P4/P5. `dashboard` mirrors `exercises.library`/
   * `plans.library`'s alias naming for the tab-root route.
   */
  stats: {
    dashboard: (): Href => '/stats',
    exercise: (exerciseId: string): Href => ({
      pathname: '/stats/exercise/[exerciseId]',
      params: { exerciseId },
    }),
  },

  /**
   * P13: the body-metrics feature's own root-level Stack
   * (`app/body-metrics/_layout.tsx`) - not nested under `(tabs)`, since this
   * feature isn't one of the 5 tabs; reached via `ProfileScreen`'s
   * "Body measurements" row, the same `profile.records`/`profile.history`/
   * `profile.calendar` precedent, just with its own dedicated Stack rather
   * than a single flat route, since this flow has materially more screens
   * (list, per-metric history, photo grid, photo detail, compare) than any
   * of those single-screen entry points. `list`/`photos` mirror
   * `exercises.library`/`plans.library`'s alias naming for a tab/feature
   * root; `compare` takes both photo ids as route params rather than a
   * store, the same "cheap round trip through the route itself" reasoning
   * `modals.restTimerSettings`/`modals.planDayPicker` already use (unlike
   * `modals.exercisePicker`'s unbounded-list store) - exactly two ids, known
   * up front, nothing to accumulate.
   */
  bodyMetrics: {
    list: (): Href => '/body-metrics',
    history: (metric: string): Href => ({
      pathname: '/body-metrics/[metric]',
      params: { metric },
    }),
    photos: (): Href => '/body-metrics/photos',
    photoDetail: (photoId: string): Href => ({
      pathname: '/body-metrics/photos/[photoId]',
      params: { photoId },
    }),
    compare: (photoIdA: string, photoIdB: string): Href => ({
      pathname: '/body-metrics/photos/compare',
      params: { photoIdA, photoIdB },
    }),
  },

  /**
   * The daily-goals feature's own nested Stack, now the 6th bottom tab
   * (`app/(tabs)/goals/_layout.tsx`) as of the UI/UX polish sweep - it
   * previously lived at a root-level `app/goals/_layout.tsx` outside
   * `(tabs)`, same `bodyMetrics` precedent as this comment used to describe.
   * A route group in parentheses contributes nothing to the URL, so every
   * `Href` below is unchanged by that move. Still reachable from `home`'s
   * `TodaysGoalsCard` (`list()`) as a glanceable dashboard shortcut, exactly
   * the way `home` also links into `plans`/`exercises` alongside their own
   * tabs. `manage`/`create`/`edit`/`reminders`/`reminderStats` mirror
   * `bodyMetrics.list`/`history`/`photos`/`photoDetail`'s own flat-path,
   * plain-param shape; `reminders`'s screen file lives at
   * `app/(tabs)/goals/manage/reminders/index.tsx` (not a flat
   * `reminders.tsx`) purely for on-disk consistency with
   * `reminders/[reminderId]/stats.tsx` sitting right next to it - the route
   * surface here is unaffected either way.
   */
  goals: {
    list: (): Href => '/goals',
    manage: (): Href => '/goals/manage',
    create: (): Href => '/goals/manage/create',
    edit: (goalId: string): Href => ({
      pathname: '/goals/manage/edit/[goalId]',
      params: { goalId },
    }),
    reminders: (): Href => '/goals/manage/reminders',
    reminderStats: (reminderId: string): Href => ({
      pathname: '/goals/manage/reminders/[reminderId]/stats',
      params: { reminderId },
    }),
  },
} as const;
