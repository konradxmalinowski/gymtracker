# State: P13 + P14 + Android QA sweep

Last updated: 2026-09-02 (session continuation)

## Phase status

- **Phase A (P13 body measurements + progress photos): COMPLETE, merged to main.**
  PR #20 (https://github.com/konradxmalinowski/gymtracker/pull/20), merged by the
  user. Commit e2e63bb (backend), 462af11 (frontend), 676dacb (docs/reports) on the
  now-deleted branch `feat/p13-p14-android-qa-sweep`, squashed into `main` at
  `726368c`.
- **Phase B (P14 data export/import): in progress**, on a new branch
  `feat/p14-data-transfer-qa-sweep` (off updated `main`).
  - Domain/repository layer: complete (`features/data-transfer/{types,domain,
    repository}/*`), plus `database/seed/catalogSeeder.ts`'s `rebuildExerciseFts`
    made exportable for the post-import rebuild sequence. Not yet committed.
  - Service layer: complete (`features/data-transfer/services/{DataTransferService,
    errors}.ts`, 1185+41 lines), `services/container.ts` wired additively. Not yet
    committed. `npx tsc --noEmit` clean against this slice.
  - UI layer (hooks/screens/wiring/i18n): dispatched to frontend-agent, in progress
    as of this note - see plan file `plans/2026-09-01-p14-data-transfer.md` for full
    scope. Not yet verified on-device.
  - Two prior fullstack-orchestrator dispatch attempts for this phase failed on
    session rate limits (first reset stated 4:20pm Europe/Warsaw, second 2:20am) -
    both times real partial progress was preserved on disk (uncommitted) and picked
    up by the next dispatch rather than restarted from scratch. Real time has passed
    both reset points by the time of this note; no further rate-limit retries
    expected to be needed, but if one hits again: check `date`, confirm past the
    stated reset, and simply redispatch a continuation agent describing exactly
    what already exists on disk - do not restart the whole phase.
- **Phase C (Android QA sweep + known gaps): started.**
  - **Real bug found and FIXED and COMMITTED** (commit `381efef` on
    `feat/p14-data-transfer-qa-sweep`): `ActiveWorkoutBanner` was missing on every
    Profile-nested root-level route (Training history, Training calendar, Personal
    records, Body measurements) while a workout was minimized - graduates
    CLAUDE.md's own "not confirmed as a real bug" known-gap entry to confirmed-and-
    fixed. Root cause: the banner mounted inside `app/(tabs)/_layout.tsx`, which
    unmounts entirely on any route outside the `(tabs)` group. Fixed by moving the
    mount point to `app/_layout.tsx` (true app root). Verified live end-to-end:
    banner now shows on all four previously-affected screens, and still correctly
    does not render while inside the active workout screen itself (its own
    `pathname === '/workout/active'` check is mount-point-independent).
  - Other four tracked "Known gaps" (DraggableList handle-collapse a11y,
    SetRow/SwipeableRow structural collapse, FlashList extraData non-load-bearing,
    dev-only unmounted-component warning) not yet investigated this session -
    remain open.
  - General QA sweep of the other 4 tabs (Plans, Exercises, Stats - Home/Profile
    partially covered incidentally) not yet done.
  - One user-created real plan ("School 2026/7", 1 day "Monday", 0 exercises) exists
    on the `gymtracker_test` emulator's QATester account, created by the user
    directly via the emulator's own window during this session - left untouched,
    not test data to clean up.

## Environment

- Branch: `feat/p14-data-transfer-qa-sweep`, off updated `main` (post-P13-merge,
  commit `726368c`).
- Android SDK root: `/opt/homebrew/share/android-commandlinetools` (export
  `ANDROID_HOME`/`ANDROID_SDK_ROOT` per command).
- `gymtracker_test` emulator running throughout this session
  (`emulator-5554`), a **local** dev-client build (`npx expo run:android`, not the
  old EAS-signed one - that was uninstalled early this session since it predated
  P13's `expo-image-manipulator` native dependency). Metro running separately
  (`npx expo start --dev-client`, port 8081) since `expo run:android`'s own bundler
  process exits after its auto-install step fails against an already-differently-
  signed install.
- **Coordinate gotcha (repeated mistake this session, now understood)**: screenshots
  read back via the Read tool display at a 1.2x-smaller scale than the actual PNG
  pixel dimensions (device is 1080x2400; displayed coordinates need `* 1.2` to map to
  real `adb shell input tap` coordinates). Always prefer `uiautomator dump` +
  `content-desc`/bounds parsing over visual coordinate estimation when precision
  matters - screenshots are for visual confirmation, not tap-targeting.
- `uiautomator dump` reliably fails with "could not get idle state" whenever
  `ActiveWorkoutBanner`'s elapsed-timer text (or any other continuously-ticking
  text) is on screen - expected, not a bug; fall back to computed/known bounds or
  screenshot-based estimation (with the 1.2x correction) in that situation.

## Next action

1. Wait for the in-progress frontend-agent (hooks/screens/wiring for P14) to
   report back.
2. Code review the full P14 diff (Step 6) - extra scrutiny on: streamed export
   (verify no whole-envelope `JSON.stringify`), replace-mode destructive path
   (typed confirmation, pre-replace backup ordering), post-import rebuild sequence
   completeness.
3. On-device verify on `gymtracker_test` (Step 7): export JSON, export CSV, share
   sheet, import preview (JSON + CSV), merge import (no duplicates on repeat),
   replace import (with typed confirmation and backup path surfaced), malformed-
   file rejection, empty-data export.
4. Regression-gate: run existing Jest suite (`npx jest`), confirm no regressions
   from P14 or the banner fix.
5. Security check (security-agent-sonnet) - file I/O, untrusted-file parsing,
   destructive replace path are all real conditional triggers.
6. Docs update (docs-agent) - CLAUDE.md/docs/ROADMAP.md for P14.
7. Commit P14 (split by topic: domain/repository, services+container wiring,
   hooks+screens+i18n+routes, docs) - domain/repository and services layers are
   already-reviewed-by-implementing-agent but NOT yet committed, do this even
   before the UI layer finishes if a natural pause point arrives, to avoid losing
   more uncommitted work to a future rate-limit interruption.
8. Push branch, open PR (user has given standing approval to push/PR and merge
   immediately - no need to re-ask before each push, per their explicit
   instruction this session).
9. Resume Phase C: finish the known-gaps pass (4 remaining) and the general QA
   sweep of Plans/Exercises/Stats tabs, on a fresh branch off main once P14 merges.
10. Outstanding open question back to the user, not yet answered: a new feature
    request for daily sleep/weight/height logging with a user-chosen category and
    a stats chart over time - should it extend `body-metrics` or be closer to the
    unbuilt `daily-goals` (P17)? Do not start building it until answered.
