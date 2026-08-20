# Security Audit Report

**Date**: 2026-08-20
**Scope**: Uncommitted working-tree diff on `fix/android-sqlite-crash-and-ui-polish` -
a post-P12 bugfix pass (13 bugs found/fixed during a full A-to-Z Android emulator QA
sweep, per `plans/2026-08-19-postp12-bugfixes-state.md`). Touches `database/client.ts`
(SQLite connection config), `services/id/Uuid7IdGenerator.ts` (id generation), two
gesture/overlay primitives (`BottomSheet.tsx`, `SwipeableRow.tsx`), a navigation guard
(`app/(modals)/exercise-picker.tsx`), a tab-icon key fix (`app/(tabs)/_layout.tsx`),
three workout-logging mutation/write-path fixes (`WorkoutHeader.tsx`,
`ActiveWorkoutScreen.tsx`, `SetRow.tsx`/`useDebouncedFieldCommit.ts`), one error-logging
addition (`useStartWorkout.ts`), and a bottom-sheet-to-`sheetStore` relocation across
three `features/plans` screens plus three new sheet-content components. No new npm
dependency (`package.json`/`package-lock.json` unchanged).
**Triggered by**: routine per-phase security pass, per this project's CLAUDE.md
convention - explicitly requested given this diff touches DB connection config and
several mutation/write-path hooks.
**Agent**: security-agent-sonnet (routine scope)

## Summary

Total: 0 Critical, 0 High, 0 Medium, 0 Low, 4 Informational.

Nothing in this diff blocks commit. This is a bugfix pass with no new attack surface:
no new npm dependency, no new network call, no new user-input-handling code, no change
to auth/authorization (this app has none - offline, single local user, no backend). The
one item asked to be looked at most carefully - the `Math.random()` id-generation
fallback - is safe for this app's threat model; reasoning below.

## Findings

None at Low or above.

## Detailed review by file

### `services/id/Uuid7IdGenerator.ts` (the file flagged for closest attention)

`getSecureRandomBytes` now feature-detects `globalThis.crypto?.getRandomValues` and
falls back to a new `fillWithInsecureRandomBytes` (`Math.random()`-seeded) when the
Web Crypto global is absent, rather than assuming it always exists.

- **Confirmed this id is never used as a security token.** `grep -rln "IdGenerator"
  services features repositories | grep -iE "share|token|invite|export|deeplink"`
  returns zero matches - every caller uses the generated id purely as a UUIDv7 SQLite
  primary key (ADR-0002/ADR-0004's "sync-readiness" primitive), never as a password-
  reset token, session token, invite code, or capability URL. The app has no backend,
  no accounts, and no cross-user trust boundary to fail (CLAUDE.md's "Product"
  section) - an attacker who can predict a row's id gains nothing, since there is no
  remote endpoint that accepts an id as an authorization credential.
- **Collision resistance, not unpredictability, is the actual requirement here**, and
  the fallback still meets it: UUIDv7's leading 48 bits are a millisecond timestamp
  (ADR-0002), so two ids only collide if generated in the same millisecond *and* every
  one of the remaining random bytes matches - `Math.random()`'s weaker distribution
  does not change this collision math in any way that matters for a single local
  device's write volume (at most a handful of rows per user action, never a
  high-throughput bulk-insert path from this generator).
- **The fallback is unreachable in practice on this app's supported runtimes** (Hermes
  has shipped `crypto.getRandomValues` since RN 0.72, per this file's own comment) -
  it exists as a defensive branch for whatever undiagnosed device/runtime state
  produced the "Could not start a workout" bug this session found, not as an expected
  steady-state code path.
- **The `globalThis as { crypto?: ... }` read pattern is correct and doesn't itself
  introduce a footgun**: it reads a property off `globalThis` (safely `undefined` if
  absent) rather than referencing a bare `crypto` identifier (which would throw
  `ReferenceError` if the global were never declared at all) - the comment in the diff
  correctly explains why this distinction matters, and the code matches it.

**Verdict**: no finding. The one thing worth flagging as INFO rather than a defect: if
a future phase (`data-transfer`, still an empty skeleton) ever repurposes an id from
this generator as a share link, export token, or anything crossing a trust boundary,
this fallback would need revisiting at that point - not before. See INFO-001.

### `database/client.ts`

`SQLite.openDatabaseAsync(name, { finalizeUnusedStatementsBeforeClosing: false })`
works around a documented upstream `expo-sqlite` double-finalize native crash
(`expo/expo#38168`) on FTS5 virtual tables, triggered on connection-cache teardown
(Fast Refresh / dev-client reload) - not on any code path this app's own runtime code
calls (`closeAsync()` is never invoked in application code, confirmed by the file's
own doc comment and no `grep` hits for it elsewhere). This is a resource-cleanup
option, not an access-control or data-integrity one - foreign keys, journaling mode,
and the busy timeout (the actual data-integrity-relevant pragmas) are untouched. No
finding.

