# GymTracker - Delivery Roadmap

Status: accepted - cleared to start at P0
Date: 2026-08-04 (accepted 2026-08-04)

All open questions were resolved by the stakeholder on 2026-08-04 and are recorded as
decisions D-01 through D-12 in `docs/ARCHITECTURE.md` section 18. **Nothing blocks any
phase.** The phase ordering below was re-checked against those decisions and is unchanged
- in particular, body measurements stay at P13 rather than being pulled forward to
support assisted-set volume (D-02).
Companion documents: `docs/ARCHITECTURE.md`, `docs/adr/`

---

## How this roadmap works

The stakeholder's process requirement is strict and this document is built around it:

> Implementation proceeds feature-by-feature, one complete and production-ready feature
> at a time, with a Git commit (Conventional Commits) after every completed feature.
> Git usage must never be skipped.

Consequences that shape the ordering below:

1. **Each phase is independently shippable.** No phase leaves a screen that renders a
   dead button, a stubbed service or a TODO. Where a screen legitimately depends on data
   a later phase produces, it renders a real empty state - which is finished
   functionality, not a placeholder.
2. **Each phase closes with exactly one commit.** The commit subject is given per phase.
   Fix-ups discovered while building a phase are folded into that phase's commit;
   fix-ups discovered later get their own `fix:` commit.
3. **Phases are ordered by dependency, not by visibility.** Two infrastructure phases
   come first because everything else sits on them, and because building the design
   system after four features means retrofitting four features.
4. **A phase is done when**: its screens work, its repository tests pass, its domain
   tests pass, `tsc --noEmit` and `eslint` are clean, and its acceptance criteria below
   are met - for P3 through P10, on-device confirmation of those criteria is deferred
   and happens later in the batched P10 pass (see Definition of Done below), not
   before each individual phase's commit.

### Definition of Done (applies to every phase)

- Automated gates - typecheck, lint, repository/domain tests, code review, and
  security/accessibility review and docs - still close out the phase, and the phase
  still commits normally, one commit per phase, exactly as before.
- On-device confirmation of the phase's acceptance criteria is deferred and batched
  for phases P3 through P10: rather than confirming on a physical device after each
  individual phase, that confirmation happens once, after P10, covering every phase
  from P3 through P10 in a single pass.
- For phases P3 through P10, "committed" means the automated gates above passed - it
  does NOT mean "confirmed working on a physical device." On-device verification for
  those phases is not waived, only deferred in timing: it is not considered done
  until the batched post-P10 pass actually confirms it.
- Repository methods introduced in the phase have integration tests, including their
  constraint violations and rollback paths.
- Domain calculators introduced in the phase have table-driven unit tests.
- Zero `any`, zero `@ts-expect-error` without an explanatory comment, zero TODO comments.
- Every new user-facing string routed through the i18n layer (from P1 onward).
- Every interactive element has an accessibility label and a >= 44x44 pt effective
  target.
- Every list that can exceed ~30 rows uses FlashList.
- The phase's commit is made before the next phase begins.

---

## Scope summary

| | Phases | Delivers |
|---|--------|----------|
| **Foundation** | P0-P2 | Project, design system, persistence. No user-facing features. |
| **MVP (v1.0)** | P3-P10 | A complete, publishable training app: plans, library, logging, timer, overload, summary, history, home. |
| **v1.1-v1.3** | P11-P14 | Statistics, calendar, body metrics, data transfer. |
| **Release** | P15-P16 | Performance hardening, polish, store submission. |
| **Post-1.0** | backlog | Sync, third-party import, plate calculator, widgets, health integrations. |

The MVP line is drawn after P10 deliberately. At that point a person can plan their
training, look up any exercise, log every session, get rest timing and progression hints,
review what they did and see their streak. That is a coherent product. Statistics,
calendar, measurements and export are all valuable, and none of them is required to train
with the app.

---

# Foundation

## P0 - Project foundation

**Goal:** a running, typed, linted, CI-verified Expo app with nothing in it.

