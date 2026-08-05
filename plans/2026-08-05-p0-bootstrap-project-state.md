---
plan: plans/2026-08-05-p0-bootstrap-project.md
branch: chore/p0-bootstrap-project
last_updated: 2026-08-05T01:00:00Z
---

# P0 bootstrap - live state

## Current step

Step 4 - delegation (agents 1 and 2 of 3 done and independently re-verified;
agent 3 of 3, docs-agent, about to be dispatched).

## Pre-P0 setup (complete)

- Greenfield architecture kickoff done and accepted: docs/ARCHITECTURE.md,
  docs/ROADMAP.md, docs/adr/0001-0015 all `accepted`, all open questions
  resolved (D-01..D-12).
- Global git config fixed (corrupted user.name/user.email with literal quote
  characters - fixed by stakeholder request).
- Initial docs commit made on `main`: fbda52d - "docs: establish architecture,
  roadmap, and ADRs for GymTracker".
- GitHub repo created and pushed: https://github.com/konradxmalinowski/gymtracker
  (public).
- Feature branch created: `chore/p0-bootstrap-project` (off `main` at fbda52d).
- docs/architecture-snapshot.md written (synthesis of ARCHITECTURE.md/ROADMAP.md/
  ADRs for future-session reuse, snapshot_commit: fbda52d).
- Stakeholder decisions confirmed for this phase: bundle id
  `com.konradmalinowski.gymtracker`, npm, iOS 15+/Android API 26+, GitHub repo
  public and already created, EAS login pending (stakeholder will run `eas login`
  when asked).

## Per-agent dispatch status

| # | Agent | Status | Summary |
|---|-------|--------|---------|
| 1 | frontend-agent | done | Expo scaffold, strict tsconfig, path aliases, full folder skeleton (110 .gitkeep), eslint layering rules (proven with 4 fixture violations), app.config.ts, app/_layout.tsx + app/index.tsx (real, finished minimal Home screen), theme/tokens.ts (honest P0 subset), domain/Weight.ts + domain/Length.ts (value objects, no stub methods). Independently re-verified by orchestrator: tsc --noEmit clean, eslint clean, prettier --check clean (after a follow-up fix to .prettierignore for docs/plans/errors/reports), expo-doctor 20/20, expo export clean for both platforms, dev server boots and serves the real bundle. Could not verify an actual simulator/device boot (none available in agent's environment) - accepted as sufficient given the export/serve checks. |
| 2 | devsecops-agent | done | Husky/commitlint (verified rejecting a real bad commit message, then a real cleanup), lint-staged, jest-expo + RNTL + fast-check (3 real property tests on Weight, not filler), GitHub Actions CI (statically validated with actionlint, never actually executed - first PR is the real test), eas.json (3 profiles, real EAS project registered: 8d2daf31-1534-4a7d-81ed-8ed9eba57f01 / @konradxmalinowski/gymtracker), Sentry config plugin wired unconditionally with reporting default-off and no committed DSN (caught and avoided a real Expo config-serialization trap: `null` in `extra` becomes `{}`, which is truthy). Independently re-verified by orchestrator: tsc/eslint/prettier clean, jest 3/3 with coverage, expo-doctor 20/20, husky hook files inspected directly. |
| 3 | docs-agent | queued | Blocked on #2, now unblocked. Owns README.md, CLAUDE.md. About to be dispatched. |

## Decisions/notes from agent 1 worth carrying forward

- Added a project-root `domain/` folder (not under any single feature) for
  `Weight.ts`/`Length.ts` since both are used across multiple features
  (workout-logging, body-metrics, statistics) - not explicitly enumerated in
  ARCHITECTURE.md section 9's tree, but consistent with its intent. Added
  `@/domain/*` to tsconfig paths and to the eslint domain-purity file matcher.
  Worth reflecting back into ARCHITECTURE.md section 9 at some point (not
  blocking, cosmetic doc-sync item).
- create-expo-app's current SDK 57 template defaults to a `src/`-nested layout;
  agent rejected that default and scaffolded root-level `app/`, `components/`,
  etc. to match ARCHITECTURE.md exactly.
- `.npmrc` has `legacy-peer-deps=true` (expo-router's optional web-preview deps
  have a peer conflict irrelevant to this mobile-only app).
- A few dependency versions were pinned/adjusted from "latest" for SDK 57
  compatibility: eslint kept on ^9.39.5 (not 10.x, eslint-plugin-react
  incompatibility), @shopify/flash-list and @shopify/react-native-skia pinned
  to versions expo-doctor confirmed as SDK-57-correct.

## Files changed so far (this phase)

Full new-project file tree per frontend-agent's report (package.json,
tsconfig.json, babel.config.js, metro.config.js, app.config.ts, eslint.config.js,
.prettierrc.json, .prettierignore, tailwind.config.js, global.css,
nativewind-env.d.ts, .gitignore, .vscode/, app/_layout.tsx, app/index.tsx,
domain/Weight.ts, domain/Length.ts, domain/index.ts, theme/tokens.ts,
types/css.d.ts, full features/*/{components,hooks,screens,services,domain,
repository,types,index.ts} skeleton, plus empty-dir .gitkeep placeholders across
assets/, components/, database/, hooks/, navigation/, repositories/, services/,
stores/, utils/, __tests__/, .maestro/). Nothing committed yet - still pending
review sign-off on the full phase (steps 2 and 3) before a single P0 commit.

## Non-blocking backlog raised during P0 (not yet actioned)

- Stakeholder's local shell has `NODE_TLS_REJECT_UNAUTHORIZED=0` set - disables
  TLS cert verification for every Node process (npm install, npm audit, EAS
  auth all ran with it). Flagged directly to stakeholder; environment-level, not
  a repo fix. Not tracked further here unless it recurs.
- No `.nvmrc` pinning Node to the `24` CI uses - low-risk one-line follow-up.
- `eas.json` `cli.version` pinned to `>= 20.5.1` (locally installed eas-cli),
  not the `21.5.0` npm currently advertises - bump after a global CLI upgrade.

## Next action

Dispatch docs-agent per the delegation package in
plans/2026-08-05-p0-bootstrap-project.md step 3 (README.md, CLAUDE.md).
