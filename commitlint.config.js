/**
 * Conventional Commits, enforced by the `.husky/commit-msg` hook.
 *
 * ARCHITECTURE.md section 15.2 derives the version and CHANGELOG from these
 * messages, and docs/ROADMAP.md closes each phase with exactly one commit - so
 * a malformed message is not a style nit here, it silently breaks release
 * tooling later. `type-enum` is left at the config-conventional default rather
 * than narrowed to the four types the brief names (`feat`/`fix`/`refactor`/
 * `chore`), because `docs`, `test`, `build` and `ci` commits are already
 * unavoidable in this repo and rejecting them would just train the author to
 * pass `--no-verify`.
 *
 * @type {import('@commitlint/types').UserConfig}
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // The default 100-char header limit is tight for a scoped phase commit
    // like `feat(workout-logging): ...`; the body limit stays default.
    'header-max-length': [2, 'always', 120],
  },
};
