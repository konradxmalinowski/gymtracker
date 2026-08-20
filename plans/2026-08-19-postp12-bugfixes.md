# Post-P12 bugfix pass: SQLite dev-reload crash, keyboard-covers-input, icon/button alignment

## Problem summary

User report (Polish, paraphrased): (1) plan-creation flow - keyboard covers the name
input while typing; (2) after typing the plan/workout name, "something went wrong";
(3) icons and buttons across the app look crooked/off-center; (4) skip writing tests
for now, defer to a future roadmap phase; (5) user authorized installing a lightweight
Android emulator locally to reproduce and verify.

## What was found (orchestrator investigation, before delegation)

A lightweight Android SDK (cmdline-tools + emulator + one arm64-v8a API 34 system
image, ~4GB) was installed via Homebrew (`android-commandlinetools` cask) since none
existed on this machine. The EAS development-client APK built during the prior
`fix/expo-doctor-sdk-sync` session (build `84c9c4cc-ecc6-49bf-8840-0e70c4fcef86`) was
installed on the emulator and connected to a running Metro dev server.

**Bug 2 root cause turned out to be far more severe than "an error message":** the app
suffers a **native crash (SIGABRT, heap corruption)** on Android whenever the
`expo-sqlite` native module's database connection gets closed while the app's
`exercise_fts` FTS5 virtual table exists - confirmed via `adb logcat` tombstones
(`Scudo ERROR: invalid chunk state when deallocating`, crashing inside
`exsqlite3_finalize` called from `SQLiteModule.closeDatabase`). This app's own code
never calls `closeAsync()` anywhere (`grep -rn "closeAsync"` across the repo returns
nothing) - the close is triggered by `expo-sqlite`'s own internal cleanup on a Metro
Fast Refresh / dev-client JS-context reload (the native module keeps a connection
cache keyed by database name and tears it down on reload, independent of app code).

This is a confirmed, well-documented upstream bug:
[expo/expo#38168](https://github.com/expo/expo/issues/38168) - `exsqlite3_finalize`
is called on a virtual-table module's own internal statements (FTS5, or R-tree per a
later comment on the same issue) during the pre-close "finalize all statements" walk,
then the virtual table's own `sqlite3_close()` cleanup tries to finalize the same
already-freed statement a second time. Multiple reporters confirm the documented
workaround (`finalizeUnusedStatementsBeforeClosing: false` passed to
`openDatabaseAsync`) fixes it; one reporter's from-scratch C reproduction (no RN, no
JNI) proves the bug is in the vendored SQLite amalgamation's virtual-table-aware
statement walk itself, not app code - not something fixable by changing this app's own
query logic. Reproduced locally: 100% reproducible on a clean single launch once the
JS context reloads once (confirmed via `ps`/`logcat` across multiple clean
force-stop-then-single-launch cycles).

This is very likely the actual root cause of the user's reported bug 2
("something went wrong" after typing a plan name) - a Fast Refresh during active
development (editing files while `npx expo start` is running) plausibly closed/reopened
the SQLite connection mid-session, and while the emulator's Scudo allocator crashes
loudly and immediately, the same double-free could silently corrupt heap state on the
user's own device and surface later as an unrelated-looking generic error on the next
SQLite operation (e.g. the plan-creation transaction) rather than an immediate crash -
allocator/GC-timing-dependent per the same GitHub issue's own comments. This is
dev-mode/Fast-Refresh-specific (no JS reload happens in a production build after
initial launch), so it should not affect a shipped production build the same way -
still worth fixing since dev-mode is exactly where the user is testing today.

**Bug 1 root cause** (confirmed via static code investigation, not yet via emulator
since bug 2 blocked reaching the screen): `components/feedback/BottomSheet.tsx` has
zero keyboard-avoidance code - it renders a raw RN `Modal` with a bottom-pinned
`Animated.View` (`justifyContent: 'flex-end'`) and nothing shifts it up when the
keyboard opens. `components/layout/KeyboardAvoider.tsx` exists but is dead code
(never imported anywhere) and would not help here regardless, since it wraps content
*outside* a `Modal`'s own tree, which has no effect on content rendered *inside* the
`Modal`. `PlanListScreen.tsx`'s create/rename sheet is one of several `BottomSheet`
consumers app-wide (rest-timer-settings, exercise-picker, `CalendarDaySessionPicker`,
plan create/rename) - fixing this in `BottomSheet.tsx` itself fixes it for all of them,
not just plan creation.

