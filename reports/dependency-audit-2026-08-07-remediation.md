# Dependency Audit Remediation Report

**Date**: 2026-08-07
**Scope**: `package.json` `overrides` field, `package-lock.json` regeneration - remediation follow-up to `reports/dependency-audit-2026-08-07.md`
**Triggered by**: `audit:ci` (`npm audit --audit-level=high`) failing on `main` since at least 2026-08-06, confirmed via `gh run list --branch main`
**Agent**: security-agent-sonnet (routine scope - `/dependency-audit`)
**Environment**: node v24.14.1, npm 11.14.1

This is a fix pass, not a re-audit from scratch. The original audit
(`reports/dependency-audit-2026-08-07.md`) already traced all 18 advisories to
exactly two root packages - `image-size` and `uuid` - and confirmed both are
build/dev-tooling only (Metro bundler, Expo CLI's Xcode project manipulation
during prebuild), never reachable from shipped runtime code. That trace is not
repeated here; see the original report for the full dependency chains. Its
findings are left untouched as an accurate historical record of the audit-only
pass - this report documents what was actually fixed.

## Summary

One of the two root packages was fixable via `npm overrides`; the other was not,
because no patched version of it exists yet upstream.

| Package | Before | Findings | Fix attempted | Result |
|---|---|---|---|---|
| `uuid` | `7.0.3` (via `xcode`) | 1 advisory (MODERATE) x8 dependent-path listings | `overrides: { "uuid": "^11.1.1" }` -> resolved `11.1.1` | **Fixed.** 0 findings remain. |
| `image-size` | `1.2.1` (via `metro`) | 2 advisories (HIGH) x10 dependent-path listings | none - see below | **Not fixable.** No override applied. |

`npm audit --audit-level=high` **still exits 1** (fails) after this fix, and will
continue to do so until `image-size` ships a patch upstream. This is the one
finding from the task's "if it can't be cleanly fixed" clause - see section 3.

## 1. `uuid` - fixed

**Advisory**: [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
(missing buffer bounds check in `v3()`/`v5()`/`v6()` when an external buffer is
supplied). Advisory page confirms affected ranges `<11.1.1`, `>=12.0.0 <12.0.1`,
`>=13.0.0 <13.0.1`, with patched versions `11.1.1`, `12.0.1`, `13.0.1` (latest
overall on the registry is `14.0.1`).

Override applied:

```json
"overrides": {
  "uuid": "^11.1.1"
}
```

Chose `^11.1.1` over jumping straight to the registry's `14.0.1` - it's the
minimal version that clears the advisory, keeping the forced jump as small as
possible while still landing on a currently-maintained major. `xcode@3.0.1` (the
sole consumer, via `@expo/config-plugins` -> `expo-splash-screen`) declares
`"uuid": "^7.0.3"` in its own `package.json` and its only usage
(`node_modules/xcode/lib/pbxProject.js:90`, `uuid.v4()`) calls a named export
that has been stable across uuid's CJS builds since v8 (uuid dropped the v3-era
default export in v9, not the `v4` named export itself) - so forcing past
xcode's own declared range is safe here despite being a semver-major override.

Resolved version confirmed via `npm ls uuid`: `uuid@11.1.1` under
`xcode@3.0.1` under `@expo/config-plugins@57.0.7` under `expo-splash-screen@57.0.5`.
`npm audit`'s MODERATE count dropped from 8 to 0 - the entire `uuid`/`xcode`
finding chain is gone.

## 2. `image-size` - not fixable, no override applied

**Advisories**:
[GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) (ICNS
parser infinite-loop DoS) and
[GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) (JXL/HEIF
parser infinite-loop DoS).

Checked both advisory pages directly (not just `npm audit`'s summary) before
attempting an override, per the task's instruction to confirm a patched version
actually exists first. Both list:

- **Affected versions**: `<= 2.0.2`
- **Patched versions**: `None`

`2.0.2` is also npm's current latest published `image-size` release (confirmed
via `npm view image-size versions` - the list ends at `2.0.2`, no newer release
exists). In other words, every version of `image-size` that has ever been
published, including the one on the registry today, is inside the vulnerable
range. There is no version to override to that clears either advisory - the
`overrides` mechanism can only pin to an already-published fixed version, and
none exists yet.

Given that, no override was attempted for `image-size` (not even a bump from the
currently-resolved `1.2.1` to the latest `2.0.2` - that would be a real
compatibility risk for Metro's bundling for zero security benefit, since `2.0.2`
carries the identical vulnerability). This isn't a case of "the override broke
something" - it's that no fix exists to try in the first place, so the safer
and more honest action was not to touch it.

`npm audit`'s HIGH count is unchanged: still 10 (the same two advisories, fanned
out across `metro`, `metro-config`, `metro-transform-worker`, `@expo/metro`,
`@expo/cli`, `@expo/metro-config`, `expo`, `@react-native/community-cli-plugin`,
`react-native` - all consumers of `metro`, which is the sole path `image-size`
enters through).