### `components/feedback/BottomSheet.tsx`

Removing the RN `Modal` wrapper in favor of a manually-managed absolutely-positioned
overlay is a real, non-trivial change worth checking for a touch-bypass or
focus-trapping regression:

- **Touch containment is intact**: the full-screen `Pressable` backdrop (unchanged
  logic, same dismiss-on-tap behavior) still physically covers the entire screen
  underneath the sheet content, so nothing behind the sheet is reachable by touch
  while it's open - confirmed by reading the returned JSX, not just the diff summary.
- **Stacking is explicit and correctly ordered**: `OVERLAY_Z_INDEX = 1000` plus
  Android's separate `elevation: 24` (both higher than any existing token in
  `theme/tokens.ts`'s `elevation` scale, per the file's own comment) replaces what a
  real `Modal`'s separate native window used to guarantee automatically. No competing
  UI element in this codebase currently declares a higher `zIndex`/`elevation` -
  `grep -rn "zIndex" components features app` shows nothing above 1000.
  Confirmed by reading `theme/tokens.ts`'s own `elevation` export.
- **The one already-self-documented gap** (`accessibilityViewIsModal` has no Android
  equivalent for a non-`Modal` overlay, so TalkBack's explore-by-touch could in
  principle still reach hidden content underneath, even though real touch cannot) is
  an accessibility concern, not a security one - there is no cross-user or
  cross-privilege data behind the sheet to disclose (this is the same local user's own
  screen), and the author already flagged it for a live accessibility re-pass rather
  than leaving it silently unaddressed. Not re-flagged here as a security finding;
  noted for completeness. See INFO-002.
- **Android hardware back button**: the new `BackHandler` listener is correctly scoped
  to `visible === true` only and unsubscribes on unmount/dismiss - no risk of it
  swallowing back-presses elsewhere in the app or leaking a stale listener.

No finding.

### `components/gestures/SwipeableRow.tsx`

Extracting `hasLeftAction`/`hasRightAction`/`leftOnTrigger`/`rightOnTrigger` as plain
primitives before the `Gesture.Pan()` worklet closures is a Worklets-serialization bug
fix (avoids pulling a `ReactNode icon`-bearing object into a UI-thread closure) with no
behavioral change to *which* action fires under *which* swipe condition - the
`crossedRight`/`crossedLeft` threshold logic is identical, just reading the derived
booleans instead of re-deriving them from the full objects inline. No new surface. No
finding.

### `app/(modals)/exercise-picker.tsx`

The `hasCheckedInitialRequestRef` guard changes *when* the stale-request back-out
effect runs (once, at mount, instead of on every `request` change) but not *what* it
checks - and the added `canGoBack()` guard on `onConfirm`'s `router.back()` only
prevents a benign `GO_BACK not handled by any navigator` warning from becoming a hard
failure when reached from a root-level route. Confirmed the actual exercise-selection
data flow (`request.onConfirm(selectedIds)`) is unchanged - this is purely a
navigation-timing fix. No finding.

### `app/(tabs)/_layout.tsx`

Adding the `'profile/index'` key alongside `profile` in `TAB_ICONS` is a cosmetic icon
lookup fix with no data or navigation-guard implication. No finding.

### `features/workout-logging/components/WorkoutHeader.tsx` /
`features/workout-logging/screens/ActiveWorkoutScreen.tsx`

Two independent changes, both reviewed:

- `useSafeAreaInsets()` folded into the header's top padding is a pure layout fix.
- The multi-select "add exercise" handler changed from an unawaited
  `exerciseIds.forEach(async ...)` (a real concurrency bug - N racing transactions
  against the same session's `sort_order` column, the exact class CLAUDE.md's P9
  write-up already documents being fixed once before in `PlanDayEditorScreen`) to a
  sequential `for...of` with `await` per iteration. This is a data-integrity fix, not
  a new attack surface - `addExercise` itself is unchanged, still going through
  `sessionService`'s Zod-validated, parameterized repository write. Confirmed no new
  unvalidated input path was introduced by inlining the loop as an IIFE.

No finding.

### `features/workout-logging/components/SetRow.tsx` /
`features/workout-logging/hooks/useDebouncedFieldCommit.ts`

