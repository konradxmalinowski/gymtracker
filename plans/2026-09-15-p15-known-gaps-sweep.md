# Known-gaps sweep (post-P15)

## Problem summary

P15 (performance hardening and polish) merged to `main` as PR #26. `CLAUDE.md`'s
"Known gaps" section currently lists 9 open items. The user asked to address all of
them in one pass: 8 app-level gaps plus a release-build re-measurement of NFR-02/
NFR-04 (previously only measured on a debug build).

## Acceptance criteria

Each of the 9 items below is either fixed and verified, or - where a genuine
investigation concludes there is nothing actionable (e.g. a false-positive gap) -
documented as resolved-false and removed from Known gaps per `CLAUDE.md`'s own
"resolved gaps are removed, not struck through" convention. No gap gets silently
dropped without a stated outcome.

## Task shape and scaling

Single application, multiple independent sub-tasks with disjoint file sets - runs
as 4 parallel agent dispatches plus one orchestrator-direct task, per implement-
feature Step 4a's parallelization rules. Platform: React Native/Expo, Android-
verified (iOS stays unverified, consistent with every prior pass).

## Affected layers

Frontend (5 items), backend/repository (1 item, data-transfer - no schema change,
the four daily-goals tables already exist since P17), dependency/tooling (1 item),
investigation-only (1 item), infra/build (1 item - release APK build for NFR
re-measurement).

## The 9 items and their owners

1. **`RemindersSettingsScreen.tsx` duplicate `accessibilityLabel`** on hour/minute
   `StepperField`s (Increase/Decrease indistinguishable to a screen reader) -
   frontend-agent, Dispatch A.
2. **`components/ui/Badge.tsx` fixed height (20/24px) clips label text at very
   large accessibility font scales** (affects `TodayGoalRow`, `PRBadge`) -
   frontend-agent, Dispatch A.
3. **`ActiveWorkoutBanner` does not appear on Profile's nested "Training
   calendar"/"Training history" screens** while a workout is minimized - needs
   investigation first (real bug vs. intentional stack-composition difference)
   before a fix is attempted - frontend-agent, Dispatch A.
4. **Deleting an exercise's last remaining set during a historical edit
   (`WorkoutHistoryDetailScreen`) leaves an empty card instead of auto-removing
   it** - needs the existing per-set undo toast to become a combined set+exercise
   undo, real mechanism work, not a call-site change - frontend-agent, Dispatch B
   (isolated from Dispatch A - touches shared undo-toast state, gets its own
   dispatch to avoid rushing the mechanism design).
5. **`data-transfer` does not export/import daily-goals data** (`daily_goal`,
   `daily_goal_entry`, `daily_reminder`, `daily_reminder_response` all missing from
   JSON backup) - backend-agent-sonnet, Dispatch C. No schema/migration needed,
   tables already exist; this is `DataTransferRepository`/`DataTransferService`
   surface-area work plus the corresponding import-side validation.
6. **`expo-asset` is not hoisted**, breaking Jest module resolution for
   `@expo/vector-icons` inside RNTL tests (worked around with a manual mock) -
   general-purpose, Dispatch D. Investigate whether a `package.json`
   `overrides`/hoisting fix is safe and worth it, or whether the existing mock
   workaround should just stay documented as the permanent answer.
7. **A dev-only "state update on unmounted component" React warning**, rooted at
   `ContextNavigator`/`ExpoRoot`/`App`, root call site never isolated - general-
   purpose, Dispatch D. Investigate to actually find the call site this time;
   fix if found, otherwise report why it resists isolation and leave the gap
   entry accurate.
8. **NFR-02 (cold start) and NFR-04 (workout-history scroll) were only measured
   on a debug dev-client build on an emulator** - orchestrator, direct (not
   delegated - build/measurement work, no code authored). Build a release
   (not debug) APK via `npx expo run:android --variant release` or equivalent,
   install on the `gymtracker_test` emulator, re-measure both numbers. Still
   caveated as emulator-GPU, not real hardware, but materially closer to
   production JS performance (Hermes-precompiled bytecode, no dev-mode checks).

