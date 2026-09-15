# Known-gaps sweep state

Last updated: 2026-09-15T00:00Z (session start)

## Current step

Step 4 (delegation) - dispatching Dispatch A/B/C/D in parallel, orchestrator
starting the release-build NFR re-measurement in parallel with them.

Previously completed (Step 0-3):
- Step 0: scope confirmed with user via AskUserQuestion (release APK re-measurement
  on emulator accepted despite no real device; all 8 other gaps in one branch/PR).
- Step 1/1b: synced `main` (fast-forwarded to `a1fc107`, includes merged P15 PR #26),
  created branch `fix/p15-known-gaps-sweep`. Deleted merged branches
  `feat/p15-performance-hardening` (local + remote) and stray
  `feat/p15-perf-a11y` (local only, already an ancestor of main).
- Step 2/2a: no new environment/toolchain check needed - same `gymtracker_test`
  emulator/Android SDK setup already confirmed working this session.
- Step 3: plan saved at `plans/2026-09-15-p15-known-gaps-sweep.md`.

## Per-agent status

| Agent | Status | Summary |
|---|---|---|
| frontend-agent (Dispatch A: items 1-3) | done | Item 1: split shared accessibilityLabel key into hour/minute variants in features/profile/screens/RemindersSettingsScreen.tsx (note: lives under features/profile/, not daily-goals) + i18n/catalogs/en.ts. Item 2: Badge.tsx height->minHeight fix, same fix applied to PRBadge.tsx (hand-rolled, doesn't use shared Badge component, had the identical bug). Item 3: STALE GAP, already fixed by commit 381efef (2026-09-02, already on this branch) - ActiveWorkoutBanner lives at app root in app/_layout.tsx, not under (tabs). No code change; flagged for docs-agent to remove this Known-gaps bullet as resolved-false. tsc/eslint clean |
| frontend-agent (Dispatch B: item 4) | done | Reused existing removeExercise/restoreExercise pair (which already cascades soft-delete to all live sets in one transaction, stamped with the same deleted_at) for the last-set case instead of building a new undo mechanism - handleDeleteSet now checks isLastRemainingSet (accounting for deleteSet's own drop-set cascade) and routes to removeExerciseWithUndo when true, with a distinct toast message. Simple 2+-sets-remaining case untouched. Did not touch the existing repository-level test documenting the old bug (still accurate - fix lives in presentation-layer routing, not the repository). tsc/eslint clean (the data-transfer errors seen mid-run belong to Dispatch C, still in flight at the time) |
| backend-agent-sonnet (Dispatch C: item 5) | done | All 4 daily-goals tables now covered on export/import via ExportEnvelope version bump 1->2 (proper migration backfilling [] for old v1 backups, not silent field-guessing), correct per-table upsert semantics (daily_goal/daily_reminder by id+updated_at like other tables; daily_goal_entry/daily_reminder_response by their real composite identity, matching how the daily-goals repositories themselves already treat them). tsc/eslint/prettier clean project-wide |
| general-purpose (Dispatch D: items 6-7) | done | Item 6: RESOLVED ITSELF, no code change - expo-asset is now top-level in node_modules (no nesting/conflict), verified via a throwaway scratch RNTL test (outside repo, deleted after) that the real unmocked Ionicons renders fine from both import paths. Did not remove the now-unnecessary vectorIconsMock.tsx (test-file edit, out of scope). Item 7: NOT FIXABLE THIS PASS, thorough investigation - all 4 real subscription sites in the repo (app/_layout.tsx notifications, useAppState.ts, useRestTimerTick.ts, BottomSheet.tsx) already correctly guard cleanup; app/_layout.tsx's boot chain already uses a cancelled-flag guard pattern correctly. More importantly: React 19 (this project's version) removed the classic "state update on unmounted component" warning entirely (setState on unmounted is now a silent no-op) - exhaustive node_modules grep confirms the literal warning text doesn't exist anywhere in the dependency tree. Recommends rewording the gap entry rather than claiming fixed. Zero files touched, package.json/lockfile untouched |
| Orchestrator (item 8) | starting | release APK build + NFR-02/04 re-measurement on gymtracker_test emulator |
| general-purpose (a11y re-check) | queued | after Dispatch A lands |
| docs-agent | queued | final Known-gaps update |
| git-commit-agent | queued | final commit(s) |

## Files changed so far

None yet (plan/state files only).

## CI pipeline fix (user-requested, parallel to the sweep)

CI's "Verify" job has been failing on every recent merge to main (not caused by
this session's work) - two separate causes: `expo-doctor` (20 packages out of
date, all patch-level within SDK 57) and `audit:ci` (9 high-severity advisories
not in the allowlist). Dispatched two parallel agents:
- devsecops-agent-sonnet: done. `npx expo install --fix` bumped 16 packages (expo/expo-router already aligned during tree resolution) to their SDK-57-expected patch versions. expo-doctor now 21/21 clean. Regression gate clean (tsc/eslint clean, Jest 1440/1440 - one flaky perf-timing test re-confirmed not a regression on isolated re-run). Correctly detected the concurrent release-build Gradle process and used expo export instead of expo run:android to avoid colliding with it - but the FIRST release-build attempt (started before this fix landed) still raced with npm's node_modules rewrite and failed (checkReleaseAarMetadata - a deleted intermediate file). Retrying the release build now that node_modules is stable.
- security-agent-sonnet: done. Independently re-verified all 9 advisories trace
  only through build/dev/lint/test-tooling paths (xmldom via expo-sharing's
  native-build plugin subsystem, fast-uri via commitlint, js-yaml via
  commitlint/jest/eslint/expo-cli, none reachable from the actual app bundle).
  17 allowlisted in audit-ci.jsonc with reasons; sharp's 1 advisory fixed via a
  safe patch bump (0.35.3->0.35.4, package-lock-only to avoid racing the
  concurrent expo-doctor fix). `npm run audit:ci` now passes. Flagged (not
  acted on, out of scope): 2 pre-existing image-size allowlist entries are now
  stale (package dropped out of the tree) - candidate for a follow-up cleanup.

## Notes

- No new automated tests this pass unless something breaks (standing user
  preference, memory `feedback_no_new_tests_p17.md`).
- Item 8's release-build measurement is explicitly still emulator-based (no real
  device available) - report numbers with that caveat, do not overclaim.