Scope:
- `npx create-expo-app` with the TypeScript template; Expo SDK current; `strict: true`
  plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` in `tsconfig.json`.
- Path aliases (`@/features/*`, `@/components/*`, ...) in `tsconfig` and Babel.
- ESLint (flat config) + Prettier, including the layering rules from ADR-0001:
  `import/no-cycle`, `import/no-restricted-paths` zones, the `expo-sqlite`-outside-
  `database`/`repository` ban, and the ban on unit-conversion constants outside
  `domain/Weight.ts` and `domain/Length.ts`.
- Husky + lint-staged + commitlint with the Conventional Commits config.
- Jest with `jest-expo`, React Native Testing Library, `fast-check`.
- GitHub Actions: `tsc --noEmit`, `eslint`, `prettier --check`, `jest`, `expo-doctor`,
  `npm audit --audit-level=high`.
- `app.config.ts` with the bundle identifiers, the `gymtracker` URL scheme, and
  `experiments.typedRoutes`.
- EAS project init with `development`, `preview` and `production` build profiles.
- Root `_layout.tsx` with `GestureHandlerRootView`, `SafeAreaProvider`, `QueryClient`,
  the splash gate, and a single placeholder-free Home route.
- `README.md` and `CLAUDE.md` (architecture summary, layer rules, conventions).

Acceptance:
- The app builds and runs on iOS and Android.
- CI is green on a pull request.
- A commit violating the Conventional Commits format is rejected by the hook.
- An import from `features/plans` into `components/ui` fails lint.

Commit: `chore: bootstrap expo project with strict typescript, linting and ci`

---

## P1 - Design system and UI primitives

**Goal:** every visual decision made once, so no later phase invents its own spacing.

Scope:
- `theme/tokens.ts` exactly as specified in ARCHITECTURE.md section 11: colors, spacing,
  radii, elevation, typography, motion, hit slop.
- NativeWind configured with `tailwind.config.js` **importing** `theme/tokens.ts`. No
  hex value appears in two files.
- `components/ui` primitives: `Text`, `Button`, `IconButton`, `Chip`,
  `SegmentedControl`, `Card`, `Surface`, `ListRow`, `TextField`, `NumberField`,
  `StepperField`, `Switch`, `Slider`, `Checkbox`, `Avatar`, `Badge`, `StatTile`,
  `ProgressRing`, `Divider`, `Spacer`, `Section`, `SectionHeader`.
- `components/layout`: `Screen`, `KeyboardAvoider`, `Row`, `Column`.
- `components/feedback`: `EmptyState`, `Skeleton`, `ErrorState`, `Toast`, `UndoToast`,
  `ConfirmDialog`, `BottomSheet`, plus the root-level toast and sheet hosts.
- `components/gestures`: `SwipeableRow`, `DraggableList`, `PressScale` - Reanimated
  worklets, no JS-thread work during a gesture.
- `services/haptics` with the semantic map from ARCHITECTURE.md section 11.6, honoring
  the haptics setting.
- i18n infrastructure (`i18n-js` or `expo-localization` + a typed `t()`), English catalog
  only (D-11). This is not optional scaffolding to be retrofitted later: from this phase
  onward every user-facing string goes through `t()`, so adding a Polish translation file
  post-1.0 is a translation task rather than a pass over every screen. No Polish UI is
  built for v1.
- A dev-only `/dev/gallery` route rendering every primitive in every variant and state.
  This is the visual regression surface and the review artifact for this phase.

Acceptance:
- The gallery route shows every component, every variant, every state (default, pressed,
  disabled, loading, error).
- Changing one token in `theme/tokens.ts` visibly changes both class-based and
  imperative consumers.
- `SwipeableRow` holds 60 fps while dragging with the JS thread artificially blocked.
- Every primitive has an accessibility role and label, verified by RNTL.

Commit: `feat: add dark theme token system and reusable ui component library`

---

## P2 - Persistence foundation

**Goal:** the database, the repository infrastructure and the seeded catalog. No feature
screens.

Scope:
- `database/client.ts`: `openDatabase`, pragmas (`WAL`, `synchronous=FULL`,
  `foreign_keys=ON`, `busy_timeout`, `temp_store=MEMORY`), and `ExpoSqlExecutor`.
- `database/schema.sql` and `database/migrations/001_initial.ts` implementing the full
  schema from ARCHITECTURE.md section 7 - every table, index and view, in one migration.
- Migration runner over `PRAGMA user_version`, `migration_history` table, and the
  forward-version guard screen from ARCHITECTURE.md section 15.1.
- `NodeSqlExecutor` and the Jest harness that applies `schema.sql` to an in-memory
  database (ADR-0014).
- `repositories/base`: `BaseSqliteRepository` handling id generation, audit columns,
  `local_date` computation, soft-delete filtering; `repositories/mapping` codecs;
  `repositories/query` builder.
- `services/id` (UUIDv7), `services/clock`, `services/kv` (typed MMKV),
  `services/files` (`FileStorage`), `services/logging`.
- `services/container.ts` composition root and `ContainerProvider`.
- `SettingsRepository` with the typed key registry and Zod-validated defaults.
- `scripts/build-catalog.ts`: fetch and normalize Free Exercise DB, map muscles and
  equipment to slugs, downscale **all** imagery (thumbnails and gallery, ~1,600 images)
  to 512 px WebP for full bundling per D-01, emit
  `assets/data/exercises.catalog.json` plus the empty overlay files, validate the output
  against a Zod schema.
- `database/seed`: `muscle` and `equipment` lookups, and the idempotent, versioned
  `catalogSeeder` (ADR-0011).
- The dev-only database health screen (schema version, row counts, file size,
  `integrity_check`, SQLite version).
- The performance fixture generator (2,500 sessions / 75,000 sets) and the CI benchmark
  suite skeleton.

Acceptance:
- Fresh install seeds ~900 exercises with muscles, equipment, images and the FTS index in
  under 2 seconds behind the splash screen, with every image resolving from the bundle and
  no network request made at any point (D-01).
- Re-running the seeder with an unchanged `catalog.version` is a no-op.
- Re-running it with a bumped version updates catalog rows and leaves
  `exercise_user_data` untouched (asserted by a test).
- Every table, constraint, partial index and view in ARCHITECTURE.md section 7 exists and
  has a test asserting its behavior, including the three partial unique indexes.
- Repository tests run in Node in under 2 seconds.
- The benchmark suite runs in CI and reports baseline numbers.

Commit: `feat: add sqlite persistence layer with migrations, repositories and exercise catalog seed`

Risk note: this is the largest single phase and the one most tempting to split. It is
kept whole because a half-built schema is not shippable and because splitting it means
migrating a schema that no user has yet.

---

# MVP

## P3 - Onboarding, profile and core settings

**Goal:** first launch works, the user exists, units are configurable.

Scope: onboarding screen (nickname, optional avatar via image picker, copied into
`documentDirectory/avatars/` per ADR-0012); `ProfileRepository`; profile screen; settings
index; units screen (kg/lb, cm/in) writing through `SettingsRepository` and mirroring to
MMKV; the `Weight` and `Length` domain value objects with their full conversion and
rounding rules (ADR-0009); haptics toggle; about screen with version and licenses.

Acceptance: fresh install routes to onboarding and never shows it again; skipping the
avatar works; switching units immediately changes every displayed value with no data
change; conversion round-trip property tests pass; killing the app during onboarding
resumes at onboarding.

Commit: `feat: add onboarding, user profile and unit settings`

---

## P4 - Exercise library

**Goal:** the complete catalog experience. The first phase a user would call a feature.

Scope: library screen with instant FTS search (debounced 120 ms), filter sheet (muscle,
equipment, body part, level, gym/home context, favorites), favorites-first ordering,
FlashList; exercise detail screen with images gallery, instructions, muscle and equipment
tags, Polish name rendering per FR-04, videos section, personal note, per-exercise rest
override; favorite toggle with haptic; custom exercise create and edit (React Hook Form +
Zod); delete guarded by `listReferencingPlans`; `ExerciseRepository` complete with FTS
maintenance; `formatExerciseName()` in the domain layer.

The detail screen's performance sections (previous performance, personal records,
progress chart) render **real empty states** in this phase and are filled in by P8. That
is a finished state, not a stub: a user with no history genuinely has nothing to show
there, and that rendering path has to exist and be correct regardless.

Acceptance: searching `lezac` finds `Wyciskanie sztangi leżąc`; searching `bench` ranks
`Bench Press` first; filters compose correctly and are reflected in a result count;
results render under 50 ms on the benchmark; a custom exercise is searchable immediately
after creation; deleting an exercise used by a plan explains which plan blocks it;
favoriting survives a restart.

Commit: `feat: add exercise library with search, filters, favorites and custom exercises`

---

## P5 - Workout plans

**Goal:** plans, days and their exercises, fully editable.

Scope: plan list with the active-plan indicator; create, rename, duplicate, delete,
reorder (`DraggableList`); plan detail with days (same operations); day editor with
exercise rows carrying target sets, rep range, target RPE, rest override and note;
exercise picker modal reusing the P4 library with multi-select; superset grouping editor
writing `superset_group`; `PlanRepository` as a full aggregate including deep duplicate;
`setActivePlan` clearing the previous active in one transaction.

Acceptance: duplicating a plan with 4 days and 24 exercises produces an independent copy
with new ids and no shared rows; reordering persists and survives a restart; the
single-active-plan constraint is enforced by the database and the UI never shows two;
deleting a plan does not delete completed sessions that referenced it, and those sessions
still display the plan name from their snapshot.

Commit: `feat: add workout plans with days, exercises and drag-and-drop ordering`

---

## P6 - Workout logging

**Goal:** the core of the product. The phase everything else exists to support.

Scope:
- `workout/active` route per ADR-0007: full-screen, gestures disabled, Android back
  intercepted, minimize to the `ActiveWorkoutBanner`.
- Start flows: from a plan day, and empty ("Quick Start").
- `SessionExerciseCard` with `SetRow` list, add/remove/reorder exercises.
- `SetRow`: index, set-type badge and picker, weight field, reps field, optional RPE,
  complete button. Swipe left to delete with undo toast, swipe right to expand for
  inline editing (never a modal).
- `QuickAdjustBar` with display-unit increments per ADR-0009 and press-and-hold
  acceleration.
- New-set pre-fill from the previous set (FR-11).
- Drop sets via `parent_set_id`, rendered indented under their parent (ADR-0006).
- Superset grouping carried from the plan day, with the bracket rendering.
- Set-type semantics exactly per the ADR-0006 table, which is now final: six enum values,
  superset as a relation, and assisted sets excluded from volume and PR while still
  counting toward the set count (D-02). RPE only, no RIR input mode (D-09).
- Exercise notes and workout notes.
- **Crash safety per ADR-0005 in full**: session written on start, per-mutation commits,
  `active_session_state`, the MMKV flag, the resume prompt, the stale-session policy.
- Finish and discard flows; discard is one of the five confirmed actions.
- `WorkoutSessionRepository` complete; `activeWorkoutStore` with the ADR-0008 precedence
  rules; `SetVolume` and `SessionTotals` domain calculators.

Deferred to P7 and P8 by design: the rest timer bar is not yet present (completing a set
saves and vibrates but starts no timer), and the previous-performance panel shows
previous values but not the progression suggestion. Both are additive and neither leaves
a broken affordance.

Acceptance:
- **E2E flow 4 passes**: 4 sets logged, process force-killed, relaunch shows the resume
  prompt and all 4 sets with correct values. This is the phase's blocking criterion.
- A set is completable in two taps from a pre-filled row, with no keyboard.
- Starting a second workout while one is active is prevented by the database and handled
  gracefully in the UI.
- Swipe-delete plus undo restores the set with its original id.
- The SQL view and the TypeScript volume calculator agree across the generated matrix.
- 20 exercises with 5 sets each scrolls at 60 fps.

Commit: `feat: add workout logging with crash-safe session persistence and quick set entry`

---

## P7 - Rest timer

**Goal:** automatic rest timing that is correct across backgrounding, Doze and process
death.

Scope: `RestTimerBar` (sticky, tap to adjust, swipe to dismiss, `ProgressRing`);
auto-start on set completion per FR-13; superset rule from ADR-0006 (timer only after the
last exercise in a group - final per D-03); global default and per-exercise override
resolution order (exercise override, then plan day, then global); timer presets;
`expo-notifications` scheduling against the absolute deadline with the notification
cancelled if the user finishes early; sound and vibration settings; deep link
`gymtracker://workout/active` from the notification; Android notification channel with
the correct importance; `restTimerStore` ticking derived from `timer_deadline_at`, never
owning it.

Acceptance: complete a set, background the app, wait past the deadline - the notification
fires and reopening shows the timer expired, not still counting; foregrounding mid-timer
shows the correct remaining time to the second; killing the app mid-timer and relaunching
restores the correct remaining time; the timer is accurate on an Android device with
battery optimization enabled (R-04); disabling notifications in OS settings degrades to
in-app timing plus haptics without an error.

Commit: `feat: add automatic rest timer with notifications and per-exercise configuration`

---

## P8 - Progressive overload and personal records

**Goal:** the app tells the user what to do next and celebrates when they beat something.

Scope: `Estimated1RM` and `ProgressionAdvisor` domain calculators per ADR-0015;
`PersonalRecordRepository` with incremental evaluation inside the set-completion
transaction plus `rebuild()`; `PreviousPerformancePanel` (previous session's sets,
previous best, best weight, best reps) and `ProgressionHint` on the workout screen;
`PRBadge` with the celebratory haptic; the exercise detail screen's performance sections
from P4 filled in; a PR list on the profile screen; "Recalculate records" in settings;
`oneRm.formula` and progression increment settings.

Acceptance: incremental PR evaluation and a full rebuild produce identical tables across
a generated history (the equivalence test); e1RM returns null above 12 reps and shows
nothing rather than a number; suggestions follow the double-progression rules in ADR-0015
including the dumbbell snap; warm-up, drop, assisted and partial sets never set a PR;
deleting a historical session triggers a rebuild for the affected exercises and the PR
list updates.

Commit: `feat: add personal records, estimated 1rm and progressive overload suggestions`

---

## P9 - Workout summary and history

**Goal:** finishing a workout feels like an event, and past workouts are reviewable.

Scope: `workout/summary/[sessionId]` (duration, exercise count, set count, total volume,
new PRs, estimated calories labeled as an estimate and **off by default** in settings per
D-04) with a share-as-image action; history
list on the profile tab with FlashList and month grouping; `history/[sessionId]`
read-only session detail; editing a historical session (values, notes, adding or removing
sets) with the PR rebuild it implies; deleting a session with confirmation; the
`SessionTotals` denormalization on finish.

Acceptance: totals on the summary equal a fresh recomputation from `workout_set`; the
history list scrolls at 60 fps over the 2,500-session fixture; editing a past session
that held a PR correctly promotes the next-best record; a deleted session disappears from
history and from every aggregate.

Commit: `feat: add workout summary and training history with session editing`

---

## P10 - Home screen

**Goal:** assemble everything into the first screen the user sees. MVP complete.

Scope: active plan card with the next suggested day; Quick Start (last plan day, or an
empty workout); resume banner when a session is in progress (ADR-0005); last workout
summary card; training streak (`StreakCalculator`, timezone-safe per ADR-0002); latest PR
card; weekly summary (workouts, sets, volume, time); empty states for a brand-new user;
`['home','dashboard']` query composition; pull-to-refresh.

Acceptance: every card has a correct, designed empty state on a fresh install; the streak
is correct across a DST boundary (unit-tested) and across midnight; the resume banner
appears after a crash and routes into the workout; the whole dashboard loads in a single
query round trip.

Commit: `feat: add home dashboard with streak, quick start and weekly summary`

### MVP line - v1.0 release candidate

At this point the app is a complete training tool. Everything after this is
additive.

---

# Post-MVP

## P11 - Statistics and charts

Scope: `StatisticsRepository` (all methods from ARCHITECTURE.md section 8.3, returning
DTOs from SQL aggregates only); `components/charts` adapter over Victory Native XL
(ADR-0010); statistics tab with range selector (4 weeks, 3 months, 1 year, all time);
volume over time, workout frequency, duration trend, muscle-group volume breakdown,
yearly activity heatmap; per-exercise progression screen (top set, e1RM, volume metrics);
the exercise detail progress chart.

Acceptance: one year of volume aggregation completes within the benchmark bound on the
75,000-set fixture; no statistics query loads an entity; every chart has an empty state
and a loading skeleton; chart colors come from tokens.

Commit: `feat: add statistics dashboard with volume, frequency and progression charts`

## P12 - Calendar

**Status: complete** (`feat/p12-calendar`, 2026-08-19) - see `CLAUDE.md`'s Status
section for the full write-up and `docs/adr/0020-calendar-read-model.md` for the
`CalendarRepository` read-model decision.

Scope: monthly calendar with per-day intensity from volume; day cells showing which plan
day was used; tapping a day opens the session; month navigation; a compact year view.

Acceptance: `local_date` grouping is correct across timezone changes; a month with no
workouts renders cleanly; navigating twelve months is smooth.

Commit: `feat: add training calendar with monthly workout overview`

## P13 - Body measurements and progress photos

Scope: `BodyMetricRepository` and `ProgressPhotoRepository`; measurements list with the
latest value per metric (window function); per-metric history screen with a chart and
entry list; quick-entry modal; progress photo capture and import into
`documentDirectory/progress-photos/` with thumbnail generation (ADR-0012); photo grid,
single view, side-by-side compare; `verifyIntegrity()` wired into the diagnostics screen.

Acceptance: photos survive a simulated app-update container change (the ADR-0012
regression test); the grid renders thumbnails only; deleting a photo soft-deletes the row
and keeps the file until purge; a missing file renders a placeholder, never a spinner.

Explicitly **not** in scope here: bodyweight-relative volume for assisted sets. D-02
settled that assisted sets are excluded from volume and PR in v1, and this phase was
deliberately left at P13 rather than pulled forward to enable it. Because the raw
assistance value is stored, adding it post-1.0 remains a read-time display change.

Commit: `feat: add body measurements tracking with progress photos`

## P14 - Data export and import

Scope: `DataTransferService`; JSON backup export (streamed to file, not built as one
string) and import with merge and replace modes, the automatic pre-replace backup, the
import preview screen and the post-import rebuild sequence (ADR-0013); CSV export and
CSV import of the app's own layout; `migrateExport` chain; share sheet integration;
"Share progress photos" as a separate action; export/import screens in settings with the
explicit lossiness warnings.

Acceptance: E2E flow 7 passes (export, wipe, import, everything matches); importing the
same file twice creates no duplicates; a malformed file fails validation with a readable
message and zero database writes; exporting the 75,000-set fixture completes without an
out-of-memory crash; CSV opens in Excel with Polish characters intact.

Commit: `feat: add json backup and csv export with import support`

## P15 - Performance hardening and polish

Scope: run the full benchmark suite against the large fixture and fix what misses;
FlashList tuning (`estimatedItemSize`, `getItemType`, `keyExtractor` stability);
memoization audit of `SetRow` and `SessionExerciseCard`; render-count instrumentation on
the workout screen; bundle analysis and any resulting deep-import exceptions; screen
transition and micro-interaction animation pass; every empty state, error state and
loading skeleton reviewed; full VoiceOver and TalkBack pass; dynamic type check; a
long-history soak test on a low-end Android device.

Acceptance: every NFR in ARCHITECTURE.md section 2.2 is measured and met, with the
numbers recorded.

Commit: `perf: optimize large history rendering and polish interactions`

## P16 - Release engineering

Scope: app icon, adaptive icon, splash screen; store listing copy and screenshots for
both stores; privacy policy hosted and linked; App Privacy and Data Safety declarations;
EAS production profiles, credentials and code signing; version and changelog automation
(`standard-version`); the full Maestro suite against a production build; TestFlight and
Play internal testing track; the OTA policy from ARCHITECTURE.md section 15.1 documented
and enforced; the forward-version guard verified.

Acceptance: signed builds pass review prerequisites on both stores; all eight E2E flows
pass on a production build; a store build installed over a previous version migrates
cleanly with no data loss (explicitly tested).

Commit: `chore: prepare production release builds and store submission assets`

---

## P17 - Daily goals and reminders

**Goal:** user-defined daily goals and reminders, independent of workout state and the
first schema change to ship since P2's original migration.

Scope: new feature module `features/daily-goals/` (a leaf in the section 9.1
dependency graph - depends on nothing else, not even `exercise-library`, since goals
are explicitly independent of training days per the product brief); its own migration
`002_daily_goals.ts` implementing `daily_goal`, `daily_goal_entry` and
`daily_reminder` from `docs/ARCHITECTURE.md` section 7.12 - unlike every other
post-MVP phase, whose tables already existed in P2's single `001_initial.ts`
migration, this phase's schema does not exist yet and has to be migrated for real;
`DailyGoalRepository` and `DailyReminderRepository` on the same
`BaseSqliteRepository` foundation every other feature repository uses;
`DailyGoalService`/`DailyReminderService`, Zod-validated, the only door into the
repositories from presentation; `services/notifications/NotificationScheduler`,
finally implemented per ADR-0016 with `daily-goals` as its first real consumer; the
daily-view screen (`app/goals/index.tsx`) showing only today's weekday-filtered active
goals with quick complete/increment/decrement/add-progress actions requiring no
navigation into configuration; goal configuration screens
(`app/goals/manage/index.tsx`, `create.tsx`, `edit/[goalId].tsx`) covering
create/edit/delete/enable/disable/reorder across the three goal types (boolean,
counter, numeric) with per-goal weekday selection and an icon picker; a reminders
configuration screen (`app/goals/manage/reminders.tsx`) for both per-goal and
standalone reminders, scheduled or interval, with their own weekday configuration; a
quick numeric/counter progress-entry modal (`app/(modals)/goal-progress-entry.tsx`),
mirroring the existing `body-metric-entry.tsx` pattern; a `TodaysGoalsCard` on Home
opening the daily view as the feature's only navigation entry point (no sixth tab, per
`docs/ARCHITECTURE.md` section 10.2); the weekday-bitmask, derived-completion, and
today-only-interval-reminder scheduling strategy from ADR-0017; interactive
"Zrealizowane"/"Nie" action buttons on every reminder notification (both
`reminder_type` values, goal-linked and standalone alike), backed by the new
`daily_reminder_response` table (`docs/ARCHITECTURE.md` section 7.12) - a goal-linked
reminder's "Zrealizowane" action writes the same `daily_goal_entry` row the Daily View
would (full `target_value` for counter/numeric goals, since a notification button
cannot collect a partial amount), "Nie" only logs the response; and a per-reminder
statistics screen (`app/goals/manage/reminders/[reminderId]/stats.tsx`, matching the
`app/goals/manage/reminders.tsx` naming already proposed above - not a direct precedent
match, see "Open decisions") showing done/not-done/ignored counts over a date range.

Acceptance: a goal configured for Tuesday/Thursday/Saturday/Sunday does not appear on
the daily view on any other day; completing a boolean goal, incrementing a counter
goal, and adding progress to a numeric goal all update the same day's
`daily_goal_entry` row without creating a duplicate (the `(goal_id, local_date)`
unique index enforces this); a new calendar day never overwrites a previous day's
entry - yesterday's progress is still queryable after midnight; disabling a goal
removes it from the daily view immediately but keeps its history intact; deleting a
goal degrades any reminder pointing at it to standalone rather than deleting the
reminder; a scheduled reminder fires at its configured time on an active weekday and
not on an inactive one; an interval reminder re-arms correctly across an app
foreground and a full process restart, scheduling only the remaining occurrences for
the current day and never a long-lived repeating trigger (ADR-0017); tapping
"Zrealizowane" on a goal-linked reminder's notification updates the same day's
`daily_goal_entry` the Daily View would show (full `target_value` for counter/numeric
goals), without opening the app; tapping "Nie" does not write a `daily_goal_entry` row;
a standalone reminder's actions only ever affect its own response log; a second tap
on the same reminder/day overwrites the previous response rather than accumulating a
history; and a reminder's stats view reflects done/not-done/ignored counts correctly
for a generated history; repository tests cover every constraint in section 7.12,
including the `goal_type`/`target_value` CHECK, the `reminder_type` scheduled/interval
CHECK, and the `daily_reminder_response.response` CHECK.

Commit: `feat: add daily goals and reminders with configurable schedules and local notifications`

Open decisions (require sign-off before or during implementation, not resolved by this
documentation pass):
- The curated Ionicons subset available for `daily_goal.icon`/`daily_reminder.icon` -
  not chosen; deferred to P17's own implementation-time Step 0.
- The quick-adjust increment granularity for counter/numeric goals - a fixed "+1" step,
  or a per-goal-configurable one. The schema does not block either choice; deferred to
  P17's own implementation-time UI planning.
- The exact route file naming within `app/goals/**` beyond what is proposed in
  `docs/ARCHITECTURE.md` sections 9 and 10.1 is a best-effort match to the
  `exercises/` (`create.tsx`, `edit/[id].tsx`) precedent, not a direct match to any
  single existing feature - flagged for review rather than treated as final. The
  per-reminder stats route proposed above (`app/goals/manage/reminders/[reminderId]/
  stats.tsx`) is the same kind of best-effort match, not a direct precedent either.
- Background/killed-app reliability of notification action responses. Expo
  Notifications' response listener (`addNotificationResponseReceivedListener`/
  `getLastNotificationResponseAsync`, the same mechanism P7's rest-timer already uses
  for its simple notification-tap deep link) is confirmed to fire when the user's tap
  brings the app to the foreground, but whether an action-button tap can be processed
  reliably when the app is fully killed (not just backgrounded) - without the user
  ever seeing the UI open - varies by platform and Expo's managed-workflow
  capabilities. Per this project's own conventions for unverifiable-without-a-device
  claims (see `CLAUDE.md`'s "Known gaps" section), this is not something to assert
  works from documentation alone - it needs on-device verification at P17's own
  implementation time, in the same spirit as ADR-0017's "never rely on a long-lived
  background primitive" caution. If killed-app delivery turns out unreliable, the
  fallback is that the action still works whenever the app is foregrounded or
  backgrounded (not killed), and the notification body itself remains tappable to
  open the app normally regardless.

---

## Prioritized backlog (post-1.0)

**Should have**

| Item | Why | Rough effort |
|------|-----|--------------|
| Plate calculator (D-10) | The most requested feature in every competing app; needs bar weight and available plates in settings | S |
| Third-party CSV import (Strong, Hevy, FitNotes) (D-07) | The main switching cost for a user coming from a competitor; `CsvDialect` per source over the existing pipeline | M |
| Workout templates independent of plans | "Do this one-off session" without polluting the plan structure | S |
| Warm-up set generator | Auto-generate warm-up sets from the working weight | S |
| Full Polish UI localization (D-11) | Infrastructure lands in P1; this is the translation catalog plus a language setting | S |
| Biometric app lock (D-08) | Progress photos and bodyweight are personal | S |
| Rest-day and deload awareness in the streak | The current streak punishes programmed rest | S |
| Migrate rest-timer's notification wrapper onto the shared `NotificationScheduler` (ADR-0016) | Two independent local-notification code paths (rest-timer's own P7 wrapper vs. daily-goals' P17 shared service) is an accepted, tracked inconsistency, not a permanent one | S |

**Could have**

| Item | Why |
|------|-----|
| Apple Health / Health Connect write | Workouts appear in the platform's activity rings |
| Home screen widgets and Siri/Google shortcuts | "Start workout" without opening the app |
| Exercise substitution suggestions | Equipment is occupied; suggest an equivalent movement |
| RIR as an alternative to RPE (D-09) | Some methodologies prefer it |
| Body-weight-inclusive volume for calisthenics and assisted sets (D-12, D-02) | Needs reliable bodyweight history from P13; a read-time change, no migration |
| A real zip export including progress photos (D-06) | Makes the backup genuinely complete |
| Light theme | Explicitly excluded by the brief; token structure already supports it |

**Won't have (v1.x)**

Cloud sync and accounts; social features and shared plans; an AI coach; a wearable app;
a web version; a nutrition tracker. Sync in particular is architecturally prepared
(ADR-0004) but is a product decision, not a technical one - it brings accounts, auth,
a server, a privacy policy with teeth and ongoing operational cost to an app that
currently has none of those.

---

## Risk register

Full analysis in ARCHITECTURE.md section 17. The risks that most affect *this schedule*:

| Risk | Affects | Mitigation in the plan |
|------|---------|------------------------|
| R-11 scope (the brief is 3-4x a typical MVP) | Everything | The MVP line after P10; four features explicitly deferred |
| R-02 content curation (Polish names, videos) | P4 | Overlay files with graceful fallback; ~150 exercises targeted, 0% coverage still ships |
| R-01 binary size from bundled imagery | P2, P16 | Full bundling is settled (D-01), so this is a budget to manage: build-time downscaling to 512 px WebP, measured at P2 and again at P16, escalating to tighter quality then one image per exercise if over |
| R-04 Android rest-timer accuracy | P7 | Absolute deadlines and OS-scheduled notifications, never JS timers; tested on a real device with battery optimization on |
| R-05 losing an in-progress workout | P6 | ADR-0005 in full, and E2E flow 4 blocks the phase |
| R-03 Skia / Expo SDK coupling | P11 | Chart adapter isolates the swap to six files |
| R-12 solo developer, long sequence | All | One feature per commit; every phase independently shippable; architecture documented up front |

---

## Decisions applied per phase

There are no open questions. Every question this roadmap previously listed as blocking
was answered on 2026-08-04 and is recorded as D-01 through D-12 in ARCHITECTURE.md
section 18. This table now maps each decision to the phase that implements it, so a phase
can be started without re-reading the register.

| Decision | Applied in | What it means for that phase |
|----------|-----------|------------------------------|
| D-11 English UI, i18n from P1 | **P1** | Typed `t()` and an English catalog land in P1; every string from P1 onward routes through it. No Polish UI is built. |
| D-01 bundle all imagery | **P2** | `build-catalog.ts` downscales and bundles all ~1,600 images at 512 px WebP. No network gallery path exists. |
| D-02 assisted sets excluded from volume/PR, D-09 RPE only | **P6** | Set-type semantics per the ADR-0006 table; RPE is the only intensity input. |
| D-03 superset timer after the last exercise | **P7** | Timer service reads `superset_group` and skips non-terminal members. |
| D-04 estimated calories, off by default | **P9** | Shown in the summary, labeled as an estimate, disabled until the user enables it. |
| D-06 photos excluded from export, D-07 own CSV format only | **P14** | Export screen states the photo exclusion; "Share progress photos" is a separate action; no third-party dialects. |
| D-05 crash reporting opt-in, default off | **P0 wiring, P16 declarations** | The SDK is never initialized unless enabled, so store privacy labels declare no data collected. |
| D-08, D-10, D-12 | Post-1.0 backlog | Not in v1 scope; listed in the backlog above. |

**Nothing blocks P0 through P10 (the MVP line), and nothing blocks P11 through P16
either.** Implementation can begin at P0.