## 3. Residual CI impact and resolution

Because of the unfixed `image-size` findings, `npm audit --audit-level=high`
**still exited 1** after the `uuid` fix above. The `audit:ci` gate in
`.github/workflows/ci.yml` would have continued to fail on `main`, for a
different reason than before (down from 18 findings across two packages to 10
findings in one package with zero upstream fix available). This was flagged as
an open decision with three options rather than applied unilaterally. The
decision has since been made.

**Chosen: scoped audit-level exception for these two specific advisory IDs**
(the second of the three original options - see the two not chosen, below).
`audit-ci` (`^7.1.0`) now replaces the bare
`npm audit --audit-level=high` call in `audit:ci` (`package.json`'s
`"audit:ci": "audit-ci --config ./audit-ci.jsonc"`), configured via the new
`audit-ci.jsonc`, which allowlists exactly `GHSA-w3rx-r6r6-pgpr` and
`GHSA-5p2g-fcmc-qvqq` with dated justification comments inline in the config
(build-tooling-only reachability, "Patched versions: None" as of 2026-08-07,
and a note to delete each entry once `image-size` ships a fix).
`.github/workflows/ci.yml`'s audit step comment was updated to explain why
`audit-ci` is used instead of bare `npm audit`. This was chosen over option 1
because it keeps the gate meaningfully strict for every other advisory rather
than accepting an indefinitely red check that trains reviewers to ignore
failures, and each exception is self-documenting and easy to spot and remove
the moment `image-size` publishes a patch. It was verified empirically to be a
genuinely advisory-scoped exception rather than a severity-threshold bypass: an
allowlist containing only one of the two GHSA ids still fails the build on the
other.

The two options not chosen, for the record:

1. **Accept and monitor.** Leave `audit:ci` as-is (failing), track `image-size`
   upstream for a patched release, and re-run `npm audit` on a recurring
   cadence. Considered, not chosen - would have kept CI red indefinitely with
   no way to distinguish "known issue" from "new regression" at a glance.
2. **Not chosen, not recommended**: lowering `audit:ci`'s `--audit-level`
   threshold (e.g. to `critical`) or adding a blanket `npm audit` ignore. Still
   off the table - it would mask any future HIGH finding in an unrelated
   package, which is a bigger risk than the two known ones today.

The actual allowlist configuration lives in `audit-ci.jsonc` at the repo root -
that file, not this report, is the source of truth for which advisories are
currently exempted and why.

## 4. Verification results

All run against the working tree with the `uuid` override applied and
`package-lock.json` regenerated (plain `npm install`, no full reinstall needed -
`npm ls` showed only the single `uuid` package changed resolution).

| Check | Command | Result |
|---|---|---|
| Typecheck (app) | `npx tsc --noEmit` | Pass, 0 errors |
| Typecheck (scripts) | `npx tsc --noEmit -p scripts/tsconfig.json` | Pass, 0 errors |
| Lint | `npx eslint .` | Pass, 0 errors, 12 pre-existing warnings (all `no-require-imports` in test mock setup, unrelated to this change) |
| Tests | `npx jest --ci` | Pass - 86 suites, 782 passed + 1 skipped (783 total). Higher than `CLAUDE.md`'s "473 tests" figure because that figure is from P4; the suite has grown through P5/P6 since - not a regression from this change, no app code was touched. |
| Bundler | `npx expo export --platform ios` | Pass - exported successfully, `dist/_expo/static/js/ios/entry-*.hbc` (7.2MB) produced, confirms Metro still bundles correctly with the unchanged `image-size` version under the new `uuid` override |

`dist/` (the export output) is gitignored and was removed after verification -
not part of the diff.

## 5. Files changed

- `package.json` - added `overrides.uuid = "^11.1.1"`
- `package-lock.json` - regenerated via `npm install`; only `uuid`'s resolved
  version and its `bin` path changed (`7.0.3` -> `11.1.1`)
- `reports/dependency-audit-2026-08-07-remediation.md` - this file (new; the
  original `reports/dependency-audit-2026-08-07.md` audit-only report is left
  unmodified as the historical record of what was found before this fix)

No application code was touched, per this task's owned-files scope.

## `npm audit` output (after fix)

```
10 high severity vulnerabilities

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force
```

(`npm audit fix --force` still resolves to downgrading `expo` to `53.0.27` for
the `image-size` chain - still not an acceptable fix, same conclusion as the
original report. Do not run it.)

`npm audit --json` metadata: `{critical: 0, high: 10, moderate: 0, low: 0, info: 0, total: 10}`
(down from `{critical: 0, high: 10, moderate: 8, low: 0, info: 0, total: 18}` before this fix).
