---
plan: plans/2026-08-05-p3-onboarding-profile-settings.md
branch: feat/p3-onboarding-profile-settings
last_updated: 2026-08-05T17:35:00Z
---

# P3 onboarding, profile and core settings - live state

## Current step

Steps 1-2 (backend, frontend) done. Step 5 (integration - no file conflicts, clean
sequential handoff) and Step 6 (code review, including a full spot-read of navigation,
onboarding, profile, settings, tab-bar and boot-sequence files) both complete, three
findings routed back and fixed (QueryClient test-teardown leak, unnecessary camera
permission, wrong phase number in a comment). Orchestrator independently re-verified
tsc/eslint/jest clean after every fix round - final state: 48/48 suites, 366 passed/2
skipped, no warnings.

Step 7 (on-device verification) - STILL PENDING, not skipped. User connected the
physical Android device via USB (`adb devices` confirmed `SM_A346B`/Galaxy A34), and
approved the orchestrator driving an EAS cloud dev-client rebuild directly (adb +
authenticated eas CLI available). Build was kicked off, then the user asked to cancel
it and continue with the rest of the workflow instead of waiting - build canceled
cleanly (`eas build:cancel`, confirmed "Build canceled" both server-side and in the
local process, which exited on its own with code 0). No dev-client rebuild happened.
Per docs/ROADMAP.md's Definition of Done, on-device verification is required before
this phase can be considered complete - it is deferred, not waived. Proceeding with
Step 9 (security/accessibility/infra checks) and Step 10 (docs) now since none of those
require the device; will circle back to Step 7 before Step 11 commit / Step 12 PR.

## Pre-P3 setup (complete)

- Confirmed P2 merged: PR #3 (`feat: add persistence foundation (P2)`), MERGED, on
  `origin/main`. Local `main` fast-forwarded to `0025ae8`.
- Stray uncommitted local changes (app.config.ts EAS owner/projectId, package.json
  expo-dev-client) were sitting on the old `feat/p2-persistence-foundation` checkout.
  Confirmed with the user both are intentional; carried over via `git stash` onto the
  new branch.
- New feature branch `feat/p3-onboarding-profile-settings` created off updated `main`.
- Read `docs/ROADMAP.md` P3 scope, `docs/ARCHITECTURE.md` sections 2 (requirements),
  7.3 (profile/settings schema), 8.3 (repository surfaces), 10 (navigation), plus
  ADR-0009 (units/conversion) and ADR-0012 (avatar/photo storage).
- Confirmed `user_profile` and `app_setting` tables already exist in
  `database/schema.sql` from P2 - no migration needed this phase.
- Resolved two open decisions with the user before planning: (1) build the full 5-tab
  navigation layout now rather than deferring it, with honest not-yet-available states
  for Plans/Exercises/Stats; (2) icon library is `@expo/vector-icons`.
- `docs/architecture-snapshot.md` is stale (P1 and P2 doc commits postdate its recorded
  commit `fbda52d`) - full Step 2 read done directly instead of trusting the snapshot;
  regeneration delegated to docs-agent in Step 10 rather than authored by the
  orchestrator, per the no-orchestrator-authored-content rule.
- Plan saved: `plans/2026-08-05-p3-onboarding-profile-settings.md`.

## Per-agent dispatch status

