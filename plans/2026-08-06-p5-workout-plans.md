# P5 - Workout plans

## Problem summary

Build the complete workout-plans feature per `docs/ROADMAP.md` P5: a plan list
screen with the active-plan indicator (create, rename, duplicate, delete, reorder);
a plan detail screen listing the plan's days (same operations at the day level); a
day editor with exercise rows carrying target sets, rep range, target RPE, a rest
override and a note; an exercise picker modal reusing the P4 exercise library with
multi-select; a superset grouping editor that writes `superset_group`; a
`PlanRepository` implemented as a full aggregate, including a deep `duplicatePlan`;
`setActivePlan` clearing the previously active plan in the same transaction. The
Plans tab (currently a real "not built yet" empty state) becomes the real feature.

No new migration: `database/schema.sql` already has every table this phase needs
(`plan`, `plan_day`, `plan_day_exercise`) from the P2 migration, including the
`ux_plan_single_active` partial unique index and the `superset_group`/target-range
CHECK constraints. This phase is pure feature code on top of an existing schema.

## Acceptance criteria (from ROADMAP.md P5, refined in Step 0)

- Duplicating a plan with 4 days and 24 exercises produces an independent copy with
  new ids and no shared rows.
- Reordering (plans, days, day-exercises) persists and survives a restart.
- The single-active-plan constraint is enforced by the database
  (`ux_plan_single_active`) and the UI never shows two plans as active at once.
- Deleting a plan does not delete completed sessions that referenced it; those
  sessions still show the plan name from their snapshot columns
  (`plan_name_snapshot`/`plan_day_name_snapshot`). Verified at the repository level
  by inserting a raw `workout_session` row directly through the test SQL executor
  (workout-logging/P6 doesn't exist yet to create one through the UI), deleting the
  plan, and asserting `plan_id`/`plan_day_id` go `NULL` while the snapshot columns
  survive.
- Grouping two or more exercises in a day into a superset persists
  `superset_group` and is reflected by a bracket/visual grouping in the day editor.

## Clarifications confirmed with the user (Step 0)

- Superset UX: a multi-select mode on the day's exercise list (checkbox rows) with
  an explicit "Group" action - not drag-to-merge, not a per-row picker menu. Chosen
  for keyboard/screen-reader friendliness over a gesture-only interaction.
- No "Start Workout" entry point on the plan day screen in this phase - `workout/active`
  doesn't exist until P6, and the project's no-placeholder-code rule rules out a
  disabled stub button. Added in P6.
- Build verification: no simulator/emulator/device is available in this environment
  (same as P4). `npx expo export --platform ios` is used again as the build-verification
  proxy; flagged, not silently substituted for a real run.
- Repo metadata: GitHub description and topics were unset; applied in Step 2c with
  the user's explicit approval (description: offline-only RN/Expo workout logging
  app; topics: react-native, expo, typescript, fitness, workout-tracker, sqlite,
  mobile-app, offline-first).

## Task shape and scaling

