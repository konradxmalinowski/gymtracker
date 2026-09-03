# P14: Data export and import

## Problem summary

Implement P14 ("Data export and import") per `docs/ROADMAP.md` lines 492-506 and
`docs/adr/0013-export-import-formats.md` in full. `features/data-transfer/` is
currently an empty skeleton (component/hooks/screens/services/domain/repository/
types/index.ts subfolders, no implementation) - the last remaining un-built phase
before this session's Android QA sweep (Phase C).

This is Phase B of `plans/2026-08-20-p13-p14-android-qa-sweep.md`, run after Phase
A (P13 body-metrics) was implemented, reviewed, and security-checked (P13's own
commit happens after Phase A's device verification completes - Phase B's
implementation work does not block on that, since it edits a disjoint file set
except two small additive touches to `services/container.ts`/`i18n/catalogs/en.ts`,
both already-settled files from Phase A with no further pending edits).

## Acceptance criteria (from docs/ROADMAP.md P14)

- JSON backup export, streamed to file (never built as one in-memory string -
  ADR-0013's own stated NFR, tested against the 75,000-set fixture).
- JSON import with merge (upsert-by-id, newer `updated_at` wins, idempotent) and
  replace (purge + replace, typed confirmation, automatic pre-replace backup to
  cache dir, path surfaced in the result) modes.
- Import preview screen showing what will be created/changed before anything writes.
- Post-import rebuild sequence: `PersonalRecordService.rebuildAll()`, session totals
  recomputed, FTS index rebuilt, `ProgressPhotoRepository.verifyIntegrity()`, full
  query cache cleared.
- `migrateExport(input)` chain (v1 today, forward-compatible shape for future
  envelope versions).
- CSV export of the app's own layout (one row per set, RFC 4180, `\r\n`, UTF-8 with
  BOM, both `weight_kg` and `weight_lb` columns) and CSV import of that same layout
  (grouped by `(date, session_id)` or `(date, session_title)`, exercise resolution
  chain: slug -> id -> exact name -> diacritic-folded name -> new custom exercise).
  Third-party CSV dialects (Strong/Hevy/FitNotes) are explicitly out of scope
  (ADR-0013, decided).
- Share sheet integration for both export formats (reuse `expo-sharing`, already a
  dependency since P9). "Share progress photos" is a separate action from the JSON/
  CSV export actions.
- Export/import screens live in Settings, with explicit, plainly-worded lossiness
  warnings (CSV loses plans/body-metrics/photos/settings/notes/favorites/
  superset-grouping/drop-set-parentage; JSON backup excludes progress photo binaries
  per ADR-0012, stated in the UI, not just in this doc).

Acceptance (roadmap-stated): E2E flow 7 (export, wipe, import, everything matches);
importing the same file twice creates no duplicates; a malformed file fails
validation with a readable message and zero database writes; exporting the
75,000-set fixture completes without an out-of-memory crash; CSV opens in Excel with
Polish characters intact.

## Task shape and scaling

Single application (this RN/Expo codebase), one feature, but touching virtually
every existing feature's repository read (export) and write (import) paths -
`docs/ARCHITECTURE.md` section 9.1 draws `data-transfer` as the one feature allowed
to depend on everything, built last for exactly this reason. Delegated as one
fullstack-orchestrator dispatch (this feature has no independently-fixed API
contract to split frontend/backend across - the JSON/CSV shapes ARE the contract,
already fully specified by ADR-0013, so backend and frontend can be built against
that fixed spec without a separate contract-negotiation step). fullstack-orchestrator
sub-delegates internally per its own Step 4 (backend-agent-sonnet for
domain/repository/service, database-agent only if any read pattern needs a new
index - unlikely, every source table already has the indexes P2-P12 built - and
frontend-agent for screens/hooks/components).

