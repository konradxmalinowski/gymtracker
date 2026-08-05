# P0 - Project foundation

## Problem summary

GymTracker is a brand-new Expo/React Native application. Nothing exists yet except
the accepted architecture package (docs/ARCHITECTURE.md, docs/ROADMAP.md,
docs/adr/). This phase (P0 in docs/ROADMAP.md) bootstraps the project itself: a
running, typed, linted, CI-verified Expo app with nothing in it. No feature code,
no screens beyond a single placeholder-free Home route.

## Acceptance criteria (from docs/ROADMAP.md P0)

- The app builds and runs on iOS and Android (Expo Go or dev client).
- CI is green on a pull request.
- A commit violating the Conventional Commits format is rejected by the Husky hook.
- An import from `features/plans` into `components/ui` fails lint (proves the
  layering rules from ARCHITECTURE.md section 3.1 are actually enforced, not just
  documented).

## Task shape and scale

Single application, single phase, sequential. Not parallelizable in any meaningful
way: project scaffold, lint/format config, git hooks, CI workflow, and EAS init all
touch the same handful of shared files (package.json, tsconfig.json, app.config.ts)
and are strictly ordered - CI/EAS wiring needs a working project to wire around.
Running two agents on this concurrently would create direct file conflicts, so this
phase is delegated sequentially to two agents instead of in parallel.

## Platform

React Native / Expo, cross-platform mobile (iOS + Android). No web surface, no
backend. Confirmed by architecture package and product brief.

## Affected layers

Tooling/scaffold only: project structure, TypeScript config, lint/format config,
git hooks, CI pipeline, EAS project registration, root app entry (`app/_layout.tsx`)
with providers and a single Home route, README.md, CLAUDE.md.

## Decisions specific to this phase (confirmed with stakeholder before starting)

- Bundle identifier: `com.konradmalinowski.gymtracker` (iOS and Android, same id).
- Package manager: npm.
- Min OS: iOS 15+, Android 8 / API 26+.
- GitHub: public repo `konradxmalinowski/gymtracker`, already created and pushed
  with the initial docs commit (fbda52d) on `main`. This phase's work happens on
  branch `chore/p0-bootstrap-project`.
- EAS: stakeholder does not have EAS CLI logged in yet locally; will run `eas login`
  when asked. EAS project init in this phase should get as far as possible
  (eas.json build profiles committed) but the actual `eas init`/project-ID
  registration step that requires an authenticated session should pause and ask the
  stakeholder to log in rather than fail silently or skip the step.
- Sentry (D-05): must be wired in this phase - `@sentry/react-native` config plugin
  installed and configured, but the reporting toggle defaults to OFF and no DSN is
  committed to the repo (read from an env var that doesn't exist yet; the app must
  run correctly with it unset). This is infrastructure only - no error boundaries or
  capture call sites beyond what the config plugin needs, since there's no feature
  code yet to instrument.

## Step-by-step implementation sequence

