# P4 - Exercise library

## Problem summary

Build the complete exercise catalog experience per `docs/ROADMAP.md` P4: a library
screen with instant FTS search and a filter sheet (muscle, equipment, body part,
level, gym/home context, favorites), favorites-first ordering, a FlashList result
list; an exercise detail screen (image gallery, instructions, muscle/equipment tags,
Polish name rendering per FR-04, videos section, personal note, per-exercise rest
override); favorite toggle with haptics; custom exercise create/edit (React Hook
Form + Zod); delete guarded by `listReferencingPlans`; a complete `ExerciseRepository`
with FTS maintenance; `formatExerciseName()` in the domain layer. The Exercises tab
(currently a "not built yet" placeholder) becomes the real feature.

Two prerequisite gaps discovered while reading the P2 handoff, not visible from the
roadmap prose alone:

1. **Catalog seeding was never wired into app boot.** `database/seed/runSeed()` and
   `loadCatalogAsset()` are fully built (P2) but nothing calls them - the `exercise`
   table is empty on every install today. `loadCatalogAsset.ts`'s own doc comment
   says wiring it into `app/_layout.tsx` is "a later app-startup step... out of this
   phase's owned files" - that later phase is this one.
2. **Field-name mismatch between the catalog build script and the seeder.**
   `scripts/build-catalog.ts` (P2) emits `primaryMuscles`/`secondaryMuscles: string[]`
   per exercise in `assets/data/exercises.catalog.json`. `catalogSeeder.ts` (P2, a
   different agent's file) expects `muscles: {slug, role}[]`. Neither transforms into
   the other anywhere in the codebase - wiring `runSeed(db, loadCatalogAsset())` as-is
   would silently seed all 873 catalog exercises with zero muscles (`entry.muscles ??
   []` always evaluates to `[]`), quietly breaking the muscle filter and detail-screen
   muscle tags for every catalog exercise. Not a design decision - a mechanical
   adapter is needed in `loadCatalogAsset.ts` (or a thin wrapper it returns) mapping
   `primaryMuscles` -> `role: 'primary'`, `secondaryMuscles` -> `role: 'secondary'`.

A third gap: catalog images (`exercise.images`, e.g. `"26e9975d65f43036.webp"`) are
bundled at `assets/exercises/*.webp` (1721 files) but nothing resolves a filename
string from the database into a React Native `Image` source - Metro requires static
`require()` calls, so a runtime `require(dynamicPath)` will not bundle. This phase
needs a generated lookup module (filename -> `require(...)`), the same pattern
`scripts/build-catalog.ts` already uses for other codegen.

No new migration: `database/schema.sql` already has every table this phase needs
(`exercise`, `exercise_user_data`, `exercise_muscle`, `exercise_video`,
`exercise_fts`, `muscle`, `equipment`) from the P2 migration. This phase is pure
feature code on top of an existing schema.

## Acceptance criteria (from ROADMAP.md P4)

- Searching `lezac` finds `Wyciskanie sztangi lezac` (diacritic folding).
- Searching `bench` ranks `Bench Press` first (BM25 relevance).
- Filters compose correctly and are reflected in a result count.
- Results render under 50 ms on the benchmark (NFR-03, ADR-0003).
- A custom exercise is searchable immediately after creation.
- Deleting an exercise used by a plan explains which plan blocks it.
- Favoriting survives a restart.

## Clarifications confirmed with the user (Step 0)

- Catalog seeding is wired into the `app/_layout.tsx` boot sequence in this phase
  (every boot, after migrations, before the splash gate resolves) - not deferred to
  a lazy first-visit trigger.
- Custom exercises support primary **and** optional secondary muscles, matching the
  catalog's own `exercise_muscle.role` model (not a single-muscle simplification).
- Filter sheet categories are multi-select within a category, AND'd across
  categories (chest OR shoulders, AND barbell OR dumbbell).

## Task shape and scaling

Single application (Expo/React Native), one feature (`exercise-library`), spanning
three layers: database/infrastructure (repository + seed fix + image codegen),
application (domain + service + container/boot wiring), presentation (screens,
hooks, navigation). Layers are built in dependency order (infra -> application ->
presentation) since each layer's contract is consumed by the next. One sub-task
(image asset codegen) has no dependency on the others and runs in parallel from the
start. No multi-app parallelization applies - this is one app, one feature phase.

## Platform

Cross-platform mobile (Expo/React Native), detected from existing project structure
(`app.config.ts`, `expo-router`, `react-native` in `package.json`). Step 9b (SEO) and
the crawler/robots.txt portion of 9d (LLM accessibility) do not apply - no web
surface. Step 9e (accessibility) applies via platform-native accessibility
(screen reader labels, focus order, touch target sizing on the new screens), not a
WCAG web audit.

## Affected layers

- Database/infrastructure: `database/seed/loadCatalogAsset.ts` (bugfix),
  `features/exercise-library/repository/*`
- Application: `features/exercise-library/domain/*`,
  `features/exercise-library/services/*`, `services/container.ts`, `app/_layout.tsx`
  (boot wiring)
- Presentation: `features/exercise-library/{screens,hooks,components}/*`,
  `app/(tabs)/exercises/*` (route wrappers), `navigation/routes.ts`,
  `i18n/catalogs/en.ts`, `assets/exercises/imageMap.ts` (generated) +
  `scripts/build-exercise-image-map.ts` (generator)

## Step-by-step implementation sequence

1. **database-agent** (parallel start, batch 1a): fix `loadCatalogAsset.ts`'s
   muscle-field mapping; build `ExerciseRepository` interface +
   `SqliteExerciseRepository` (search/FTS, CRUD, favorite/note/rest-override,
   `listReferencingPlans`, `replaceCatalog`); unskip and implement the P4 exercise
   search benchmark in `__tests__/database/benchmarks.perf.test.ts`.
2. **frontend-agent, task A** (parallel start, batch 1b, independent of everything
   else): generator script for the bundled exercise image lookup map, run once,
   commit the generated module.
3. **backend-agent-sonnet** (batch 2, after step 1): `formatExerciseName()` domain
   function; `ExerciseService` (Zod validation, delete-guard messaging, custom-vs-
   catalog business rules); extend `AppContainer`
   (`exerciseRepository`/`exerciseService`); wire `runSeed()` into `app/_layout.tsx`'s
   boot sequence.
4. **frontend-agent, task B** (batch 3, after steps 1 and 3; task A's image map is
   also a dependency but runs independently and will already be done): library
   screen (search + filter sheet + FlashList), detail screen, create/edit form,
   hooks, exercises-tab stack restructure, route helpers, i18n keys.
5. Integration check (Step 5).
6. Code review + edge case check (Step 6, 6a).
7. Run and verify on a simulator/emulator or via `expo start` (Step 7).
8. Tests: full suite run, gap-fill via test-agent (Step 8).
9. Security check (Step 9, database-query surface) + accessibility check (Step 9e).
10. Docs update, including the deferred Step 2b architecture-snapshot regeneration
    (Step 10).
11. Commit, split by topic (Step 11).
12. Push + PR after explicit approval (Step 12).

## API contracts

`ExerciseRepository` (per `docs/ARCHITECTURE.md` section 8.3, verbatim):

```
search(query: ExerciseQuery): Promise<ExerciseListItem[]>
findById(id): Promise<Exercise | null>
findByCatalogSlug(slug): Promise<Exercise | null>
createCustom(input): Promise<Exercise>
updateCustom(id, patch): Promise<Exercise>
setFavorite(id, value): Promise<void>
setNote(id, note): Promise<void>
setDefaultRest(id, seconds | null): Promise<void>
listReferencingPlans(id): Promise<PlanReference[]>
replaceCatalog(entries, catalogVersion): Promise<void>
```

`ExerciseQuery = { text?, muscleSlugs?, equipmentSlugs?, bodyParts?, level?,
favoritesOnly?, context?: 'gym' | 'home', source?, limit, offset }`

Business rule (backend-agent to enforce in `ExerciseService`, not stated explicitly
in ARCHITECTURE.md but implied by `source` on `exercise` and by "delete guarded by
listReferencingPlans" only making sense for user-created rows): only
`source = 'custom'` exercises are deletable and fully editable by the user; catalog
(`source = 'catalog'`) exercises only accept favorite/note/rest-override writes
through `exercise_user_data`, never a mutation to their catalog fields.

## Error handling strategy

- Delete of an exercise referenced by a plan: `ExerciseService` calls
  `listReferencingPlans` first and throws a typed error carrying the plan names;
  the UI renders them in a blocking dialog, not a generic failure toast.
- Delete/edit of a catalog exercise's catalog fields: typed error, not a silent
  no-op.
- FTS search failure or empty catalog (e.g. seed hasn't run yet on a corrupted
  install): library screen shows the existing `EmptyState`/`ErrorState`
  components, never a blank list.
- Custom exercise form validation: Zod schema surfaces field-level errors via React
  Hook Form, consistent with the P3 onboarding form's pattern.

## Edge cases to address

System side: empty search query (skips FTS, plain filtered list per ADR-0003),
zero results, exercise catalog not yet seeded, duplicate custom exercise names
(allowed - no uniqueness constraint in schema), concurrent favorite-toggle taps,
FTS index drift if a write does not go through the repository (mitigated by *all*
exercise writes going through `SqliteExerciseRepository`, never raw SQL elsewhere).

Human side: user types a Polish name with diacritics on a hurried one-handed
keyboard (ADR-0003's whole reason to exist); user double-taps favorite rapidly;
user tries to delete a catalog exercise (must be impossible from the UI, not just
blocked server-side); user backs out of the create-custom-exercise form mid-edit
(no partial-save); user with no filters applied still gets favorites-first
ordering; screen-reader user navigating the filter sheet's multi-select chips.

## Non-functional requirements

Search latency budget: under 50 ms for ~900 rows (NFR-03), enforced by the P4
benchmark test unskipped in step 1. No other non-trivial NFRs surfaced in Step 0
for this phase.

## Feature-flag decision

Not applicable - project has no feature-flag system (confirmed in Step 2 reading of
CLAUDE.md/container.ts).

## Agent delegation plan

| Order | Agent | Files owned | Depends on |
|---|---|---|---|
| 1a (parallel) | database-agent | `database/seed/loadCatalogAsset.ts`, `features/exercise-library/repository/*`, `__tests__/features/exercise-library/repository/*`, `__tests__/database/seed/loadCatalogAsset.test.ts`, `__tests__/database/benchmarks.perf.test.ts` (unskip P4 case only) | none |
| 1b (parallel) | frontend-agent (task A) | `scripts/build-exercise-image-map.ts`, `assets/exercises/imageMap.ts` (generated) | none |
| 2 | backend-agent-sonnet | `features/exercise-library/domain/*`, `features/exercise-library/services/*`, `features/exercise-library/index.ts`, `services/container.ts`, `app/_layout.tsx`, `__tests__/features/exercise-library/{domain,services}/*`, `__tests__/services/container.test.tsx` | 1a |
| 3 | frontend-agent (task B) | `features/exercise-library/{screens,hooks,components,types}/*`, `app/(tabs)/exercises/*`, `navigation/routes.ts`, `i18n/catalogs/en.ts`, `__tests__/features/exercise-library/{screens,hooks}/*` | 1a, 1b, 2 |

No two agents ever touch the same file. `services/container.ts` and
`app/_layout.tsx` are touched only by backend-agent-sonnet (extending, not
replacing, per those files' own stated intent).