**Bug 3** (icon/button alignment) has not yet been investigated - blocked on getting a
stable, non-crashing build running in the emulator first, then a full manual visual
pass across every main screen.

## Acceptance criteria

- App boots and survives a Metro Fast Refresh / JS reload on the Android emulator
  without the native SIGABRT crash.
- `BottomSheet`'s content (and thus the plan name `TextField`/save `Button`) stays
  visible above the keyboard when it opens, on Android and iOS.
- A concrete, file-and-line-referenced list of icon/button alignment issues, each
  either fixed or explicitly deferred with a reason.
- No test-writing this pass (explicit user instruction) - instead, `docs/ROADMAP.md`
  gets a backlog note that these three fixes need real test coverage in a future pass.

## User decisions (already made)

- Priority 1: fix the SQLite native crash (blocks everything else, likely explains
  bug 2, may affect real users in dev mode).
- Then: keyboard-covers-input (bug 1), then: icon/button alignment sweep (bug 3).
- Skip test-agent this pass; record the gap in the roadmap/plans instead.
- Local Android emulator use authorized and already set up.

## Task shape and scaling

Single application (React Native/Expo mobile). Three sequential-ish sub-tasks with
disjoint file sets (`database/client.ts` vs `components/feedback/BottomSheet.tsx` vs
whatever files the alignment sweep touches) - the first two can run in parallel since
neither depends on the other's output; the alignment sweep must wait until I can
actually load a stable screen in the emulator to look at it.

## Platform

Cross-platform mobile (Expo/React Native), verified live on the local Android
emulator (arm64-v8a, API 34) this pass, per the user's explicit request to install
one and test rather than reason from static code alone.

## Step-by-step sequence

1. database-agent: `database/client.ts`'s `openDatabase()` - pass
   `{ finalizeUnusedStatementsBeforeClosing: false }` to `SQLite.openDatabaseAsync()`.
2. frontend-agent (parallel with 1): `components/feedback/BottomSheet.tsx` - add real
   keyboard-avoidance inside the `Modal` tree.
3. Orchestrator: reload the app in the emulator, confirm no crash across several
   Fast-Refresh cycles, confirm the plan-creation sheet's field/button stay visible
   with the keyboard open.
4. Orchestrator: full manual visual pass across Home/Plans/Exercises/Stats/Profile/
   active-workout screens via emulator screenshots, compile a concrete findings list.
5. frontend-agent: fix confirmed alignment findings.
6. docs-agent: add a `docs/ROADMAP.md` backlog note for future test coverage of these
   three fixes; note the `expo-sqlite` upstream issue and the chosen workaround in
   `CLAUDE.md`.

## Error handling strategy

