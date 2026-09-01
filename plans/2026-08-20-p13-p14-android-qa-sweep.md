# P13 + P14 implementation, plus full-app Android QA sweep

## Problem summary

Three combined asks from the user, run as one workflow on one branch:

1. Run a full visual and functional test pass of the entire GymTracker app on the
   Android emulator (`gymtracker_test`, API 34 arm64-v8a - already provisioned from
   the prior post-P12 bugfix pass).
2. Compare current app state against `docs/ROADMAP.md` to see what is built versus
   what the plan calls for, and close real gaps.
3. Fix or add what that comparison and the QA pass turn up.

The roadmap comparison found: P0-P12 are fully implemented and shipped (confirmed via
`CLAUDE.md` and a merged PR history through P12 plus a post-P12 Android bugfix pass,
already merged to `main` as of this session). P13 (body measurements and progress
photos) and P14 (data export/import) are still empty skeleton directories - the next
two un-built phases in sequence. P17 (daily goals) is documentation-only and is
explicitly NOT in scope for this pass (not raised by the user, and the roadmap orders
it after P16, i.e. after release engineering - pulling it forward would be a bigger,
separate scope decision).

The user confirmed (via Step 0 clarification):
- Implement P13 and P14 for real, not just report them as backlog.
- Base this off a fresh branch from `main` (not the already-merged bugfix branch).
- In addition to bugs newly found in this sweep, also make real attempts at the
  already-documented "Known gaps" in `CLAUDE.md` (SetRow/SwipeableRow accessibility
  collapse, empty-exercise-card-after-last-set-delete, ActiveWorkoutBanner missing on
  two Profile nested screens, the unattributed dev-only unmounted-component warning,
  the DraggableList handle-collapse concern).
- `Cel funkcji.md` (an untracked, stale file) was read: it is the original brief that
  produced P17's documentation-only planning pass, already fulfilled. No new action
  needed from it now; it stays untracked scratch content the user can delete or keep.

## Acceptance criteria