Single application (Expo/React Native), one feature (`plans`), spanning three
layers: infrastructure (repository), application (service/container wiring),
presentation (screens, hooks, components, navigation, plus a cross-feature
accessibility fix and a new shared modal route group). Layers are built in
dependency order (repository -> service -> presentation); no independent
codegen-style sub-task exists this phase, so there is no parallel-start batch (unlike
P4's image-map generator). No multi-app parallelization applies.

## Platform

Cross-platform mobile (Expo/React Router), same as P3/P4. Step 9b (SEO) and the
crawler/robots.txt portion of 9d (LLM accessibility) do not apply - no web surface.
Step 9e (accessibility) applies via platform-native accessibility (screen reader
labels, focus order, touch targets) and is elevated this phase by the mandatory
`DraggableList` accessibility-action fallback below.

## Mandatory carry-over: DraggableList accessibility gap

`CLAUDE.md`'s "Known gaps" section flags `components/gestures/DraggableList.tsx` as
gesture-only with no non-gesture reorder alternative, and names `plans` reordering
exercises within a plan day as the likely first real consumer - explicitly requiring
that consumer to add an accessibility-action-based alternative (move-up/move-down)
before shipping, mirroring `SwipeableRow`'s `accessibilityActions`/
`onAccessibilityAction` pattern. P5 has three reorder surfaces (plan list, plan days,
day exercises), all first real consumers of `DraggableList`. This is a gate, not an
optional enhancement - Step 6/9e review must confirm all three have a working
move-up/move-down alternative, not just the drag gesture.

## Affected layers

- Infrastructure: `features/plans/repository/*` (new)
- Application: `features/plans/services/*`, `features/plans/index.ts`,
  `services/container.ts` (extended, not replaced)
- Presentation: `features/plans/{screens,hooks,components,types}/*` (new),
  `app/(tabs)/plans/*` (route wrappers replacing the current empty-state stub),
  `app/(modals)/_layout.tsx` + `app/(modals)/exercise-picker.tsx` (new - first modal
  route group in the app), `features/exercise-library/screens/*` +
  `features/exercise-library/index.ts` (additive: a multi-select picker view reusing
  existing search/filter hooks, exported for `plans` to consume through the barrel -
  keeps the dependency graph correct, since `exercise-library` stays a leaf and
  `plans` depends on it, never the reverse), `components/gestures/DraggableList.tsx`
  (accessibility-action fallback), `navigation/routes.ts`, `i18n/catalogs/en.ts`.

## Step-by-step implementation sequence

1. **database-agent**: `PlanRepository` interface + `SqlitePlanRepository`
   (`listPlans`, `getPlan`, `createPlan`, `renamePlan`, `duplicatePlan`,
   `setActivePlan`, `reorderPlans`, `addDay`/`renameDay`/`duplicateDay`/`deleteDay`/
   `reorderDays`, `addExerciseToDay`/`updateDayExercise`/`removeExerciseFromDay`/
   `reorderDayExercises`, `setSupersetGroup`); repository integration tests via
   `NodeSqlExecutor`, including the raw-inserted-`workout_session` snapshot test.
2. **backend-agent-sonnet** (after 1): `PlanService` (Zod validation matching the
   schema's CHECK constraints - target sets 1-50, RPE 1-10, rep-min <= rep-max,
   superset groups requiring 2+ exercises in the same day - and the delete/duplicate/
   reorder business rules); extend `AppContainer` (`planRepository`/`planService`);
   `features/plans/index.ts` barrel.
3. **frontend-agent** (after 1 and 2): plan list screen, plan detail (days) screen,
   day editor screen (exercise rows, target fields, superset multi-select-and-group
   UX, per-exercise rest override and note), exercise picker modal (multi-select,
   reusing exercise-library's search/filter), the three `DraggableList` reorder
   integrations plus its accessibility-action fallback, `app/(tabs)/plans/*` route
   wrappers, `app/(modals)/*` scaffolding, `navigation/routes.ts` and
   `i18n/catalogs/en.ts` additions.
4. Integration check (Step 5).
5. Code review + edge case check (Step 6, 6a) - including the DraggableList
   accessibility gate above.
6. Build verification via `npx expo export --platform ios` (Step 7, no
   simulator/device available).
7. Tests: full suite run, gap-fill via test-agent (Step 8).
8. Security check (Step 9, repository/transaction surface) + accessibility check
   (Step 9e, with explicit focus on the reorder-alternative gate).
9. Docs update (Step 10), including a `CHANGELOG.md` entry under `[Unreleased]`
   (existing convention, no version bump - project hasn't tagged a release).
10. Commit, split by topic (Step 11).
11. Push + PR after explicit approval (Step 12).

## API contracts

`PlanRepository` (per `docs/ARCHITECTURE.md` section 8.3, verbatim):

```
listPlans(): Promise<PlanListItem[]>                        // with day counts
getPlan(id): Promise<PlanAggregate | null>                  // plan + days + day exercises + exercise summaries
createPlan(input): Promise<PlanAggregate>
renamePlan(id, name)
duplicatePlan(id): Promise<PlanAggregate>                   // deep copy, new ids, name + " (copy)"
setActivePlan(id): Promise<void>                            // clears the previous active in the same tx
reorderPlans(orderedIds): Promise<void>
addDay / renameDay / duplicateDay / deleteDay / reorderDays
addExerciseToDay / updateDayExercise / removeExerciseFromDay / reorderDayExercises
setSupersetGroup(dayExerciseIds, group | null): Promise<void>
```

Business rules (`PlanService` to enforce, not stated verbatim in
`docs/ARCHITECTURE.md` but implied by the schema's CHECK constraints and the
single-active partial index): `target_sets` 1-50, `target_rpe` 1-10,
`target_rep_min <= target_rep_max` when both present, mirrored in Zod so a bad value
never reaches the database as a raw constraint violation; `setSupersetGroup` requires
at least two exercise ids from the same `plan_day`; `setActivePlan` and the delete
path use a single repository transaction each, never two round trips.

## Error handling strategy

- Delete of a plan day or a day-exercise: delete-plus-undo-toast, per the
  navigation rules table (confirmation dialogs are reserved for delete-*plan*, not
  day/exercise-level deletes).
- Delete of a whole plan: confirmation dialog, per the same table.
- Superset grouping attempted with fewer than 2 selected exercises, or exercises
  spanning two days (not reachable through this UI, but guarded in the service
  regardless): typed error, surfaced as an inline message, not a generic toast.
- Reorder persistence failure (e.g. a mid-drag app kill): the repository writes
  `sort_order` inside a transaction, so a partial reorder never lands - the UI simply
  re-reads the last persisted order on next load.
- Duplicate/duplicateDay failure mid-copy: whole operation runs in one transaction,
  so a failure leaves the original plan untouched rather than a half-copied one.

## Edge cases to address

System side: duplicating a plan with zero days (produces a valid empty copy);
reordering with a single item (no-op); deleting the currently active plan (no plan
is active afterward - UI must not imply one still is); concurrent reorder drags
mid-network... n/a (fully local/offline, no network race); an exercise referenced by
a plan day being deleted from the library (already guarded by P4's
`listReferencingPlans`, re-verified here from the plans side - deleting a plan day
exercise row must not touch the underlying `exercise` row); superset group integers
colliding across unrelated days (schema scopes `superset_group` per `plan_day_exercise`
row, so no cross-day collision is possible, but service-level grouping must not
accidentally include a same-numbered group from a different day when regenerating
group ids on duplicate).

Human side: user creates a plan with an empty name (validation, not a silent
default); user duplicates a plan repeatedly (each copy needs a distinguishable name,
not three plans all literally named "X (copy)"); user tries to set two different
plans active in quick succession (must genuinely converge to one, not a UI flash of
both); user selects exercises for a superset then backs out without confirming
(no partial group is written); user reorders via the accessibility move-up/move-down
action while a screen reader is announcing the previous change (actions must not
queue confusingly); user picks the same exercise twice for one day in the picker
(no db-level uniqueness constraint on `(plan_day_id, exercise_id)` - decide in
implementation whether to allow intentional repeats, e.g. two different rep ranges
for the same lift, which is a legitimate real-world plan pattern - default to
allowing it unless the day editor already visually disambiguates poorly).

## Non-functional requirements

None non-trivial surfaced in Step 0 for this phase - plan data volumes are tiny
(unlimited plans/days/exercises, but realistically dozens of rows, not thousands),
and the feature is fully offline/local.

## Feature-flag decision

Not applicable - project has no feature-flag system (confirmed in Step 2 reading of
`CLAUDE.md`/`services/container.ts`).

## Agent delegation plan

| Order | Agent | Files owned | Depends on |
|---|---|---|---|
| 1 | database-agent | `features/plans/repository/*`, `__tests__/features/plans/repository/*` | none |
| 2 | backend-agent-sonnet | `features/plans/services/*`, `features/plans/index.ts`, `services/container.ts`, `__tests__/features/plans/services/*`, `__tests__/services/container.test.tsx` | 1 |
| 3 | frontend-agent | `features/plans/{screens,hooks,components,types}/*`, `features/exercise-library/screens/*` (additive picker view), `features/exercise-library/index.ts` (additive export), `components/gestures/DraggableList.tsx`, `app/(tabs)/plans/*`, `app/(modals)/*`, `navigation/routes.ts`, `i18n/catalogs/en.ts`, `__tests__/features/plans/{screens,hooks}/*`, `__tests__/components/gestures/DraggableList.test.tsx` | 1, 2 |

No two agents ever touch the same file. `services/container.ts` is touched only by
backend-agent-sonnet (extending, not replacing). `features/exercise-library/*` is
touched only by frontend-agent in this phase, additively (new picker view + barrel
export), never modifying P4's existing library/detail screens or the repository
built in P4.