(Items 1-3 share Dispatch A only because they are small and file-disjoint from
each other and from item 4; item 4 is isolated in its own dispatch because it is
real mechanism design work, not a quick fix, and touches shared undo-toast state
that item 1-3's files do not.)

## Step-by-step sequence

1. Dispatch A, B, C, D in parallel (disjoint file sets, verified below).
2. Orchestrator, in parallel with the above: build the release APK and take the
   NFR-02/04 measurements.
3. Integrate: collect all reports, confirm no file collisions, resolve any that
   need it.
4. Code review each dispatch's diff (Step 6), edge-case check (Step 6a).
5. On-device verification of the fixed screens (Step 7) on the `gymtracker_test`
   emulator.
6. Run the full Jest suite as the regression gate (Step 8) - fix only if this
   sweep's own changes broke something, no new tests authored per standing user
   preference.
7. Security check (Step 9) only if the data-transfer work's import-side changes
   touch anything security-relevant (new field validation) - security-agent-sonnet.
8. Accessibility check (Step 9e) on items 1, 2, 3 specifically, since they are
   accessibility-motivated fixes - reuse the same code-level-audit pattern P15
   used (no device screen-reader available).
9. Update `CLAUDE.md`'s Known gaps section (docs-agent): remove each item that
   got fixed-and-verified, per the file's own convention; keep worded accurately
   any item that turns out to still be open after investigation (e.g. if the
   unmounted-component warning genuinely can't be isolated this pass either).
10. Commit, split by topic per item/dispatch. Push and open a PR once reviewed.

## File ownership (disjoint-set check for parallel dispatch)

- Dispatch A: `features/daily-goals/screens/RemindersSettingsScreen.tsx`,
  `components/ui/Badge.tsx`, `features/workout-logging/components/
ActiveWorkoutBanner.tsx` (investigation may also touch a nested-stack `_layout.tsx`
  under `app/(tabs)/profile/` if the root cause is navigation-stack composition -
  Dispatch A owns that subtree too if so).
- Dispatch B: `features/workout-logging/screens/WorkoutHistoryDetailScreen.tsx`
  and whatever undo-toast hook/store it shares with set-level undo (likely inside
  `features/workout-logging/hooks/` or `stores/` - Dispatch B's own report will
  list the exact file(s) touched).
- Dispatch C: `features/data-transfer/**` only.
- Dispatch D: `package.json` (only if a hoisting fix is judged safe),
  `__tests__/__mocks__/vectorIconsMock.tsx` (only if the workaround can be
  removed), and read-only investigation elsewhere for the unmounted-component
  warning (edits only if a real call site is found and fixed).
- Orchestrator: build tooling only, no source files.

No two dispatches share a file. Safe to run in parallel.

## Error handling strategy

Each item is independent - a failure or blocker on one does not block the others.
If Dispatch D concludes neither of its two items is safely fixable this pass,
that is a valid, reportable outcome (not a failure), and the Known-gaps entry
stays accurate rather than being force-closed.

## Edge cases to address

- Item 4 (combined undo): must not regress the existing single-set undo path: a
  set delete on an exercise with 2+ remaining sets must still show the simple
  per-set undo, not the new combined one.
- Item 5 (data-transfer): import-side must validate the four new table shapes
  the same way existing importable tables are validated (reuse the established
  Zod-validation pattern, not a new one); a backup file from before this fix
  (missing the four tables) must still import cleanly (treat their absence as
  "nothing to import" for those tables, not an error).
- Item 8 (release-build NFR remeasure): confirm the release build still boots
  and the golden path still works before trusting its perf numbers - a release
  build that silently fails to boot would produce meaningless (or absent) numbers.

## Feature-flag decision

Not applicable - project has no feature-flag system.

## NFR decisions

Item 8 is itself the NFR-measurement work for this pass; no new NFR introduced.

## Agent delegation plan

- **frontend-agent** (Dispatch A, parallel): items 1-3.
- **frontend-agent** (Dispatch B, parallel): item 4.
- **backend-agent-sonnet** (Dispatch C, parallel): item 5.
- **general-purpose** (Dispatch D, parallel): items 6-7.
- **Orchestrator** (parallel with the above, direct, no code authored): item 8.
- **security-agent-sonnet**: conditional, only if Dispatch C's import-side
  validation changes warrant it.
- **general-purpose** (a11y stand-in): items 1-3 accessibility re-check, after
  Dispatch A lands.
- **docs-agent**: final Known-gaps update, after everything above lands.
- **git-commit-agent**: final commit(s), split by item/topic.

No database-agent (no schema change - the four daily-goals tables already exist).
No test-agent dispatch for new tests, per standing user instruction; test-agent
only if this sweep breaks an existing test.
