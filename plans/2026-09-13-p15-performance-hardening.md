# P15 - Performance hardening and polish

## Problem summary

`docs/ROADMAP.md` and `CLAUDE.md`'s Status section mark P0-P14 and P17 complete.
P15 (performance hardening and polish) and P16 (release engineering) are the two
remaining phases. The user asked to finish the app per the roadmap/CLAUDE.md, with
no new automated tests this pass (per the recurring preference already recorded in
memory `feedback_no_new_tests_p17.md`), verifying everything live on the Android
emulator instead.

Scope decision (confirmed with the user via AskUserQuestion): this pass covers
**P15 only**. P16 (app icon/store listings/code signing/store submission) needs real
Apple Developer / Google Play accounts and a hosted privacy policy, none of which
exist yet - confirmed with the user ("Nic nie jest gotowe"). P16 stays a documented,
unstarted next step; nothing in this pass touches it.

## Acceptance criteria (from `docs/ROADMAP.md`'s P15 entry)

- Full benchmark suite run against the large fixture; anything over budget fixed.
- FlashList tuning (`estimatedItemSize`, `getItemType`, `keyExtractor` stability).
- Memoization audit of `SetRow` and `SessionExerciseCard`.
- Render-count instrumentation on the workout screen.
- Bundle analysis and any resulting deep-import exceptions.
- Screen transition and micro-interaction animation pass.
- Every empty state, error state, and loading skeleton reviewed.
- Full VoiceOver and TalkBack pass.
- Dynamic type check.
- Long-history soak test on a low-end Android device (the `gymtracker_test` AVD,
  API 34, arm64-v8a - the same device every on-device pass since the post-P12
  bugfix pass has used).
- Every NFR in `docs/ARCHITECTURE.md` section 2.2 measured and the numbers recorded
  in `CLAUDE.md`, except NFR-09 (binary size), which that section itself defers to
  P16.

## Task shape and scaling

Single application (GymTracker, React Native/Expo, Android-verified - iOS stays
unverified, consistent with every prior on-device pass; no Xcode/simulator
available in this environment). This is one coherent phase, not a multi-app or
multi-layer split with a fixed contract to parallelize against - the FlashList/
memoization/render-instrumentation work all touches the same small file set inside
`features/workout-logging/`, so it runs as one frontend-agent dispatch rather than
several agents racing on overlapping files. Platform: React Native/Expo (Android
emulator verification; iOS unverified, per "Known gaps").

## Affected layers

Frontend only (no schema, no new API/endpoint, no new dependency expected).
No auth/permissions surface. No new npm dependency anticipated - if the bundle
analysis step reveals one is genuinely needed, that gets flagged to the user before
adding it, not silently.

## Step-by-step sequence

1. Run the existing Jest suite + benchmark suite as the regression gate (no new
   test files written, per user instruction) - orchestrator runs this directly.
2. Bundle analysis: `npx expo export` output inspected for size/deep-import
   surprises - orchestrator runs this directly, reports findings to frontend-agent
   only if a source change is needed.
