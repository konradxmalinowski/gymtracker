# Security Audit Report

**Date**: 2026-08-19
**Scope**: `fix/expo-doctor-sdk-sync` - dependency-only maintenance fix. `package.json`/
`package-lock.json` (10 patch-level Expo SDK 57 package bumps via `npx expo install
--fix`, fixing a CI `expo-doctor` failure) and `app.config.ts` (one-line
`'expo-sharing'` config-plugin registration). No application code touched.
**Triggered by**: `expo-doctor` CI failure - dependency versions had drifted out of
sync with the installed Expo SDK (57.0.14).
**Agent**: security-agent-sonnet (routine scope)

## Summary

Total: 0 - Critical: 0 | High: 0 | Medium: 0 | Low: 0 | Info: 3

No findings introduced by this diff. One pre-existing high-severity advisory chain
(`image-size` via `metro`) remains, unaffected by these bumps - see Dependency Audit
below. Nothing blocks this commit.

## Dependency Audit

`npm audit --audit-level=high`:

```
8 high severity vulnerabilities
image-size  *  (ICNS/JXL/HEIF parser infinite-loop DoS - GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq)
  <- metro <- @expo/metro <- @expo/cli <- expo
```

- **Pre-existing, not introduced by this diff.** Confirmed by diffing this branch's
  `package-lock.json` against `main`'s: `metro`, `metro-config`, `metro-transform-worker`,
  and `image-size` do not appear anywhere in the list of packages whose version
  changed (see "Lockfile diff verification" below) - they are untouched by the
  `expo install --fix` run. `main`'s own lockfile already resolves `image-size@^1.0.2`
  via `metro`, at the same vulnerable range, before this branch's changes.
- Fix requires `npm audit fix --force`, which the advisory itself flags as installing
  `expo@53.0.27` - a major-version downgrade, not a real remediation path for an app
  pinned to SDK 57. No fix is currently available within the SDK 57 line.
- Recommendation: track upstream (`metro`/`expo` SDK release notes) for when a
  patched `image-size` lands inside the SDK 57 dependency tree; no action available
  in this diff. Not a new regression - carry forward as a known, accepted gap the
  same way this project already tracks other non-blocking items.

## Lockfile diff verification (package.json / package-lock.json)

Compared `package.json` and `package-lock.json` on this branch against `main` head
(`7b2e70e`) directly (not just read the diff) to confirm scope:

- **`package.json`**: exactly the 10 named packages changed their version range -
  `expo` (`~57.0.12` -> `~57.0.14`), `expo-dev-client`, `expo-image-picker`,
  `expo-linking`, `expo-notifications`, `expo-router`, `expo-sharing`,
  `expo-splash-screen` show an explicit range bump; `expo-constants` and
  `expo-file-system` keep the same declared range (their existing range already
  permitted the newer patch resolved in the lockfile). No other `package.json` line
  changed.
- **`package-lock.json`, added/removed top-level entries**: exactly one new entry,
  `node_modules/sandbox-cli-detector`, added; zero removed. Programmatically diffed
  every `packages` key between the two lockfiles to confirm this (not a visual scan).
- **`package-lock.json`, version-only changes**: 28 entries changed version, and
  every one of them is either one of the 10 named packages or an Expo-ecosystem
  transitive dependency pulled in by them (`@expo/cli`, `@expo/config`,
  `@expo/config-plugins`, `@expo/fingerprint`, `@expo/inline-modules`, `@expo/log-box`,
  `@expo/metro-runtime`, `@expo/prebuild-config`, `@expo/router-server`, `@expo/ui`,
  `agent-cli-detector`, `babel-preset-expo`, `expo-asset`, `expo-dev-launcher`,
  `expo-dev-menu`, `expo-modules-autolinking`, `expo-modules-core`, `expo-server`).
  All within the same SDK 57 line, all patch-level. No unrelated package (anything
  outside the Expo ecosystem) had its version touched.