If `finalizeUnusedStatementsBeforeClosing: false` does not fully eliminate the crash
(the GitHub issue has at least one report where it didn't help), stop and report back
rather than attempting a deeper native patch (patch-package on a vendored SQLite
amalgamation is a much larger, riskier change that needs explicit user sign-off).

## Edge cases

- The fix must not regress `closeAsync()` being callable at all in the future (it only
  skips an unnecessary defensive statement-finalization pass on close, not close
  itself).
- iOS is unverified this pass (no iOS simulator set up) - the `BottomSheet` keyboard
  fix must use RN's cross-platform `Keyboard`/`useAnimatedKeyboard` API rather than an
  Android-only or iOS-only mechanism.

## Feature-flag decision

Not applicable - project has no feature-flag system.

## NFR decisions

Not applicable - no non-trivial NFR surfaced for this bugfix pass.

## Agent delegation plan

| Sub-task | Agent | Files owned | Runs |
|---|---|---|---|
| SQLite close-crash fix | database-agent | `database/client.ts` | done, verified live (survives repeated Fast Refresh reload) |
| BottomSheet keyboard avoidance | frontend-agent | `components/feedback/BottomSheet.tsx` | first pass done but insufficient on Android (sheet barely shifts, field/button still hidden); second pass dispatched |
| Profile tab icon bug (shows Home's house icon) | frontend-agent | `app/(tabs)/_layout.tsx` | dispatched |
| Silent-catch + Quick Start start-workout failure | backend-agent-sonnet | `features/workout-logging/hooks/useStartWorkout.ts` + root cause file(s) | dispatched |
| Icon/button alignment findings + fixes | orchestrator (visual sweep) + frontend-agent | TBD | in progress - one confirmed bug found (profile tab icon, above); most screens (Home, Plans, Exercises, Stats, exercise detail, calendar) checked clean once settled |
| Roadmap backlog note + CLAUDE.md note | docs-agent | `docs/ROADMAP.md`, `CLAUDE.md` | not started - last step |

## Update: Quick Start bug confirmed and fixed

backend-agent-sonnet's hypothesis was correct, verified live: on real Android/Hermes
(never exercised before this session - Jest/`node:sqlite` always has a global
`crypto`, masking this), `Uuid7IdGenerator.generate()` called
`crypto.getRandomValues` with no polyfill installed anywhere in the project. Fixed
with a `Math.random()`-based fallback when the Web Crypto global is absent (same
spirit as the existing `database/ids/uuidv7.ts` test fixture). Live-tested: Quick
Start now successfully creates and enters a workout session.

## Update: fifth real bug found on ActiveWorkoutScreen

Reached `ActiveWorkoutScreen` for the first time (only possible after the Quick Start
fix above) and found `WorkoutHeader`'s content overlapping the Android status bar -
persistent across re-screenshots, not transient. Root cause: `ActiveWorkoutScreen.tsx`
never uses `Screen`/`SafeAreaView`, and `WorkoutHeader.tsx` only has a fixed
`paddingTop: space[2]` with no safe-area inset. Every other top-level screen in the
app correctly clears the status bar via `Screen`; this root-level (`app/workout/`,
outside `(tabs)`) route was apparently never wired through it. Dispatched to
frontend-agent.

## Update: sixth bug found - BottomSheet renders behind ActiveWorkoutBanner

After the third BottomSheet attempt (Modal removal) fixed the keyboard-avoidance bug
(verified live: PlanListScreen's create sheet now fully visible above the keyboard,
plan created successfully end to end, no crash), a new regression surfaced: with a
workout minimized (ActiveWorkoutBanner docked above the tab bar), opening a
BottomSheet from a tab screen renders it BEHIND the banner (confirmed via screenshot -
the sheet's "New plan" label visibly peeking out from under the banner). Root cause:
ActiveWorkoutBanner is mounted as a sibling of the entire `<Tabs>` navigator in
`app/(tabs)/_layout.tsx`, outside and after whatever tree a tab screen's own inline
`<BottomSheet>` render lives in - zIndex/elevation only reorders siblings sharing the
same parent, so BottomSheet's zIndex:1000 has no effect across that tree boundary.
Modal previously sidestepped this via a real separate native window. Dispatched to
frontend-agent to investigate routing through the existing `SheetHost`/`sheetStore`
mechanism (already designed for "one visible sheet" semantics, mounted at the true
app root) rather than reintroducing Modal.

## Update: BottomSheet keyboard fix, third attempt

Second attempt (onLayout-measurement of the Modal's own resize) also failed live -
same ~100-150px shift as the first, broken attempt, nowhere near the ~900px needed.
Confirmed via a working control case (`OnboardingScreen`'s nickname field, not in a
Modal, correctly avoids the keyboard with zero special handling) that the problem is
specifically RN `Modal`'s separate Android `Dialog` window, not Reanimated or this
app's general keyboard setup. Third attempt dispatched: remove `Modal` entirely,
render the sheet as a plain absolutely-positioned overlay in the same window as the
rest of the screen (matching the confirmed-working plain-screen case), with explicit
replacements for what `Modal` was providing for free (Android back-button handling,
accessibility-modal semantics, stacking above sibling content).

## Additional findings during live verification (beyond the original 3 reports)

- **Quick Start ("Could not start a workout")**: 100% reproducible on a fresh install,
  tapping Home's "Quick Start" button. The real error was invisible - `useStartWorkout.ts`'s
  `run()` has a bare `catch {}` with no logging at all. Dispatched to backend-agent-sonnet
  to both fix the silent catch (so this is diagnosable in the future) and root-cause the
  actual failure via careful code reading of `SqliteWorkoutSessionRepository.startEmpty()`'s
  call chain - this is a second real, reproducible "generic error" bug distinct from the
  plan-creation one originally reported, found only because the app could finally boot far
  enough to reach it.
- **Profile tab icon**: confirmed via both live screenshot and code read - see delegation
  table above.
- Two things initially suspected as bugs during the visual sweep turned out to be false
  alarms on closer inspection (re-screenshotting after the screen settled): a status-bar/
  title overlap on the calendar screen and empty (numberless) calendar day cells were both
  just transient mid-transition/loading-skeleton frames, not persistent bugs.
