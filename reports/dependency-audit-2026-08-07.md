# Dependency Audit Report

**Date**: 2026-08-07
**Scope**: `npm install` deprecation warnings (whatwg-encoding, inflight, domexception, abab, uuid, glob) plus a standard `npm audit` pass over the full install
**Triggered by**: deprecation warnings observed on `npm install`
**Agent**: security-agent-sonnet (routine scope)
**Environment**: node v24.14.1, npm 11.14.1

No files were modified. This is an audit/report-only pass; `package.json` and `package-lock.json` are untouched.

## Summary

`npm audit` reports **18 advisories (10 high, 8 moderate, 0 critical)**, all rooted in three underlying packages: `image-size`, `metro`/`metro-config`/`metro-transform-worker`, and `uuid`. All 18 are build-tooling dependencies (Metro bundler, Expo CLI/config-plugins, Xcode project manipulation) that run on the developer/CI machine during `expo start` / `expo export` / `eas build` / `expo prebuild` - none of them ship inside the compiled app binary that end users install. None are reachable from application runtime code.

Of the six deprecated packages named in the `npm install` warnings, exactly one - `uuid@7.0.3` - is also a live `npm audit` advisory. The other five (`whatwg-encoding`, `inflight`, `domexception`, `abab`, `glob`) are deprecation notices only; `npm audit` does not flag any of them against this install.

## 1. Actual `npm audit` findings (CVE-level)

| Package | Severity | Advisory | Root cause package |
|---|---|---|---|
| `image-size` | HIGH | [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) - ICNS parser infinite-loop DoS | direct |
| `image-size` | HIGH | [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) - JXL/HEIF parser infinite-loop DoS | direct |
| `metro`, `metro-config`, `metro-transform-worker`, `@expo/metro`, `@expo/metro-config`, `@expo/cli`, `@expo/config`, `@expo/config-plugins`, `@expo/prebuild-config`, `@expo/inline-modules`, `@expo/local-build-cache-provider`, `expo`, `expo-splash-screen`, `@react-native/community-cli-plugin`, `react-native` | HIGH/MODERATE | inherited from `image-size` (via `metro`) and `xcode`/`uuid` (via `@expo/config-plugins`) | transitive fan-out |
| `xcode` | MODERATE | inherited - depends on vulnerable `uuid` | transitive |
| `uuid` (`<11.1.1`, installed `7.0.3`) | MODERATE | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) - missing buffer bounds check in v3/v5/v6 generation when a buffer is manually supplied | direct |

**18 total: 10 high, 8 moderate, 0 critical.** Full chain: `image-size` and `uuid` are the two actual CVE sources; every other flagged package (`metro*`, `@expo/*`, `expo`, `expo-splash-screen`, `react-native`, `xcode`) is flagged only because it transitively depends on one of those two.

**Reachability**: `image-size` is pulled in by `metro` (the Expo/React Native bundler) to size assets during bundling/export - it runs on the build machine, never on an end-user device, and the app doesn't accept untrusted ICNS/JXL/HEIF files as user input at runtime (`GymTracker` is offline-only, no image upload of that kind - avatar/exercise images go through `expo-image-picker`, a different code path entirely). `uuid`/`xcode` are used by `@expo/config-plugins` to manipulate the generated `.xcodeproj` during native prebuild - also build-machine-only. **No CRITICAL findings; nothing reachable from shipped runtime code.**

`npm audit fix --force` reports a "fix" that resolves to `expo@53.0.27` - this is *older* than the currently installed `expo@57.0.11`, i.e. npm's automatic resolver found no forward fix and would force a major downgrade. **Do not run this** - it would break the app (P4's completed work targets Expo SDK 57). There is currently no available upgrade path that clears these advisories without either an upstream fix from Expo/Metro/xcode maintainers or dropping Expo's own tooling.

## 2. Deprecated packages: origin and direct-dependency ownership

Traced via `npm ls <package>` against the current lockfile.