If fullstack-orchestrator reports this exceeds its standard scope (the destructive
replace-mode import, touching effectively the whole schema, is a real "high blast
radius" case per the routing table), escalate to fullstack-orchestrator-opus rather
than pushing it to grind past its own reported limit.

## Platform

React Native / Expo, same as Phase A. Android-only on-device verification this
session (iOS unverified, standing project note).

## Affected layers

Domain (JSON schema/Zod validators, CSV row mapper, `migrateExport` chain),
repository (`DataTransferRepository`/`SqliteDataTransferRepository` - reads across
every feature's tables, writes via per-aggregate transactions), service
(`DataTransferService` - streamed file I/O, merge/replace orchestration, post-import
rebuild sequence), hooks, screens/components (export screen, import screen, import
preview screen), `services/container.ts` (additive), `navigation/routes.ts`
(additive, likely `profileSettings.dataTransfer` or a new `profile.dataTransfer`
following the same precedent `profile.records`/`profile.history`/`profile.calendar`
already set), i18n catalog additions, docs.

## Step-by-step sequence

1. Delegate full P14 scope to fullstack-orchestrator with this plan file, ADR-0013,
   and the roadmap acceptance bullets above.
2. Review the diff (Step 6), with explicit extra scrutiny on: the replace-mode
   destructive path (must be guarded, must auto-backup first, must be
   all-or-nothing per entity-batch transaction), the streamed-not-in-memory export
   claim (verify it actually streams, not just claims to in a comment), and
   `migrateExport`'s forward-compatibility shape.
3. On-device verify (Step 7) on the same `gymtracker_test` emulator once Phase A's
   fresh dev-client build is confirmed working - exercise: export JSON, export CSV,
   share sheet for both, import preview, merge import (no duplicates on double
   import), replace import (with the auto-backup path surfaced), malformed-file
   rejection, empty-data export.
4. Tests: per this session's explicit user instruction, skip writing new tests this
   pass - run the existing suite as a regression gate only before commit (same
   deviation already applied to Phase A, stated once here for Phase B too).
5. Security check (Step 9, security-agent-sonnet - file I/O, import validation
   parsing untrusted file content, and a destructive whole-database-replace path
   are all real conditional triggers, plus this is explicitly called out in
   ADR-0013 as the app's highest-stakes operation).
6. Docs update (Step 10, docs-agent) - `CLAUDE.md`, `docs/ROADMAP.md`.
7. Commit (Step 11), split by topic.

## API contracts

Not a network API - the "contract" is ADR-0013's JSON envelope shape and CSV column
layout, both already fully specified above/in the ADR. No negotiation needed.

## Error handling strategy

- Export: any file-write failure aborts the whole export, no partial file left
  behind (write to a temp path, rename/move only on full success - same pattern
  this codebase already uses for photo writes per ADR-0012).
- Import: every level Zod-parsed before any row is written (ADR-0013's own stated
  rule); a validation failure produces a readable, specific error and zero writes;
  a mid-import failure (partial batch) rolls back that entity batch's transaction,
  and the overall import is treated as failed (not partially applied) with the
  pre-replace backup (replace mode) as the recovery path.

## Edge cases to address

Empty database export (zero sessions/exercises - must not crash, must produce a
valid minimal envelope); reimporting the exact same JSON file twice (merge mode,
must be a true no-op the second time); importing a JSON file from a newer envelope
version than this app understands (must fail readably, not silently corrupt);
importing a well-formed-but-foreign JSON file (not a gymtracker export at all -
`format` field mismatch, must be rejected before any write); CSV with non-ASCII
(Polish) exercise/session names round-tripping through Excel; CSV row referencing an
unresolvable exercise (must fall back to creating a custom exercise, per ADR-0013,
not silently drop the row); replace-mode import cancelled by the user at the typed
confirmation step (must leave the database untouched, and the pre-replace backup
must still not have been taken, since it only exists to protect an import that
actually proceeds - or if taken pre-confirmation, must be discarded/not surfaced,
whichever the implementing agent's design naturally produces, verified in review).

## Feature-flag decision

Not applicable - project has no feature-flag system.

## NFR decisions

Streamed export (not one `JSON.stringify` call over the whole aggregate) - the
concrete pattern is `FileSystem` batch-appends per entity array, per ADR-0013's own
"Negative consequences" section. This is a hard NFR, not a nice-to-have: verify it
in review by reading the actual write calls, not by trusting a doc comment that
claims it.

## Agent delegation plan

| Sub-task | Agent | Files owned |
|---|---|---|
| P14 full-stack implementation | fullstack-orchestrator (escalate to -opus if it reports exceeding standard scope) | `features/data-transfer/**`, `app/data-transfer/**` or `app/profile/settings/data-transfer*.tsx` (route wrappers), `services/container.ts` (additive), `navigation/routes.ts` (additive), i18n catalog additions |
| Security | security-agent-sonnet (conditional trigger: file I/O, untrusted-input parsing, destructive replace path) | `reports/security-2026-09-0X-p14.md` |
| Docs | docs-agent | `CLAUDE.md`, `docs/ROADMAP.md` |
| Commits | git-commit-agent | per logical group, Conventional Commits |

Tests: explicitly skipped for new authoring this pass per user instruction; existing
suite still run as a regression gate before commit (same deviation as Phase A).
