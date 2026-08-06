# P3 - Onboarding, profile and core settings

## Problem summary

Per `docs/ROADMAP.md`, P3 is the next roadmap phase after the completed and merged P0
(project foundation), P1 (design system) and P2 (persistence foundation). Goal: first
launch works, the user exists, units are configurable. This is the first phase that
produces a screen a user would actually interact with beyond the bootstrap Home screen.

## Scope addition beyond the roadmap's literal text (explicit deviation, user-approved)

`docs/ARCHITECTURE.md` section 10.1 specifies a 5-tab route graph (Home, Plans,
Exercises, Stats, Profile) but does not say which phase introduces the tab bar itself.
Asked the user directly: build the full 5-tab layout now, with Plans/Exercises/Stats
tabs rendering an honest "not built yet" empty state (real, finished UI - not a dead
button or TODO) until their features land in P4/P5/P11. Home moves from the current
root `app/index.tsx` into `app/(tabs)/index.tsx`; Profile becomes a real tab with this
phase's content behind it.

Also surfaced and resolved: `CLAUDE.md`'s "Known gaps" section flags no icon library
chosen yet. P3 is the first phase that needs one (5 tab icons, settings rows, avatar
picker affordance). User chose `@expo/vector-icons` over a hand-built SVG set - ships
with Expo, zero build-pipeline work. This becomes the only icon system in the app going
forward per `CLAUDE.md`'s own "pick one and use it everywhere" rule; recorded as
resolved in the docs update (Step 10).

## Process change: on-device verification deferred until after P10 (user directive, 2026-08-06)

The user explicitly changed how Step 7 (on-device verification) is sequenced across
phases: rather than building and installing a fresh dev client per phase, the app will
only be built and installed on the physical device once, after P10 (Home screen, the
MVP line - see `docs/ROADMAP.md`'s "Scope summary"), covering P3 through P10's
acceptance criteria in one batched device pass rather than one rebuild per phase.

This directly overrides `docs/ROADMAP.md`'s stated per-phase Definition of Done ("All
acceptance criteria for the phase pass on a physical device," listed as a condition of
every phase, not just the MVP line) - flagged to the user as a real conflict with that
committed document's wording, not silently reconciled. Until told otherwise, treating
this as an execution-order change (verification still happens, just batched later) not
a waiver of the requirement itself: P3-P9 close out their other gates (review, tests,
security, accessibility, docs) and commit normally, but none of them should be
considered to have actually met their on-device acceptance criteria until the batched
P10 device pass confirms it. `docs/ROADMAP.md` itself has not been edited to reflect
this - that would need its own explicit go-ahead since it's a committed process
document, not scratch state.

Practically: this phase's (and each subsequent phase's) automated gates - tsc/eslint/
jest, code review, security, accessibility, docs - fully close out and commit as normal.
Two EAS build attempts were started and canceled for P3 specifically because of this
change (the second was already in progress when the instruction arrived); no dev-client
rebuild happens again until P10.

## Pre-existing stray change carried onto this branch