| Deprecated package | Direct dependency chain | Owning direct dependency | Currently latest? |
|---|---|---|---|
| `whatwg-encoding@2.0.0` | `jest-expo@57.0.3` -> `jest-environment-jsdom@29.7.0` -> `jsdom@20.0.3` -> `whatwg-encoding@2.0.0` (also via `html-encoding-sniffer`) | `jest-expo` | yes (57.0.3 is latest) |
| `domexception@4.0.0` | `jest-expo@57.0.3` -> `jest-environment-jsdom@29.7.0` -> `jsdom@20.0.3` -> `domexception@4.0.0` | `jest-expo` | yes |
| `abab@2.0.6` | `jest-expo@57.0.3` -> `jest-environment-jsdom@29.7.0` -> `jsdom@20.0.3` -> `abab@2.0.6` (also via `data-urls`) | `jest-expo` | yes |
| `inflight@1.0.6` | two independent paths: (a) `jest@29.7.0` -> `@jest/core` -> `{@jest/reporters, jest-config, jest-runtime}` -> `glob@7.2.3` -> `inflight`; (b) `@react-native/jest-preset@0.86.2` -> `babel-jest@29.7.0` -> `babel-plugin-istanbul@6.1.1` -> `test-exclude@6.0.0` -> `glob@7.2.3` -> `inflight` | `jest` (path a) and `@react-native/jest-preset` (path b) | `jest`: no, 30.4.2 exists; `@react-native/jest-preset`: yes, 0.86.2 is latest |
| `glob@7.2.3` | same two paths as `inflight` above | same as above | same as above |
| `glob@9.3.5` | `babel-plugin-module-resolver@5.0.3` -> `glob@9.3.5` | `babel-plugin-module-resolver` | yes (5.0.3 is latest) - note: glob@9 is itself deprecated but does **not** depend on `inflight` (glob dropped `inflight` starting at v9), so this instance carries no `inflight` risk |
| `uuid@7.0.3` | `expo-splash-screen@57.0.5` -> `@expo/config-plugins@57.0.7` -> `xcode@3.0.1` -> `uuid@7.0.3` | `expo-splash-screen` | yes (57.0.5 is latest) |

Confirms the task's working assumption: every deprecated package traces back to test tooling (`jest`, `jest-expo`, `@react-native/jest-preset`, `babel-plugin-module-resolver`) or Expo's own build tooling (`expo-splash-screen` -> `@expo/config-plugins` -> `xcode`) - none of it is pulled in by application code or by a dependency the app imports at runtime.

## 3. Would bumping the direct dependency clear each one?

- **`jest-expo` (whatwg-encoding, domexception, abab)**: No. `jest-expo@57.0.3` is already the latest release and it hard-pins `jest-environment-jsdom: ^29.2.1`, which resolves to `jsdom@^20.0.0` - the last jsdom major still depending on `abab`/`domexception`/`whatwg-encoding` for encoding/exception polyfills. `jest-environment-jsdom@30.4.1` (latest) moved to `jsdom@^26.1.0`, and jsdom 26+ dropped all three packages in favor of native platform APIs (`jsdom@latest`, checked directly, no longer lists any of them as a dependency). This is baked into `jest-expo`'s own dependency tree tied to Jest 29 - it will clear automatically once Expo ships a `jest-expo` release built against `jest-environment-jsdom@30.x`. **Not fixable today by bumping anything in this project's `package.json`.**

- **`@react-native/jest-preset` (one of the two `inflight`/`glob@7.2.3` paths)**: No. Already at latest (0.86.2, matches the installed React Native 0.86.2). It hard-pins `babel-jest: ^29.7.0`, which still depends on `babel-plugin-istanbul@6.1.1` -> `test-exclude@6.0.0` -> `glob@7.2.3` -> `inflight`. Newer `babel-plugin-istanbul@8.0.0` depends on `test-exclude@^7.0.1`, and newer `test-exclude@8.0.0` moved to `glob@^13.0.6` (no `inflight`) - but nothing in this project can force that jump; it's owned entirely by `@react-native/jest-preset`'s pin, which is versioned in lockstep with React Native itself. **Not fixable without an RN-tooling major bump, out of scope for a routine dependency bump.**