3. Delegate to **frontend-agent** (single dispatch, one commit's worth of scope):
   - `ActiveWorkoutScreen.tsx`: hoist the inline `renderItem` to a stable, memoized
     reference (closes the already-tracked "Known gap" about `extraData` not
     actually being load-bearing yet - CLAUDE.md names this exact follow-up);
     tune `FlashList` props (`estimatedItemSize`, `getItemType` if warranted,
     stable `keyExtractor`) on every FlashList consumer:
     `ActiveWorkoutScreen`, `ExerciseLibraryScreen`/`ExercisePickerScreen`,
     `WorkoutHistoryListScreen`, `PersonalRecordsScreen`.
   - Memoization audit: `SetRow.tsx`, `SessionExerciseCard.tsx` - `React.memo`
     with a real equality check where beneficial, stable callback references
     (`useCallback`) for props passed down, confirm no unnecessary re-renders
     via the new render-count instrumentation (below).
   - Add lightweight, dev-only render-count instrumentation on
     `ActiveWorkoutScreen` (a `__DEV__`-gated console/overlay counter per cell,
     removable without affecting production) - a diagnostic tool, not a test.
   - Screen transition / micro-interaction animation pass: review existing
     Reanimated usage for missing enter/exit transitions or micro-interactions
     called out as absent (e.g. sheet presentation, tab switches, list item
     insertion/removal) and add polish consistent with existing `theme/tokens.ts`
     motion tokens - no new gesture/animation library.
   - Empty/error/loading state review across every screen: audit against the
     existing `EmptyState`/loading-skeleton/error-copy conventions and fix any
     screen that has drifted from them (silently missing skeleton, generic error
     copy where a specific one exists elsewhere, etc.).
4. Orchestrator: boot the `gymtracker_test` Android emulator, seed a long-history
   fixture on-device (reusing `scripts/generate-perf-fixture.ts`'s existing
   generation logic against the real on-device database via a temporary,
   `__DEV__`-gated seeding action - not a new Jest fixture), and manually verify
   scroll performance on the workout history list plus the golden path
   (start workout -> log sets -> finish -> summary -> history) with no jank,
   crash, or regression versus the post-P12/P13/P14 fixes already verified live.
5. Record every NFR-02/03/04/10 measurement taken directly in `CLAUDE.md`'s P15
   write-up (NFR-01/05/06/07/08 are either already continuously verified by
   existing mechanisms or don't need a fresh number this phase - state which
   explicitly rather than silently omitting).

## Error handling strategy

No new failure surface (no new endpoint, no new schema). Existing error/empty-state
conventions apply; any screen found missing one gets fixed to match the
established pattern, not a new one invented for this phase.

## Edge cases to address

- FlashList behavior with zero items, one item, and a very large list (the seeded
  long-history fixture) - confirm no layout jump or crash at any size.
- Render-count instrumentation must be a true no-op in a production build
  (`__DEV__`-gated), not just visually hidden.
- Dynamic type / large font scale must not break any of the touched layouts.
- Screen-reader (TalkBack) focus order must remain correct after any animation or
  FlashList prop change - re-confirm the already-established "no SwipeableRow
  collapse" finding still holds, do not assume it silently continues to.

## Feature-flag decision

Not applicable - this project has no feature-flag system (confirmed absent in
every prior phase's CLAUDE.md write-up).

## NFR decisions

This phase's whole purpose is measuring and closing out the NFR table in
`docs/ARCHITECTURE.md` section 2.2. No new NFR is introduced; existing ones are
measured against the concrete on-device numbers recorded in CLAUDE.md as described
above.

## Agent delegation plan

- **frontend-agent** (sequential, one dispatch): FlashList tuning, renderItem
  hoist, memoization audit, render-count instrumentation, animation/micro-
  interaction pass, empty/error/loading-state review-and-fix. Owned files: within
  `features/workout-logging/`, `features/exercise-library/`, `features/records/`,
  and any screen file touched by the empty/error/loading sweep - exact list
  reported back per the delegation package.
- **Orchestrator** (directly, not delegated - no code authored, only running
  commands/tools and reading output): Jest + benchmark suite run, bundle analysis,
  emulator boot, on-device fixture seeding and soak-test verification, NFR number
  recording.
- **general-purpose** (standing in for the unregistered accessibility-agent role,
  same substitution every phase since P7 has used): full VoiceOver/TalkBack pass
  plus dynamic-type check over the touched screens, after frontend-agent's changes
  land.
- **security-agent-sonnet**: only triggered if the bundle analysis or animation
  pass ends up needing a new dependency - not expected, so not pre-emptively run.
- **docs-agent**: update `CLAUDE.md`'s Status section and P15 write-up,
  `docs/ROADMAP.md`'s P15 entry (mark complete), `docs/architecture-snapshot.md`.
- **git-commit-agent**: final commit(s), split by topic (perf/code changes vs.
  docs), once everything above is clean.

No database-agent, backend-agent, or test-agent dispatch this phase - no schema/API
change, and per explicit user instruction no new tests are authored (existing
suite is run as a gate, not extended).
