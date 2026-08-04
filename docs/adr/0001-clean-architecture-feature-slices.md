# ADR-0001: Clean Architecture with feature slices, not a flat screen/service structure

- Status: accepted
- Date: 2026-08-04
- Deciders: stakeholder (product owner), architecture

## Context

The brief fixes "Clean Architecture, modular feature-based structure" and lists the
top-level folders. What it does not fix is where the layer boundaries actually fall,
what a feature owns, and how features are allowed to depend on each other. Getting that
wrong is what turns a "modular" app into a mud ball by feature six.

The forcing function specific to this product: a small set of business rules
(set volume, estimated 1RM, personal-record comparison, progression suggestion, streak
counting, unit conversion) are read by at least five different surfaces - the active
workout hints, the workout summary, the exercise detail screen, the statistics screens
and the export files. If those rules live in components or hooks they get copy-pasted
and drift. Drifted PR logic in an app with no server means the user's history is
silently wrong and there is no authority to correct it against.

## Options considered

**A. Flat structure: `screens/`, `components/`, `services/`, `db/`.**
Fastest to start. No import rules to learn. Works well up to roughly 10 screens.
Rejected: this app has ~25 screens and the shared-rules problem above. There is also no
natural home for domain logic, so it ends up in hooks, which makes it untestable
without React.

**B. Layer-first: `domain/`, `application/`, `infrastructure/`, `presentation/` as
top-level folders, features as subfolders inside each.**
Textbook Clean Architecture. Rejected because every change to one feature touches four
distant directories, and because it contradicts the brief's explicit folder list. It
also makes it impossible to see at a glance what a feature consists of.

**C. Feature-first slices with layers *inside* each feature, plus shared
infrastructure at the top level.** Each feature owns `domain/`, `services/`,
`repository/`, `hooks/`, `components/`, `screens/`, `types/` and exposes one barrel.
**Chosen.**

**D. Modular monolith with enforced package boundaries (Nx, workspaces).**
Would give hard, tool-enforced module isolation. Rejected as disproportionate: one
developer, one deployable, no independent versioning need. The ESLint rules in the
decision below buy 80% of the benefit for none of the build complexity.

## Decision

Feature-first slices (option C) with four layers realized inside each feature, and the
dependency rule enforced by lint rather than by convention:

1. `features/<name>/domain/` - pure TypeScript. May not import React, Expo, SQLite,
   or another feature. This is where the shared rules live.
2. `features/<name>/services/` - application layer. Orchestrates repositories and
   domain, owns transaction boundaries. May import other features' barrels.
3. `features/<name>/repository/` - the port interface **and** its SQLite
   implementation. The only place SQL exists for that feature.
4. `features/<name>/{screens,components,hooks}/` - presentation. Never imports a
   repository directly.

Enforcement (configured in P0, failing CI):
- `import/no-cycle: error`
- `import/no-restricted-paths` zones: `domain` may not import from `services`,
  `repository`, `hooks`, `components`, `screens`, `react`, `expo-*`;
  `components/**` (shared) may not import from `features/**`;
  cross-feature imports must resolve to `features/<name>/index.ts`.
- A custom rule forbidding `expo-sqlite` imports outside `database/**` and
  `**/repository/**`.

`app/` contains only route wrappers; screen bodies live in features. `components/`
holds domain-free primitives only.

## Consequences

Positive:
- Business rules exist once, in a layer testable with plain Jest and no React.
- A feature can be built, tested and committed independently, which is exactly what the
  stakeholder's one-feature-per-commit process needs.
- The dependency graph in ARCHITECTURE.md section 9.1 is checkable, not aspirational.

Negative, honestly:
- More files per feature and more ceremony for genuinely trivial features
  (`calendar` is essentially one query and one grid, and it still gets the full folder
  set). Accepted; the alternative is a rule about when to skip layers, which nobody
  applies consistently.
- The `domain` layer is thin for CRUD-shaped features. That is fine - an empty or
  absent `domain/` folder is allowed where there are no rules, and the lint zones do
  not require it to exist.
- Barrel files (`index.ts`) can hurt bundler tree-shaking. Metro handles this
  acceptably; if bundle analysis at P15 shows a problem, the fix is explicit deep
  imports for the offending module, documented as an exception.