The set-completion race fix (`handleComplete` now cancels each field's pending
debounce timer and sends the row's current on-screen weight/reps/rpe/note explicitly
through `CompleteSetValues` into `completeSet`, rather than relying on the checkbox's
bare `onComplete(set)` to race against three independent debounced writes) is a data-
integrity fix for a genuine correctness bug (weight silently reverting to 0 after
completion), not a security-relevant code path - `completeSet`'s own Zod validation
and parameterized write are unchanged, this diff only changes *what values* are handed
to it and *when*. `cancelPending`'s decision to leave `lastSyncedValue` untouched
(rather than snapping it to `draft`) is sound reconciliation logic, verified against
the hook's own doc-comment reasoning and consistent with the rest of this hook's
existing contract. No finding.

### `features/workout-logging/hooks/useStartWorkout.ts`

The added `catch (error)` branch logs `error instanceof Error ? error.message :
String(error)` through `createLogger().error(...)` before showing the existing generic
user-facing toast. Traced `services/logging/{Logger.ts,RingBufferLogger.ts}`: this is a
local, in-memory 500-entry ring buffer plus an optional best-effort rolling file under
the app's own cache directory (ADR-0014) - there is no network transport, no Sentry
call site wired up yet (CLAUDE.md: Sentry's only `Sentry.init()` call site is deferred
to P15 and no DSN is committed), and nothing in this diff changes that. A caught
`Error.message` from a local repository/service call is local diagnostic text, not
user-entered PII beyond what the user already put in their own local, unsynced
database. No finding. See INFO-003 for a forward-looking note only.

### `features/plans/screens/{PlanListScreen,PlanDetailScreen,PlanDayEditorScreen}.tsx`
plus `features/plans/components/{PlanNameSheetContent,PlanDetailNameSheetContent,
PlanDayExerciseEditSheetContent}.tsx`

Read all three new sheet-content components in full, not just the screen-side diff.
Confirmed this is a pure relocation, not a rewrite: every mutation
(`useCreatePlan`/`useRenamePlan`/`useAddDay`/`useRenameDay`/`useUpdateDayExercise`)
still goes through the same Zod-validated `PlanService` methods it did before, the same
`PlanValidationError`-vs-generic-error catch-and-display shape is preserved verbatim in
each new component, and no new user-input field was introduced beyond what the inline
`BottomSheet` render already collected (`nameInput`, and the day-exercise edit sheet's
existing `StepperField`/`TextField` set). No finding.

## Dependency Audit

Not run as a fresh scan this pass - `package.json`/`package-lock.json` are byte-
identical to the branch's prior state (`git diff -- package.json package-lock.json`
returns empty), confirming no new dependency was introduced by this diff. The one
pre-existing high-severity advisory chain (`image-size` via `metro`, tracked since
`reports/security-2026-08-19-expo-doctor-fix.md`) is unaffected and carries forward
unchanged - not re-audited here since nothing in this diff could have changed it.

## Additional notes (informational, not findings)

- **INFO-001**: `Uuid7IdGenerator`'s `Math.random()` fallback is safe today because no
  id it produces ever crosses a trust boundary or serves as a credential (confirmed by
  grep, see above). This is a **forward-looking note, not a current defect**: if a
  future `data-transfer` or sharing feature ever repurposes a generated id as a share
  link, export token, or anything an attacker could act on by guessing it, this
  fallback would need to switch to a real CSPRNG polyfill (e.g. `expo-crypto` or
  `react-native-get-random-values`) at that point. Worth a one-line mention in that
  future phase's own security review rather than a TODO added to this file now.
- **INFO-002**: `BottomSheet.tsx`'s Android TalkBack explore-by-touch gap (no
  `accessibilityViewIsModal` equivalent for a non-`Modal` overlay) is already
  self-documented in the file's own header comment and flagged for a live
  accessibility re-pass. Re-confirmed here as accessibility-classed, not
  security-classed, per this app's single-local-user threat model - there is no
  other user's data for TalkBack to disclose.
- **INFO-003**: `createLogger().error(...)`'s new call site in `useStartWorkout.ts` is
  the first production code path (outside `services/logging` itself) this security
  pass has seen log a caught `Error.message` value. Purely local (ring buffer + optional
  local file, no network), so no finding today - but worth keeping in mind for whichever
  future phase wires up P15's `Sentry.init()`: at that point, every existing
  `createLogger().error(...)` call site (this one included) becomes a candidate for
  redaction review before crash reports can leave the device, since none of them were
  written with an eventual remote sink in mind.

## Recommendations (priority order)

1. No action required before commit - zero findings at Low or above.
2. Carry INFO-001 forward as context for whichever future phase builds `data-transfer`
   or any sharing/export feature - re-evaluate the id-generation fallback if generated
   ids ever start crossing a trust boundary.
3. Carry INFO-003 forward as a pre-work note for P15 (Sentry wiring) - a redaction pass
   over existing `createLogger().error(...)` call sites belongs to that phase, not this
   one.

## Report file confirmation

Findings saved to `reports/security-2026-08-20-postp12-bugfixes.md` (this file).
