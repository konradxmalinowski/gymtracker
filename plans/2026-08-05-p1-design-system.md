# P1 - Design system and UI primitives

## Problem summary

P0 (project foundation) is merged to `main` (PR #1, merge commit `8d89ad8`). Per
`docs/ROADMAP.md`, the next phase is P1: build the single source of truth for every
visual decision in the app (`theme/tokens.ts` in full), the reusable UI primitive
library (`components/ui`, `components/layout`, `components/feedback`,
`components/gestures`), the semantic haptics service, the i18n infrastructure, and the
`/dev/gallery` review route - so no later feature phase invents its own spacing, color,
or component.

No feature screens are built in this phase. `components/charts` is explicitly out of
scope for P1 (not listed in the roadmap's P1 scope; it lands with the statistics
feature later and is called out separately in ARCHITECTURE.md section 11.7).

## Acceptance criteria (from docs/ROADMAP.md P1)

- The `/dev/gallery` route shows every component, every variant, every state (default,
  pressed, disabled, loading, error).
- Changing one token in `theme/tokens.ts` visibly changes both class-based (NativeWind)
  and imperative (Reanimated/Skia/direct-import) consumers.
- `SwipeableRow` holds 60 fps while dragging with the JS thread artificially blocked
  (Reanimated worklets on the UI thread, no JS-thread involvement during the gesture -
  this is the phase's one hard NFR, and the pattern is already fixed by
  ARCHITECTURE.md section 11.5's motion rules, not something to redesign here).
- Every primitive has an accessibility role and label, verified by RNTL.
- `tsc --noEmit` and `eslint` clean, zero `any`, zero TODO comments.
- Every new user-facing string routed through the i18n layer (`t()`) - from this phase
  onward, per D-11.
- Every interactive element has an accessibility label and a >= 44x44 pt effective
  target (`hitSlop` tokens already defined in P0's tokens.ts scaffold).

Commit (per ROADMAP.md): `feat: add dark theme token system and reusable ui component
library`

## Task shape and scale

Single application (GymTracker), single platform (React Native/Expo, mobile only, no
web surface, no backend - offline-only app). One cohesive layer of work (the design
system) with a hard internal dependency order (tokens -> haptics/i18n -> components ->
gallery route), so this runs as one frontend-agent dispatch rather than split across
parallel agents - splitting `components/ui` across agents would risk visual/API
inconsistency across primitives that must read as one system, and P0 already proved a
single frontend-agent dispatch handles a scaffold of this size well. Steps 6-10
(review, verify, tests, security, docs) still run as their own stages after
implementation, per the standard workflow.

## Platform

React Native / Expo (iOS 15+, Android API 26+). No web surface exists for this
project, so Step 9b (SEO) and the crawler/robots.txt portion of Step 9d (LLM
accessibility) do not apply - skipped. The API/MCP-discoverability portion of Step 9d
also does not apply (no public API - offline app, no backend). Step 9e (accessibility)
does apply: WCAG-equivalent concerns (labels, roles, contrast, touch targets) are
explicitly part of this phase's own acceptance criteria and get an independent check
on top of what frontend-agent self-verifies.

## Affected layers

Frontend only: `theme/tokens.ts`, `tailwind.config.js`, `components/ui/*`,
`components/layout/*`, `components/feedback/*`, `components/gestures/*`,
`services/haptics/*`, i18n infrastructure (new: locale catalog + typed `t()`), a new
dev-only route (`app/dev/gallery.tsx` or equivalent, guarded so it never ships in a
production build). No database, no API, no auth in this phase.

## Step-by-step implementation sequence

1. `theme/tokens.ts`: expand from P0's honest subset (`background`, `textPrimary`,
   `textSecondary`, `accent`) to the full token set in ARCHITECTURE.md section 11.2-11.5
   - `color` (full surface ladder, borders, text, accent, semantic, set-type badges,
     chart hues even though charts themselves are out of scope - the tokens are
     harmless to define now and section 11.2 lists them as one block), `space`,
     `radius`, `elevation`, `font`, `motion`, `hitSlop`. `tailwind.config.js` extended
     to expose the new tokens as classes (no hex value duplicated between the two
     files - this is the property P0's jiti wiring exists to guarantee).
2. `services/haptics`: semantic wrapper per section 11.6's table
   (`setCompleted`, `personalRecord`, `adjust`, `select`, `destructive`,
   `timerFinished`), reading the haptics-enabled setting so every call is a no-op when
   disabled - implemented as a real settings read even though the settings feature
   itself doesn't exist until P15 (a typed local default is fine; do not block this
   phase on P15).
3. i18n infrastructure: typed `t()`, English catalog only (D-11), structured so a
   Polish catalog is a data-only addition later with no refactor. Library choice
   (i18next/react-i18next vs i18n-js vs expo-localization for device-locale detection)
   is frontend-agent's call under frontend-competencies - report the choice and why in
   the delegation report, the same way P0's dependency-pinning decisions were recorded.
4. `components/ui` primitives per the full inventory in ARCHITECTURE.md section 11.7
   (`Text` through `ErrorState` - 24 components), `components/layout`
   (`Screen`, `KeyboardAvoider`, `Row`, `Column`), `components/feedback`
   (`EmptyState`, `Skeleton`, `ErrorState`, `Toast`, `UndoToast`, `ConfirmDialog`,
   `BottomSheet`, plus root-level toast/sheet hosts - note `EmptyState`/`ErrorState`
   are listed in both the `ui` and `feedback` tables in the architecture doc; resolve
   the duplication by implementing each once in the more specific location
   (`components/feedback`) and re-exporting if `components/ui`'s barrel needs it,
   rather than building it twice), `components/gestures` (`SwipeableRow`,
   `DraggableList<T>`, `PressScale`).
5. `app/dev/gallery.tsx` (or the project's equivalent dev-route convention): renders
   every primitive, every variant, every state. Must not ship in a production build -
   frontend-agent decides and documents the exclusion mechanism (route guard on
   `__DEV__`/`process.env.EXPO_PUBLIC_*`, or an Expo Router route group excluded from
   the production route manifest) since ARCHITECTURE.md specifies the route's purpose
   but not its production-exclusion mechanism.
6. Every primitive gets an accessibility role/label at build time (not bolted on
   after) - RNTL verification of this is test-agent's job in Step 8, but frontend-agent
   does not ship a primitive without the props/role wired first.

## Error handling strategy

No I/O, no network, no database in this phase, so "error handling" here means UI error
*states*, not exception handling: `ErrorState`, `Toast`, `ConfirmDialog` and the
`Button`/`TextField` `error?` props are the vocabulary later phases use to render real
failures. This phase's job is to make sure that vocabulary exists and is demonstrated
in the gallery's "error" state variants - not to handle any errors of its own, since it
has none to handle.

## Edge cases considered

System side:
- Long text overflow in `Text`, `ListRow`, `Chip`, `Badge` - `numberOfLines`/truncation
  behavior must be defined, not left to default wrapping.
- `StepperField`/`NumberField` at `min`/`max` boundaries, `null` value, and rapid
  press-and-hold acceleration racing the state update.
- `SwipeableRow` and `DraggableList` under the "JS thread artificially blocked"
  condition from the acceptance criteria - this is the phase's explicit perf test, not
  optional.
- `BottomSheet`/`Toast` stacking (what happens if a second one is triggered while one
  is visible) - define one root host, one at a time, per the "root-level toast and
  sheet hosts" line in the roadmap scope.

Human side:
- Every interactive primitive keyboard/switch-control operable, not just touch (screen
  reader users, motor-impairment users) - covered by accessibility-agent in Step 9e.
- Disabled/loading states must be visually distinct enough under dark-only theming
  that a user does not mistake "disabled" for "just styled differently" - checked in
  the gallery route's state matrix.
- `ConfirmDialog` for destructive actions must not be dismissible by an accidental
  tap-through to what's behind it.

## Feature-flag decision

No feature-flag system exists in this project (none introduced in P0, none in
dependencies) - not raised.

## NFR decisions

One non-trivial NFR from the acceptance criteria: `SwipeableRow` must hold 60 fps while
dragging with the JS thread artificially blocked. Concrete pattern (already fixed by
ARCHITECTURE.md section 11.5, not re-decided here): Reanimated worklets running
entirely on the UI thread for the gesture's visual response; the row's `onTrigger`
callback (the only piece that needs the JS thread) fires once, after the gesture
resolves, never during it.

## Agent delegation plan

Sequential, single track (see Task shape above for why this isn't split across
parallel agents):

1. **frontend-agent** - implements the full step-by-step sequence above. Owns:
   `theme/tokens.ts`, `tailwind.config.js`, `components/ui/**`, `components/layout/**`,
   `components/feedback/**`, `components/gestures/**`, `services/haptics/**`, new i18n
   infra files, `app/dev/gallery.tsx` (or equivalent). Forbidden: `database/`,
   `repositories/`, `features/*` (no feature phase has started), CI/CD config,
   `package.json` scripts (may add dependencies, may not change scripts/CI).
2. **test-agent** - RNTL tests verifying every primitive's accessibility role/label
   and interactive behavior, once frontend-agent's report lands. Owns test files under
   `__tests__/` (or co-located, matching P0's existing convention -
   `__tests__/domain/Weight.test.ts` is the only precedent so far; test-agent confirms
   the convention before adding component tests).
3. **security-agent-sonnet** - dependency audit, triggered because this phase adds at
   least one new npm dependency (the i18n library).
4. **accessibility-agent** - independent WCAG-equivalent audit of the new components,
   since this phase's acceptance criteria make accessibility a first-class deliverable,
   not an afterthought.
5. **docs-agent** - updates `CLAUDE.md` (status section: P1 complete, design system
   summary, i18n library actually chosen) and `CHANGELOG.md` (new dated entry under
   `[Unreleased]`, following the exact convention P0 already established - see the
   file's own header note). `README.md` only if user-facing/setup info changed (unlikely
   for this phase, but docs-agent confirms).
6. **git-commit-agent** - one commit per ROADMAP.md's one-commit-per-phase rule
   (`feat: add dark theme token system and reusable ui component library`), same
   pattern as P0's single commit. Plan/report files ride with this commit.

Not triggered: database-agent (no schema work), backend-agent (no backend - offline
app), devsecops-agent (no CI/Docker/env/infra change in this phase's scope), seo-agent
and the crawler-facing half of llm-accessibility-agent (no web surface - see Platform
section above).
