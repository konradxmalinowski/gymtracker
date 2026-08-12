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
    /** P8: `oneRm.formula`/`progression.upperIncrementKg`/`progression.lowerIncrementKg`. */
    progression: (): Href => '/profile/settings/progression',
  },

  /**
   * P8: profile-scoped routes that aren't settings (a settings toggle vs. a
   * standalone list screen read differently enough that grouping this under
   * `profileSettings` would misname it) - `profile.records` is the first
   * member, sibling in spirit to `profileSettings` rather than nested under
   * it.
   */
  profile: {
    records: (): Href => '/profile/records',
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
  },

  /**
   * P6: the active-workout route, a root-level `Stack` outside `(tabs)`
   * (ADR-0007) - `fullScreenModal`, gestures disabled, Android back
   * intercepted. A single entry, matching the route graph's `workout/active`
   * node; `workout/summary/[sessionId]` is P9 and deliberately absent.
   */
  workout: {
    active: (): Href => '/workout/active',
  },
} as const;
