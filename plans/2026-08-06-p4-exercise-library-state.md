# P4 exercise library - live state

Last updated: 2026-08-06 (step 6-9 in progress)

## Current step

Step 4 complete (all 4 implementation batches reported, independently
re-verified by the orchestrator: typecheck/lint/full jest suite clean at
each stage, `npx expo export --platform ios` bundles successfully). Step 6
(code review) done - reviewed SqliteExerciseRepository's FTS/query logic,
ExerciseService validation, boot wiring, Expo Router nested-stack
restructure, detail/form screens; no blocking issues found. Step 7 (run and
verify): no simulator/emulator available in this session to visually
exercise the UI - verified via `expo export` bundling success and the full
automated test suite instead; flagged to the user as a real gap, not
claimed as full verification. Step 9 security (security-agent-sonnet) and
accessibility (frontend-agent, substituting for the unavailable
`accessibility-agent`) reviews dispatched in parallel.

Security review done: 0 findings (Critical/High/Medium/Low all 0), report
saved to `reports/security-2026-08-06-p4.md`. Covered SQL injection (incl.
FTS5 query-syntax injection via `buildFtsMatchQuery()`'s per-token quoting),
no repository-bypass path from presentation, `source='custom'` mutation
guard enforced repository-side not just UI-side, deep-link/malformed-id
handling, image filename lookup has no filesystem/traversal surface, no new
dependencies added. Nothing blocks the commit.

Accessibility review (frontend-agent substitute): done. Fixed 4 real gaps
(search-result-count live announcement, favorite-toggle state announcement
on list row + detail screen, image gallery accessibility labels) and
confirmed chip groups / confirm dialogs / stepper field / section headings
were already correct. Added 4 purely-additive i18n keys under the existing
`exerciseLibrary` namespace (disclosed as a minor scope extension beyond its
file brief). Re-verified independently: typecheck/lint clean, full suite
473/474 (1 pre-existing skip) still passing.

Step 10 (docs): docs-agent dispatched to update CLAUDE.md's Status section,
regenerate docs/architecture-snapshot.md, and add a CHANGELOG.md P4 entry.
Running.

Next: Step 11 (commit, split by topic) once docs land, then Step 12
(push + PR, needs explicit user approval before pushing).

## Per-agent status

| Agent | Task | Status | Summary |
|---|---|---|---|
| database-agent | Repository + loadCatalogAsset fix + benchmark | done | ExerciseRepository (11 methods incl. deleteCustom) + SqliteExerciseRepository + loadCatalogAsset fix; 413 tests pass, lint/typecheck clean (verified independently) |
| frontend-agent (task A) | Exercise image map codegen | done | 1721-entry image lookup map generated and verified (typecheck clean); see files below |
| backend-agent-sonnet | Domain/service/container/boot wiring | done | formatExerciseName, ExerciseService, container + boot wiring; 453 tests pass, lint/typecheck clean (verified independently) |
| frontend-agent (task B) | Screens/hooks/navigation | done | Library/detail/create-edit screens, hooks, filter sheet, exercises-tab nested-stack restructure, route helpers, i18n keys, 21 new tests; 59 suites / 473 passed (1 pre-existing skip), lint/typecheck clean (verified independently) |

## Notes from frontend-agent (task B)

- Fixed a real bug in `app/(tabs)/_layout.tsx`: the exercises tab was
  registered as `name="exercises/index"`, which would have bypassed the new
  `app/(tabs)/exercises/_layout.tsx` nested Stack entirely once it existed.
  Changed to `name="exercises"` (points at the folder/nested-navigator).
- `@/assets/exercises` (the barrel this phase's brief describes) has no
  matching `@/assets/*` tsconfig path alias - used relative imports instead
  rather than editing `tsconfig.json` (not an owned file for this task).
- Discovered `expo-asset` is missing from the installed dependency tree /
  `package-lock.json` (nested under `expo`'s own `node_modules`, unreachable
  by `expo-font`'s own `require('expo-asset')`) - breaks any Jest test that
  imports `@expo/vector-icons`. Confirmed this is Jest-resolver-only: `npx
  expo export --platform ios` bundles the whole app (including every new
  exercise-library screen) successfully via Metro, so this is not a real
  runtime/production issue. Worked around it for tests with
  `__tests__/__mocks__/vectorIconsMock.tsx`. Flagging for whoever eventually
  investigates the `package-lock.json` gap, since it's pre-existing and not
  caused by this phase.

## Files changed so far

Frontend task A (verified: typecheck clean, files present):
- `scripts/build-exercise-image-map.ts` (new)
- `assets/exercises/imageMap.ts` (new, generated, 1721 entries)
- `assets/exercises/index.ts` (new, `getExerciseImageSource()`)
- `__tests__/assets/exerciseImageMap.test.ts` (new)
- `package.json` (added `build:exercise-images` script)
- `tsconfig.json`, `scripts/tsconfig.json` (excluded/included the new script like `build-catalog.ts`)

Database-agent (verified independently: `npm run typecheck`, `npm run lint`, `npx jest` all clean - 52 suites, 413 passed, 1 skipped unrelated P9 benchmark):
- `database/seed/loadCatalogAsset.ts` (edited - maps `primaryMuscles`/`secondaryMuscles` to `muscles: {slug, role}[]`)
- `features/exercise-library/repository/ExerciseRepository.ts` (new)
- `features/exercise-library/repository/SqliteExerciseRepository.ts` (new)
- `features/exercise-library/repository/errors.ts` (new - `ExerciseNotEditableError`)
- `__tests__/features/exercise-library/repository/SqliteExerciseRepository.test.ts` (new, 36 tests)
- `__tests__/database/seed/loadCatalogAsset.test.ts` (new)
- `__tests__/database/benchmarks.perf.test.ts` (edited - unskipped exercise search benchmark, 0-1ms measured, budget 50ms)

Notable decisions from database-agent to carry into later steps: `deleteCustom` added beyond the literal ARCHITECTURE.md 10-method list (documented in the interface); custom-only mutation enforced in the repository itself (`ExerciseNotEditableError`), not deferred to `ExerciseService`; contentless FTS5 needed a snapshot-then-delete-then-reinsert pattern for single-row updates (not a normal `DELETE`); `muscleSlugs`/`context` filters needed hand-built `WhereClause`-shaped EXISTS/subquery fragments since `WhereClause.ts` doesn't support those natively; `replaceCatalog` has no `tx` param (owns its own transaction via `seedCatalog`), matching the literal ARCHITECTURE.md signature.

## Notes

- Branch: `feat/p4-exercise-library`, created off freshly-pulled `main`
  (P3 already merged, PR #4).
- Plan file: `plans/2026-08-06-p4-exercise-library.md`.
- Two pre-existing gaps found and folded into scope: catalog seeding never wired
  into boot, and a field-name mismatch between `build-catalog.ts` output
  (`primaryMuscles`/`secondaryMuscles`) and `catalogSeeder.ts`'s expected input
  (`muscles: {slug, role}[]`) that would otherwise silently seed every catalog
  exercise with zero muscles.
- Architecture snapshot (`docs/architecture-snapshot.md`) is stale (last commit
  `0025ae8`, docs changed since at `0a3405b`) - regeneration deferred to Step 10
  docs-agent pass rather than orchestrator-authored now, per the "never author
  content directly" global rule.