- P13: `BodyMetricRepository`/`ProgressPhotoRepository` real (schema already exists
  from P2's `001_initial.ts` - no new migration needed), measurements list + per-metric
  history + quick-entry, progress photo capture/import/grid/compare, `verifyIntegrity()`
  wired into `/dev/db-health`. Matches `docs/ROADMAP.md`'s P13 acceptance bullets.
- P14: `DataTransferService`, JSON export/import (merge + replace, pre-replace backup,
  import preview, post-import rebuild), CSV export/import, share sheet integration.
  Matches `docs/ROADMAP.md`'s P14 acceptance bullets, including E2E flow 7.
- QA sweep: every screen reachable from the 5-tab bar plus every modal/nested route
  visited on-device (not just exported/bundled), visually reviewed for layout/crop/
  overlap issues and functionally exercised for the golden path per screen. Every real
  bug found gets a targeted fix, the same depth of investigation the post-P12 pass's
  own CLAUDE.md write-up used (root cause, not a surface patch).
- Known gaps: each of the five tracked in CLAUDE.md gets either a real fix (with
  on-device verification, since several are explicitly device-unverifiable via RNTL)
  or, if a real device check shows the underlying model was wrong, a documented reason
  it stays open.

## Task shape and scaling

Three sequential sub-phases, each following a lighter version of the full lifecycle
(review, verify-on-device, test, security-conditional, docs, one commit), because P14
logically depends on P13 existing (export must cover the new tables) and the QA sweep
needs both features live to test the full app surface:

- **Phase A - P13** (fullstack-orchestrator, since this spans domain/repository/
  service/hooks/screens in one RN codebase with no separate backend)
- **Phase B - P14** (fullstack-orchestrator, same reasoning, run after Phase A's commit)
- **Phase C - Android QA sweep + known-gaps pass** (orchestrator-driven on-device
  investigation via adb/emulator, same as the documented post-P12 pass, with each
  confirmed bug's actual code fix delegated to frontend-agent or backend-agent-sonnet
  per file ownership - never authored directly by the orchestrator)

Within Phase C, independent screens/flows are checked sequentially (one emulator, one
Metro instance - genuinely serial, not parallelizable the way multi-repo work is).
Fixes for distinct, non-overlapping files found during the sweep are delegated in
parallel batches once root-caused.

## Platform

React Native / Expo, Android only for this pass' on-device verification (iOS stays
unverified per every prior phase's own standing note). Detected from `package.json`
(`react-native`, `expo`) and confirmed via `app.config.ts`.

## Environment (Step 2a)

- Expo SDK `~57.0.14` (`package.json`).
- Android emulator: `gymtracker_test` AVD, API 34, arm64-v8a, already provisioned at
  `~/.android/avd/gymtracker_test.avd` from the prior pass. SDK at
  `/opt/homebrew/share/android-commandlinetools` (not on `PATH`/`ANDROID_HOME` by
  default in a fresh shell - exported per-command this session).
- Booted and confirmed reachable via `adb devices` before any implementation work
  started.
- No version mismatch found - same toolchain the prior, already-merged bugfix pass
  used successfully.

## Affected layers

Domain, repository, service, hooks, screens/components (frontend + "backend" in the
Clean Architecture sense, all within one RN codebase), i18n catalog, `services/
container.ts`, navigation routes, docs (`CLAUDE.md`, `docs/ROADMAP.md`), reports
(security, and accessibility where relevant).

## Step-by-step sequence

1. Phase A (P13): delegate to fullstack-orchestrator with the full P13 scope from
   `docs/ROADMAP.md` line 473-490 plus schema section 7.8. Review, on-device verify,
   test, security-check (touches file storage + new repositories), docs, commit.
2. Phase B (P14): delegate to fullstack-orchestrator with the full P14 scope from
   `docs/ROADMAP.md` line 492-506 plus ADR-0013. Review, on-device verify (E2E flow 7),
   test, security-check (file I/O, import validation - high-value target), docs, commit.
3. Phase C: orchestrator drives the emulator directly (adb screenshots + interaction),
   walks every tab and nested route including the two new P13/P14 surfaces, notes every
   visual and functional defect, root-causes each, delegates the fix to the owning
   agent, re-verifies live, commits per logical group of fixes. Then repeats the same
   process specifically against each of the five tracked "Known gaps."
4. Final integration pass: full test suite, typecheck, lint across everything touched
   in Phases A-C.
5. Docs update covering both new phases and the QA/known-gaps outcomes.
6. Push branch + open PR (after explicit user approval) covering all of it.

## Error handling strategy

Any error surfaced live on-device stops that thread of work, gets recorded (per Step
7a, in `errors/` only if it blocks and needs a user decision - most will just be fixed
inline per the QA sweep's own nature), and is fixed before moving to the next screen.

## Edge cases to address

Per Phase (P13/P14 acceptance bullets above cover most). QA sweep edge cases: app
backgrounded mid-flow, rotation not applicable (portrait-only per existing app), rapid
navigation/double-taps on the two new feature's screens, empty states (no measurements
yet, no photos yet, export with zero data, import of a malformed/foreign JSON file).

## Feature-flag decision

Not applicable - project has no feature-flag system (confirmed in Step 2 read of
CLAUDE.md/architecture docs across every prior phase).

## NFR decisions

P14's export must stream to file rather than build one JSON string in memory (roadmap's
own explicit requirement, tested against the 75,000-set fixture per its acceptance
bullet) - the concrete pattern is a streamed-write `DataTransferService`, not an
in-memory `JSON.stringify` on the whole aggregate.

## Agent delegation plan

| Sub-task | Agent | Files owned |
|---|---|---|
| P13 full-stack implementation | fullstack-orchestrator | `features/body-metrics/**`, `app/body-metrics/**` (routes), `services/container.ts` (additive), `navigation/routes.ts` (additive), i18n catalog additions |
| P14 full-stack implementation | fullstack-orchestrator | `features/data-transfer/**`, `app/data-transfer/**` or settings routes, `services/container.ts` (additive), i18n catalog additions |
| QA sweep fixes | frontend-agent / backend-agent-sonnet, per file, dispatched per confirmed bug | whichever specific file the root cause lives in |
| Known-gaps fixes | frontend-agent, per gap | `components/gestures/SwipeableRow.tsx`, `features/workout-logging/components/SetRow.tsx`, `features/workout-logging/screens/WorkoutHistoryDetailScreen.tsx` / related hooks, `app/(tabs)/_layout.tsx` / `ActiveWorkoutBanner` placement, framework-level setState warning investigation |
| Tests | test-agent (test-agent-opus only if a specific gap turns out to need property/concurrency testing) | new `__tests__/**` for P13/P14 and any regression tests for QA fixes |
| Security | security-agent-sonnet (file I/O + new repositories = conditional trigger per Step 9) | `reports/security-2026-08-2X-p13.md`, `reports/security-2026-08-2X-p14.md` |
| Accessibility | general-purpose agent standing in for accessibility-agent, same substitution precedent P7-P12 used | `reports/accessibility-2026-08-2X-p13.md`, `-p14.md` |
| Docs | docs-agent | `CLAUDE.md`, `docs/ROADMAP.md` |
| Commits | git-commit-agent | per logical group, Conventional Commits |
