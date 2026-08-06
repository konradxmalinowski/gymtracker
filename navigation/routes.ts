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
} as const;