Working tree had uncommitted edits to `app.config.ts` (EAS `owner`/`projectId` switched
to a different account) and `package.json`/`package-lock.json` (`expo-dev-client`
added). Confirmed with the user: both intentional. Carried onto
`feat/p3-onboarding-profile-settings` (branched off freshly-pulled `main`, which already
has P2 merged via PR #3) and will get their own `chore:` commit in Step 11, reviewed
like any other change in Step 6 despite being pre-existing.

## Task shape and scale

Single application (GymTracker, React Native/Expo), one roadmap phase, no schema
migration needed - `user_profile` and `app_setting` tables already exist in
`database/schema.sql` from P2. This is a backend-then-frontend sequential task (frontend
consumes exact repository/service/domain interfaces backend defines), not a parallel
split - contracts aren't fixed until backend-agent's dispatch completes.

## Platform

React Native/Expo (mobile), detected from `package.json` (`expo`, `expo-router`) and
confirmed in `CLAUDE.md`. No web surface exists or is planned (D-11/non-goals) - Step 9b
(SEO) and the crawler-facing part of Step 9d (LLM accessibility) do not apply and are
skipped below. Target test environment per the user: physical Android device, API 31+,
dev-client build currently installed and up to date for the *P2* native module set
(`react-native-nitro-modules`) - this phase adds a new native module
(`expo-image-picker`) not in that build, so a fresh dev-client build is required before
Step 7 verification can run (flagged under devsecops below, not a blocker to starting
implementation).

## Affected layers

Domain (`domain/Weight.ts`, `domain/Length.ts`), backend/repository
(`features/profile/repository`, `features/profile/services`,
`repositories/settings/settingsSchema.ts`, `services/container.ts`), frontend
(`app/**` navigation restructure, `features/onboarding/*`, `features/profile/*`),
tests, docs. No database migration (schema already present).

## Step-by-step implementation sequence

1. backend-agent-sonnet: domain conversion/rounding logic, `ProfileRepository` +
   `SqliteProfileRepository`, `ProfileService` (avatar write-then-commit ordering),
   `haptics.enabled` settings key, `AppContainer` wiring. Includes its own tests
   (repository integration tests via `NodeSqlExecutor`, `fast-check` property tests for
   Weight/Length round-trip stability) per the Definition of Done in `docs/ROADMAP.md`.
2. frontend-agent (sequential after 1, consumes its interfaces): new dependencies
   (`expo-image-picker`, `@expo/vector-icons`), tab bar restructure, onboarding screen,
   profile screen, settings screens (units, haptics toggle, about), hooks, RNTL tests.
3. Integration check (Step 5).
4. Code review + edge-case pass (Step 6/6a).
5. On-device verification (Step 7) - blocked on a fresh dev-client build (devsecops).
6. Test suite run / gap-fill (Step 8, test-agent).
7. Security check (Step 9, security-agent-sonnet) - new deps, avatar file handling,
   permission strings.
8. Accessibility check (Step 9e, accessibility-agent) - forms, toggles, tab bar.
9. Infrastructure check (Step 9c, devsecops-agent) - new native module needs a rebuilt
   dev client; `app.config.ts` permission-string plugin config needs to actually exist
   in the built app.
10. Docs update (Step 10, docs-agent) - also regenerates the now-stale
    `docs/architecture-snapshot.md` (P1 and P2 doc changes postdate its recorded
    commit).
11. Commit (Step 11), push + PR pending approval (Step 12).

## API contracts

No HTTP API (offline-only app). In-process contracts fixed by backend-agent before
frontend-agent starts:

```ts
// domain/Weight.ts / domain/Length.ts - full per ADR-0009
class Weight {
  static fromKilograms(kg: number): Weight;
  static fromPounds(lb: number): Weight;
  toKilograms(): number;
  toPounds(): number;
  toDisplayString(unit: 'kg' | 'lb'): string; // rounding table from ADR-0009
}
class Length {
  static fromCentimeters(cm: number): Length;
  static fromInches(inch: number): Length;
  toCentimeters(): number;
  toInches(): number;
  toDisplayString(unit: 'cm' | 'in'): string;
}

// features/profile/repository/ProfileRepository.ts
interface ProfileRepository {
  get(): Promise<Profile | null>;
  create(input: CreateProfileInput): Promise<Profile>;
  update(patch: UpdateProfilePatch): Promise<Profile>;
}

// features/profile/services/ProfileService.ts
interface ProfileService {
  getProfile(): Promise<Profile | null>;
  completeOnboarding(input: { nickname: string; avatarUri?: string }): Promise<Profile>;
  updateAvatar(avatarUri: string): Promise<Profile>; // file-then-row per ADR-0012
  updateNickname(nickname: string): Promise<Profile>;
}

// repositories/settings/settingsSchema.ts addition
'haptics.enabled': { schema: z.boolean(), default: true }
```

Exact method names/shapes are backend-agent's call within this contract intent; it
reports the final shape back for frontend-agent to consume, same as P2's pattern.

## Error handling strategy

- Onboarding: nickname is required (non-empty, trimmed, max length per a sane bound
  backend-agent sets and frontend validates with React Hook Form + Zod); avatar is
  optional and skippable. Image-picker permission denial degrades gracefully (proceed
  without an avatar, no crash, no dead end).
- Avatar file write failure (disk full, permission revoked mid-flow): do not commit the
  database row (ADR-0012 write-then-commit ordering) - surface an error, profile
  creation still succeeds without the avatar rather than blocking onboarding entirely.
- Settings writes: `SqliteSettingsRepository` already falls back to schema defaults on a
  corrupt/missing value (P2) - no new fallback logic needed, just correct consumption.
- Units screen: switching units is a pure display toggle (ADR-0009) - must never mutate
  stored data, must be reflected immediately everywhere without a restart.

## Edge cases to address

- Fresh install routes to onboarding and never shows it again (roadmap acceptance
  criterion) - profile-exists check gates the root redirect.
- Killing the app mid-onboarding resumes at onboarding (no partial profile row
  committed until nickname + optional avatar are both resolved).
- Skipping the avatar entirely works and is a first-class path, not an error state.
- Switching units immediately updates every displayed value with zero data change
  (round-trip property test covers the numeric side; a manual/RNTL check covers the
  display side).
- Denying camera-roll/photo-library permission on the device: image picker must fail
  soft, not crash, and the onboarding/profile flow must remain completable without a
  photo.
- Tab bar: Plans/Exercises/Stats tabs must render a genuine, finished "not available
  yet" state (EmptyState primitive, real copy through `t()`) - never a placeholder
  component, dead touch target, or console-only stub.
- Double-tapping "Save" on the units or profile forms must not create duplicate writes
  or race two settings updates against each other.
- Accessibility: every new interactive element (tab bar items, settings toggles, avatar
  picker button, nickname field) needs a label and >=44x44pt target per the Definition
  of Done.

## Feature-flag decision

Not applicable - project has no feature-flag system (none detected in Step 2).

## NFR decisions

No new non-trivial NFRs surfaced beyond the standing ones in
`docs/ARCHITECTURE.md` section 2.2 (already covered: NFR-02 cold start budget, now
slightly more relevant since the splash gate extends to wait on the profile query;
NFR-10 accessibility, covered by Step 9e). No caching/retry/circuit-breaker patterns
needed - everything here is local SQLite/MMKV/filesystem work with no network calls.

## Agent delegation plan

| # | Agent | Runs | Owns |
|---|-------|------|------|
| 1 | backend-agent-sonnet | sequential, first | `domain/Weight.ts`, `domain/Length.ts`, `features/profile/repository/**`, `features/profile/services/**`, `repositories/settings/settingsSchema.ts`, `services/container.ts`, their tests |
| 2 | frontend-agent | sequential, after 1 | `app/**`, `features/onboarding/{screens,hooks,components,index.ts}/**`, `features/profile/{screens,hooks,components,index.ts}/**`, `package.json`/`package-lock.json` (image-picker + vector-icons only), `app.config.ts` (permission plugin config), their tests |
| 3 | test-agent | after 1+2 integrated | full-suite run, gap-fill only - not primary test author, per Step 8 |
| 4 | security-agent-sonnet | after review passes | new deps, avatar file handling, permission strings |
| 5 | accessibility-agent | parallel with 4 | onboarding/profile/settings screens, tab bar |
| 6 | devsecops-agent | parallel with 4/5 | dev-client rebuild for the new native module, permission-string provisioning awareness |
| 7 | docs-agent | after 4/5/6 | `CLAUDE.md`, `CHANGELOG.md`, `docs/architecture-snapshot.md` regeneration, `ARCHITECTURE.md` section 7.3 known-keys list (+`haptics.enabled`) |
| 8 | git-commit-agent | last | thematic commits per Step 11 rules |

No database-agent dispatch this phase - no schema/migration change.
