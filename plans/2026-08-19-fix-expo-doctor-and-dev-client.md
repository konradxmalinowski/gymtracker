# Fix: Expo SDK version drift (CI expo-doctor failure) and stale dev-client native module

## Problem summary

Two related but distinct issues were reported:

1. **CI failing on GitHub**: the `Expo doctor` step in `.github/workflows/ci.yml` has
   been failing since the P10 merge (confirmed via `gh run list`/`gh run view` on runs
   32137790325, 32177110869, 32181298938, 32286493324) - Typecheck, Lint, Format check,
   Test, and Dependency audit all pass; only `expo-doctor`'s "packages match versions
   required by installed Expo SDK" check fails. 10 packages in `package.json` are
   behind the versions expected by the installed Expo SDK (57.0.14): `expo`,
   `expo-constants`, `expo-dev-client`, `expo-file-system`, `expo-image-picker`,
   `expo-linking`, `expo-notifications`, `expo-router`, `expo-sharing`,
   `expo-splash-screen`.

2. **Device crash on `npx expo start`**: `Cannot find native module 'ExpoSharing'`,
   thrown at the top-level `import * as Sharing from 'expo-sharing'` in
   `WorkoutSummaryScreen.tsx`. The accompanying `WARN "./workout/summary/[sessionId].tsx"
   is missing the required default export` is a downstream symptom, not a separate bug -
   `app/workout/summary/[sessionId].tsx` has a correct `export default`; the module
   simply never finishes evaluating because the import throws first. Root cause: the
   dev-client binary currently installed on the test phone predates `expo-sharing`
   (added in P9) and does not have that native module compiled in - this is a stale
   native build, not a code defect. Per `CLAUDE.md`'s own phase-by-phase history, a
   dev-client rebuild has been offered and deferred every phase since P4 (see memory
   `feedback_build_verification`); this is the first time it has caused a real,
   user-facing failure.

## Acceptance criteria

- `npx expo-doctor` passes locally and in CI (all 10 packages aligned to Expo SDK
  57.0.14).
- CI (`.github/workflows/ci.yml`) is green on the fix branch.
- A new Android development-client build is produced via EAS
  (`eas build --profile development --platform android`) that includes `expo-sharing`
  and `react-native-view-shot`, ready for the user to install on their phone.
- `CLAUDE.md`'s P9 paragraph about the `expo-sharing` config plugin being "deliberately
  left unregistered" is corrected to match the now-registered plugin in
  `app.config.ts`.

## User decisions (already made)

- Dependency sync: run `npx expo install --fix` rather than hand-editing each version.
- Dev-client rebuild: trigger an EAS cloud development build now, for Android only.
- `expo-sharing` plugin registration in `app.config.ts` (already added locally,
  uncommitted): keep it, update `CLAUDE.md` to match rather than reverting.
- Untracked `Cel funkcji.md`: leave untouched, out of scope.

## Task shape and scaling

Single application (React Native/Expo mobile), three independent, disjoint-file-set
sub-tasks - run in parallel, no plan-file-per-application split needed:
- Dependency version sync (frontend-agent) - `package.json`, `package-lock.json`.
- Docs correction (docs-agent) - `CLAUDE.md`.
- EAS development build trigger (devsecops-agent) - no repo files, just runs
  `eas build` and reports the build URL/status.

No backend/database layer is touched. This is a bug-fix/maintenance task, not a new
feature - Steps 6-10 still apply but scaled to the size of the change (see below).

## Platform

Cross-platform mobile (Expo/React Native), Android target for the dev-client build per
user's explicit choice this pass (iOS not requested).

## Affected layers

Frontend/mobile-client dependency management, DevOps (EAS build), documentation. No
API, schema, or auth impact.

## Step-by-step sequence

1. frontend-agent: `npx expo install --fix`, verify `npx tsc --noEmit`, `npx eslint .`,
   and `npx expo-doctor` all pass afterward. Confirm no breaking changes in the bumped
   packages' changelogs (patch-level bumps only, per expo-doctor's own report).
2. docs-agent: update the `expo-sharing` config-plugin paragraph in `CLAUDE.md`.
3. devsecops-agent: trigger `eas build --profile development --platform android`,
   report the build URL and status back (build itself is async/cloud-side; this
   workflow does not block on the build finishing before opening the PR, since
   installing it on the phone is a manual step for the user afterward).
4. Integrate, review, verify CI is green, commit (split: deps commit, docs commit),
   push, open PR.

## Error handling strategy

If `expo-doctor` still fails after the sync (e.g. a package needs a non-patch bump),
stop and report the specific package/version gap to the user rather than force-bumping
past a patch version silently.

## Edge cases

- Lockfile-only diff noise: `package-lock.json` will have a large mechanical diff from
  the version bumps - expected, not a sign of a broader dependency change.
- EAS build failure (e.g. credentials, quota): report the failure to the user rather
  than retrying silently.

## Feature-flag decision

Not applicable - project has no feature-flag system (per CLAUDE.md).

## NFR decisions

Not applicable - no non-trivial NFR surfaced for this maintenance fix.

## Agent delegation plan

| Sub-task | Agent | Files owned | Runs |
|---|---|---|---|
| Dependency version sync + verification | frontend-agent | `package.json`, `package-lock.json` | parallel |
| CLAUDE.md correction | docs-agent | `CLAUDE.md` | parallel |
| EAS development build (Android) | devsecops-agent | none (external trigger only) | parallel |