- **`sandbox-cli-detector@0.2.0` traced and confirmed legitimate**: `npm why
  sandbox-cli-detector` shows it is a real transitive dependency of
  `@expo/cli@57.0.16` (itself pulled in by the `expo@57.0.14` bump), not an
  unrelated or manually-added package. Registry metadata (`npm view
  sandbox-cli-detector`) confirms a small, single-maintainer, MIT-licensed,
  publicly-sourced (`github.com/davidmokos/sandbox-cli-detector`) CLI-environment-
  detection utility (`e2b`/`vercel-sandbox`/`replit`/`codespaces`/`gitpod` etc.) -
  consistent with `@expo/cli`'s own environment-detection/telemetry needs, and its
  sibling `agent-cli-detector` (same author pattern) was already present in `main`'s
  lockfile. No `postinstall`/lifecycle scripts of note beyond its own `bin` entry.
  Flagged here for visibility since it is a genuinely new package added to the tree
  (with its own `bin` script), not because it is a concern.

**Verdict: the `package.json`/`package-lock.json` diff is scoped exactly to the 10
named packages plus their expected transitive lockfile churn - no scope creep.**

## `app.config.ts` diff verification

```diff
   plugins: [
     'expo-router',
     'expo-sqlite',
+    'expo-sharing',
```

Confirmed via `git diff app.config.ts` that this is the only change in the file - no
other line touched.

Read `node_modules/expo-sharing/plugin/build/withShareExtension.js` (the plugin's
actual entry point, not just its README/doc claims) to confirm default behavior with
no options object passed:

```js
const iosEnabled = props?.ios?.enabled ?? false;
const androidEnabled = props?.android?.enabled ?? false;
if (iosEnabled) { /* adds iOS share-extension target, app-group entitlements, ... */ }
if (androidEnabled) { /* adds Android intent filters, ... */ }
return withPlugins(config, plugins); // plugins === [] when both flags are false
```

Since `app.config.ts` registers the plugin as the bare string `'expo-sharing'` (not
`['expo-sharing', { ios: { enabled: true }, ... }]`), `props` is `undefined` at
runtime, both `iosEnabled` and `androidEnabled` default to `false`, and `plugins`
stays an empty array - `withPlugins(config, [])` returns the config unmodified. No
iOS entitlements (`withConfig`/`withAppGroupId`), no share-extension Xcode target, no
Android intent filters, and no new manifest permissions are added by this
registration. This confirms - by reading the plugin's own source rather than taking
the prior doc claim on faith - the same "genuine no-op with no options passed"
conclusion `CLAUDE.md` already recorded when `expo-sharing` was first installed in
P9.

**Verdict: the `app.config.ts` diff is exactly the single plugin-registration line
described, and it introduces zero new iOS/Android permissions, entitlements, or
capabilities by default.**

## Findings

None.

## Additional notes (informational, not findings)

- **INFO-001**: The `image-size`/`metro` high-severity advisory chain (see Dependency
  Audit) is a pre-existing gap, already present on `main` before this branch, and is
  unaffected by this diff's package bumps - confirmed by the version-diff list above
  showing `metro` untouched. Not this diff's to fix; no SDK 57-compatible patched
  version exists yet.
- **INFO-002**: All 10 bumped packages stay within the same `~57.0.x` semver-tilde
  range family already declared in `package.json` before this change (patch-level
  only) - no major or minor SDK jump, consistent with an `expo-doctor`-driven sync
  fix rather than a feature-motivated upgrade.
- **INFO-003**: `sandbox-cli-detector` (new transitive dependency, see above) ships a
  `bin` entry but is not itself invoked by anything in this project's own scripts
  (`grep -rn "sandbox-cli-detector" package.json scripts/` returns no hits outside
  the lockfile) - it exists purely as `@expo/cli`'s own dependency, exercised (if at
  all) only when `@expo/cli` itself runs, not as a standalone tool this project calls.

## Recommendations (priority order)

1. No action required before commit - zero findings introduced by this diff.
2. Track upstream for a patched `image-size`/`metro` release compatible with Expo SDK
   57; re-run `npm audit --audit-level=high` once one ships. Non-blocking, pre-existing.

## Report file confirmation

Findings saved to `reports/security-2026-08-19-expo-doctor-fix.md` (this file).