1. frontend-agent: `npx create-expo-app` with TypeScript template, targeting the
   current Expo SDK. Apply strict TypeScript (`strict: true`,
   `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Add path aliases
   (`@/features/*`, `@/components/*`, etc.) in both tsconfig and Babel config.
   Build out the full folder skeleton from ARCHITECTURE.md section 9 (empty
   feature directories are acceptable at this stage - no placeholder code inside
   them, just the directories that later phases will fill, since an empty
   directory is structure, not a code placeholder). Write `app.config.ts` with the
   bundle identifiers above, the `gymtracker` URL scheme, and
   `experiments.typedRoutes`. Write `app/_layout.tsx` with
   `GestureHandlerRootView`, `SafeAreaProvider`, a TanStack Query `QueryClient`
   provider, a splash-screen gate, and a single Home route with real (not
   placeholder) content - e.g. an actual "GymTracker" title screen - since there is
   no feature to show yet and the ROADMAP explicitly calls this
   "placeholder-free," it must be genuinely minimal-but-finished, not a TODO.
   Configure ESLint (flat config) and Prettier, including the import layering
   rules from ARCHITECTURE.md section 3.1: `import/no-cycle`,
   `import/no-restricted-paths` zones matching the dependency-rule layers, a
   custom rule/pattern banning `expo-sqlite` imports outside `database/` and
   `**/repository/*.ts`, and a rule banning unit-conversion constants outside
   `domain/Weight.ts` and `domain/Length.ts` (these two files do not need to exist
   yet with real content - the lint rule just needs to enforce the boundary
   correctly against a fixture/test case).

2. devsecops-agent (sequential, after step 1 produces a working package.json and
   scripts): Husky + lint-staged + commitlint wired to Conventional Commits.
   GitHub Actions workflow running `tsc --noEmit`, `eslint`, `prettier --check`,
   `jest`, `npx expo-doctor`, `npm audit --audit-level=high` on push and PR. Jest +
   `jest-expo` + React Native Testing Library + `fast-check` installed and
   configured (a trivial smoke test is acceptable to prove the runner works - not
   a placeholder for a real test, an actual passing assertion). EAS project
   init with `development`, `preview`, `production` build profiles in `eas.json`;
   if `eas init` needs an authenticated session that isn't available, stop and ask
   the stakeholder to run `eas login`, do not fabricate a project ID. Sentry config
   plugin wiring per the decision above (opt-in, default off, no committed DSN).

3. docs-agent (sequential, after steps 1-2 so it can document what was actually
   built): write `README.md` (setup instructions, scripts, how to run on iOS/
   Android) and `CLAUDE.md` (architecture summary distilled from
   docs/ARCHITECTURE.md, the layer/dependency rules, folder structure, conventions
   a future contributor or agent needs before touching this repo - this becomes
   the file every future agent reads first per the standing workflow).

## Error handling strategy

N/A at this phase - no business logic, no error states beyond standard Expo/EAS
CLI failures, which should be reported back rather than worked around silently
(e.g. a failed `eas init` due to missing auth).

## Edge cases to address

- Fresh clone with no `.env` / no Sentry DSN set must still build, run, and pass CI
  - the app must not crash or warn loudly just because Sentry is unconfigured.
- The layering ESLint rules must actually fail on a violation (verified with a
  throwaway violating import that is then reverted/removed before commit, or a
  dedicated eslint rule-tester fixture) - a rule that silently no-ops is worse than
  no rule, because the roadmap and CI will both report false confidence.
- Husky hook must actually reject a malformed commit message (verified the same
  way - a deliberate bad-format commit attempt that fails, not just configuration
  that looks right on paper).

## Feature flags

Project has no feature-flag system and none is being introduced at this phase -
not applicable.

## NFR decisions

- CI must complete in a reasonable time for a solo-developer feedback loop; no
  hard SLA set by the stakeholder. No caching optimization required yet at this
  size - revisit only if CI becomes slow enough to be annoying.
- No other non-trivial NFRs surfaced for a pure tooling/scaffold phase.

## Agent delegation plan

1. frontend-agent - owns: `app/`, `app.config.ts`, `tsconfig.json`,
   `eslint.config.js`, `.prettierrc*`, `babel.config.js`, the full empty
   `features/*`, `components/*`, `database/`, `hooks/`, `navigation/`,
   `repositories/`, `services/`, `stores/`, `theme/`, `types/`, `utils/`
   directory skeletons, `package.json` (initial scaffold + its own deps).
   Runs first.
2. devsecops-agent - owns: `.husky/`, `commitlint.config.js`,
   `.lintstagedrc*`, `.github/workflows/*`, `jest.config.js` (or the jest key in
   package.json), `eas.json`, the Sentry config-plugin entry in `app.config.ts`
   (coordinate with frontend-agent's `app.config.ts` ownership - this is the one
   file both touch, devsecops-agent edits it after frontend-agent is done, not in
   parallel), `package.json` (adds its own deps/scripts on top of step 1's
   baseline). Runs second, after step 1 reports done.
3. docs-agent - owns: `README.md`, `CLAUDE.md`. Runs third, after steps 1-2.

No parallel execution in this phase for the reasons stated under "Task shape and
scale."