- **`jest` (the other `inflight`/`glob@7.2.3` path)**: Partially yes. `package.json` currently caps it at `^29.7.0`; `jest@30.4.2` is available and its `jest-config`/`jest-runtime` moved to `glob@^10.5.0`, which does not depend on `inflight`. Bumping the `jest` devDependency to `^30` would clear *this* path. However, this is a semver-major jump for the test runner itself while `jest-expo@57.0.3` (the project's Jest preset, pinned to Expo SDK 57) still declares `@jest/globals: ^29.2.1` and other 29.x-line peer expectations - compatibility with Jest 30's changed config schema and reporters is not guaranteed and hasn't shipped as an Expo-supported combination yet. **Recommend testing this in isolation (run the full 473-test suite against `jest@30`) before adopting - do not do it as a blind version bump alongside this report.**

- **`babel-plugin-module-resolver` (glob@9.3.5)**: Already latest (5.0.3). No newer version exists to change this, and it's moot anyway since glob@9 doesn't carry `inflight`.

- **`expo-splash-screen` (uuid@7.0.3)**: No. Already at latest (57.0.5). The old `uuid@7.0.3` is pinned by `xcode@3.0.1`, which is itself pinned by `@expo/config-plugins@57.0.7`. This is the one deprecated package that is also a real `npm audit` advisory (moderate, GHSA-w5hq-g745-h8pq) - and it has no fix available without Expo/`xcode` upstream releasing a bump. **Not fixable today.**

## 4. The `glob@7.2.3` "widely publicized security vulnerabilities" claim

`npm audit` does **not** show any advisory against `glob@7.2.3` (or `glob@9.3.5`, `inflight`, `whatwg-encoding`, `domexception`, or `abab`) in this project's install - none of the five non-`uuid` deprecated packages appear in the `npm audit --json` vulnerabilities map at all. The deprecation notice's "widely publicized security vulnerabilities" line is glob's own generic, template deprecation message (glob prints the same boilerplate for every pre-v9 install regardless of whether a specific CVE applies to the resolved version graph here) - it is not evidence of a live, exploitable advisory against this project's lockfile. Confirmed via direct diffing of the audit JSON's `vulnerabilities` keys against all six package names.

The one exception, as noted above, is `uuid@7.0.3` - that one both carries a deprecation warning *and* shows up as a genuine moderate-severity `npm audit` finding (GHSA-w5hq-g745-h8pq).

## Recommendations

**Safe to update now** (would clear a deprecation warning cleanly, low risk):
- None of the six named packages have a zero-risk, drop-in fix available today. Every direct dependency that owns one of them (`jest-expo`, `@react-native/jest-preset`, `babel-plugin-module-resolver`, `expo-splash-screen`) is already pinned at its latest published version.

**Worth testing, not blind-applying** (medium risk, real fix if it works):
- Bump `jest` devDependency from `^29.7.0` to `^30.x`. This would eliminate the `jest`-owned half of the `glob@7.2.3`/`inflight` chain. Requires running the full Jest suite (473 tests per `CLAUDE.md`) against Jest 30 in isolation first, since `jest-expo@57.0.3`'s peer expectations are still 29.x-line and compatibility with Jest 30 is unverified for this Expo SDK/RN version combination. Do not bundle this with an unrelated change - if it breaks the suite, it's not a routine fix.

**Accept as unfixable transitive noise** (no action available):
- `whatwg-encoding@2.0.0`, `domexception@4.0.0`, `abab@2.0.6` - baked into `jest-expo@57.0.3`'s (latest) pin of `jest-environment-jsdom@^29.2.1` -> `jsdom@^20.0.0`. Clears automatically on a future `jest-expo` release built against Jest 30/jsdom 26+.
- `inflight@1.0.6` / `glob@7.2.3` via `@react-native/jest-preset` - baked into React Native's own tooling, versioned in lockstep with the installed RN version (0.86.2, latest).
- `glob@9.3.5` via `babel-plugin-module-resolver` - already latest; deprecated but carries no `inflight` dependency and no live advisory.
- `uuid@7.0.3` via `expo-splash-screen` -> `@expo/config-plugins` -> `xcode` - already latest `expo-splash-screen`; this is both deprecated *and* a genuine moderate CVE (GHSA-w5hq-g745-h8pq), but with zero fix surface in this project until `@expo/config-plugins` or `xcode` upstream bumps their own `uuid` pin. Build-machine-only exposure (native prebuild's Xcode project manipulation), not reachable from the shipped app.

**On the 18 `npm audit` findings generally**: all trace to `image-size` (2 HIGH DoS advisories) and `uuid` (1 MODERATE, the same one flagged above) via Metro/Expo CLI/config-plugins build tooling. No CRITICAL findings. No fix is currently available that doesn't force a major downgrade of `expo` (npm's suggested `--force` fix path is a regression, not a fix - do not run it). Re-run this audit periodically (e.g. next dependency-touching PR, or on a monthly cadence) to catch when Expo/Metro/xcode ship the upstream fixes.

## Dependency audit tool output

`npm audit` (summary): 18 vulnerabilities (0 critical, 10 high, 8 moderate, 0 low) across 1333 total resolved packages (641 prod, 674 dev, 85 optional).