| # | Agent | Status | Summary |
|---|-------|--------|---------|
| 1 | backend-agent-sonnet | done | domain/Weight.ts+Length.ts full ADR-0009 conversion/rounding (fast-check round-trip property tests), features/profile/repository (ProfileRepository+SqliteProfileRepository, singleton-row 'local', deliberately not extending BaseSqliteRepository - reasoned deviation documented in-file, same precedent as SqliteSettingsRepository), features/profile/services/ProfileService (getProfile/completeOnboarding/updateNickname/updateAvatar; onboarding avatar failure swallowed+logged, standalone updateAvatar failure throws - deliberate asymmetry, documented), haptics.enabled settings key added to settingsSchema.ts, services/container.ts extended with profileRepository+profileService. Added FileStorage.copyFrom(sourceUri, relativePath) as a new generic primitive (not in original P2 interface - needed to ingest external image-picker URIs per ADR-0012). NICKNAME_MAX_LENGTH=40 and AVATAR_DIRECTORY='avatars' exported from features/profile barrel for frontend-agent to consume. Orchestrator independently re-verified: tsc clean, eslint clean, jest --ci 43/43 suites, 348 passed/2 skipped - matches agent's self-report exactly. Spot-read ProfileService.ts, SqliteProfileRepository.ts, container.ts - all clean, well-reasoned, no issues found. |
| 2 | frontend-agent | done | navigation/routes.ts, full 5-tab layout (Ionicons), onboarding screen+hook, profile/settings screens+hooks, app/_layout.tsx boot sequence (database open+migrations+container, previously entirely missing), app.config.ts image-picker plugin, haptics.enabled wired through services/haptics/settings.ts+MMKV mirror per ADR-0008, @hookform/resolvers added, TextField.onBlur added. Two review findings routed back and fixed: (1) worker-exit warning - actual root cause was TanStack Query v5's MutationCache.clear() not calling destroy()/clearGcTimeout() per mutation, leaving a 5-minute gcTime setTimeout as a genuine open handle; fixed with gcTime:0 in the 4 new test files' QueryClients plus clear()+unmount() teardown; (2) app.config.ts requested cameraPermission for expo-image-picker with no launchCameraAsync call anywhere - confirmed cameraPermission:false is the documented way to omit it, fixed. Orchestrator independently re-verified after the fix round: tsc clean, eslint clean, jest --ci 48/48 suites, 366 passed/2 skipped, no worker-exit warning - matches agent's re-verification exactly. Spot-checked navigation/routes.ts, AboutScreen.tsx, useSettings.ts, TextField.tsx diff - all clean, well-reasoned. |
| 3 | test-agent | done | Gap-fill review (not primary test author - that was already covered by backend/frontend agents' own tests). Checked coverage against roadmap acceptance criteria + Definition of Done. Confirmed already solid: singleton user_profile invariant tested at repository level, haptics.enabled covered by the existing ALL_KEYS-driven settings test loop. Found and fixed 3 real gaps: (1) ProfileService.completeOnboarding() double-submit propagation untested despite the repository-level rejection existing - added 2 tests; (2) settings mutation race-guard (scope:{id:'settings:...'}) present in code, zero tests - added a fake-repository race test proving TanStack Query's scope serialization prevents stale-write-wins; (3) FileStorage.copyFrom()'s path-traversal guard untested (only writeText/getUri were) - added direct test. Deliberately did NOT add a second near-duplicate race test for useUnitsSettings after hitting a real RNTL/act() timing bug from stacking two scoped-mutation renderHook tests in one file - reasoned this proves nothing new since both hooks share the identical scope mechanism, avoided manufacturing flakiness. Flagged, not fixed: app/_layout.tsx's RootNavigationGate has zero test coverage, but confirmed this matches an existing repo-wide convention (route-file testing deferred to Maestro e2e, which has no flows for any phase yet, including P2's db-health route) - not a P3-introduced regression. Orchestrator independently re-verified: tsc clean, eslint clean, jest --ci 49/49 suites, 373 passed/2 skipped (was 48/369) - exact match. |
| 4 | security-agent-sonnet | done, one fix routed back | reports/security-2026-08-05-p3.md. 0 critical/0 high/0 medium/1 low. New deps (expo-image-picker, @expo/vector-icons, @hookform/resolvers, expo-dev-client) all clean, no CVEs, no install scripts, npm audit --audit-level=high clean (11 pre-existing moderate uuid/@expo/config-plugins findings, unrelated, tracked since P0). Avatar write-then-commit ordering confirmed correct, filenames always crypto-random UUIDv7 never user input. cameraPermission:false confirmed correct (no launchCameraAsync call exists). SQL fully parameterized, no injection/mass-assignment surface. haptics.enabled degrades gracefully on corrupt storage in both SQLite and MMKV paths. One LOW (SEC-001): ExpoFileStorage.pathSegments() doesn't reject '.'/'..' segments - not exploitable today (only caller always uses UUID-generated filenames) but FileStorage is a documented shared primitive future phases will call directly; report recommends hardening now while there's one caller. Routed fix to backend-agent-sonnet (ade67eb9) - fix landed (pathSegments() now throws on '.'/'..' segments, matches the recommended patch exactly), independently re-verified. |
| 5 | general-purpose (accessibility) | done, fixes applied and verified | accessibility-agent is not in this environment's available agent roster - substituted general-purpose with a detailed accessibility-review brief covering the same Step 9e checklist. Deviation noted per workflow flexibility rules. Found: (HIGH) OnboardingScreen's avatar-permission-denied and generic submit-error messages use bare accessibilityLiveRegion with no AccessibilityInfo.announceForAccessibility() call or accessibilityRole="alert", inconsistent with the established TextField.tsx/ErrorState.tsx pattern (A11Y-002) - VoiceOver users get no announcement on either error path; (MEDIUM) UnitsSettingsScreen's loading skeleton has no screen-level announce-on-loading effect, unlike ProfileScreen's identical isPending pattern; (LOW, informational only, no fix needed) ListRow+Switch trailing-control label collision flagged for future rows, not a current bug. Everything else checked out: tab bar labels, touch targets, nickname field validation, boot-failure screen, no color-alone signaling. Routed the two real findings back to frontend-agent. |
| 6 | devsecops-agent | skipped | No build/pipeline/signing config actually changed this phase (eas.json untouched, no new profile). The only infra-adjacent item - a new native module needing a dev-client rebuild - is an operational action already being handled directly by the orchestrator via eas CLI + adb (Step 7), not a config change requiring devsecops-agent's expertise. Skipping the dispatch rather than forcing process for its own sake. |
| 7 | docs-agent | done | CLAUDE.md status+known-gaps+data-layer updates, CHANGELOG.md P3 entry (+ Security subsection), docs/architecture-snapshot.md fully regenerated (also fixed pre-existing stale phase-number errors from before P3), ARCHITECTURE.md 7.3 known-keys list (+haptics.enabled) all done. Correctly flagged app.config.ts's EAS owner change as needing human confirmation rather than guessing - gave it the missing context (confirmed intentional in Step 0) and asked it to update CLAUDE.md's stale "@konradxmalinowski/gymtracker" reference to "@konradxmalinowski-2/gymtracker" to match. Also flagged (informational, not fixed, pre-existing, out of this dispatch's scope): __tests__/database/benchmarks.perf.test.ts's skip comments label the future JSON-export benchmark "P9," conflicting with ROADMAP.md's real P9="Workout summary and history" / P14="Data export and import" - predates P3, noted in the regenerated snapshot, not blocking. |
| 8 | git-commit-agent | done | 5 thematic commits, all pre-commit hooks clean: e735e80 (chore: EAS owner + P3 deps), 1df78fd (feat: Weight/Length conversion), cac5cda (feat: profile repository+service layer), aba284c (feat: onboarding+profile+settings screens+nav shell), 0a3405b (docs). Working tree clean after final commit. Orchestrator independently re-verified post-commit on HEAD: tsc clean, eslint clean, jest --ci 49/49 suites, 373 passed/2 skipped. Nothing pushed - awaiting explicit user approval (Step 12).

## Phase status

Steps 1, 2, 4, 5, 7 all done, every finding fixed and independently re-verified by the
orchestrator. Step 6 (devsecops-agent) explicitly skipped, justified (no build/pipeline
config changed). Final full-tree check: tsc clean, eslint clean, prettier clean, jest
48/48 suites, 369 passed/2 skipped.

PROCESS CHANGE (2026-08-06, user directive): on-device verification (Step 7) is no
longer done per-phase. The app will be built and installed on the physical device once,
after P10, covering P3-P10's acceptance criteria in one batched pass. See the plan
file's new "Process change" section for the full reasoning and the explicit flag that
this overrides docs/ROADMAP.md's stated per-phase Definition of Done wording (not
edited yet - would need its own go-ahead).

Second and third EAS build attempts (both superseded by this directive) were started
and canceled: attempt 2 (`8087268e...`, actually the same build id space - see log)
died silently overnight, likely killed by the session boundary, never registered past
"Using remote Android credentials" and never appeared in `eas build:list`; attempt 3
(`c77b0d6c-1505-481e-a308-798e5f1b9622`) was IN_PROGRESS server-side and was explicitly
canceled once the deferral instruction arrived. No further build attempts until P10.

Step 7 status for this phase: DEFERRED to the batched P10 pass, not completed, not
waived. All other gates done. Step 11 (commit) complete - 6 commits, all clean (5
feature/docs commits plus one small bookkeeping commit for this state file). Step 12
complete: user approved, branch pushed, PR opened at
https://github.com/konradxmalinowski/gymtracker/pull/4. Task's live-tracking job is
done - per this workflow's own convention, no further updates to this file after PR
open. Next real action on this phase is the batched post-P10 on-device verification
pass, tracked separately when P10 is reached, not in this file.

docs/ROADMAP.md updated (user explicitly asked for this rather than leaving it
informal): both the "phase is done when" bullet (point 4, "How this roadmap works")
and the "Definition of Done" section's first bullet now state on-device confirmation
is deferred and batched for P3-P10, explicit that "committed" != "confirmed on
device" until the batched P10 pass. Narrow, surgical edit - no phase scopes,
acceptance-criteria lists, or the scope summary table touched.

## Files changed so far (this phase)

app.config.ts, package.json, package-lock.json (carried-over stray changes, not yet
committed), plans/2026-08-05-p3-onboarding-profile-settings.md,
plans/2026-08-05-p3-onboarding-profile-settings-state.md.

## Next action

Dispatch backend-agent-sonnet with the Step 4c delegation package for domain/profile
repository/service/settings-key/container work.
