# Security Audit Report

**Date**: 2026-09-12
**Scope**: Uncommitted working-tree diff on `feat/gravitus-inspired-refresh` (no committed baseline) - plate calculator, "copy previous set" swipe gesture, rep-max table, local workout-reminder notifications, color-token reskin. Full file list per the task brief; verified against `git status --short` / `git diff --stat`.
**Triggered by**: manual request
**Agent**: security-agent-sonnet (routine scope)

## Summary

Total: 3 - Critical: 0 | High: 0 | Medium: 0 | Low: 2 | Informational: 1

Nothing here blocks moving forward.

## Findings

### [SEC-001] `reminders.days` has no array-length cap in its Zod schema - LOW
**Category**: Input Validation
**Location**: `repositories/settings/settingsSchema.ts:80` (`'reminders.days': { schema: z.array(z.number().int().min(0).max(6)), default: [] }`)
**Reproduction**: The schema only bounds each element to `0-6`; it does not bound the array's length or require uniqueness. `RemindersSettingsScreen.handleToggleDay` (the only UI writer) can't produce more than 7 unique entries, so this isn't reachable through normal app use - but a corrupted or hand-edited `app_setting` row (e.g. `[0,0,0,...,0]` repeated hundreds of times) would still pass `safeParse` and be handed to `WorkoutReminderService.reschedule`, which loops once per array entry and calls `Notifications.scheduleNotificationAsync` for each.
**Impact**: In this offline, single-local-user app there's no external attacker who can write to `app_setting` without already having full device/file-system access, at which point far worse is possible anyway - so this is not exploitable in practice. At worst it's a self-inflicted foot-gun (a corrupted settings row causing redundant reschedule work, bounded by `NOTIFICATION_ID_PREFIX + day` deduping identifiers 0-6 regardless of how many times each appears in the array).
**Fix**: Optional hardening, not required: add `.max(7)` to the array schema, matching the real domain constraint (7 weekdays, no duplicates meaningful).

### [SEC-002] `reminders.days`/plate settings have no defense against a corrupted-but-schema-valid value degrading UX rather than failing loudly - INFORMATIONAL
**Category**: Code Quality / Defensive Programming
**Location**: `repositories/settings/SqliteSettingsRepository.ts` (shared pattern, not new to this diff)
**Note**: This is the codebase's existing, already-reviewed convention (silent fallback to default on a corrupt/invalid stored value) applied consistently to all six new keys - `plateCalculator.barWeightKg`, `plateCalculator.ezBarWeightKg`, `plateCalculator.availablePlatesKg`, `reminders.enabled`, `reminders.days`, `reminders.time` all have a real Zod validator with correct type/range/enum and a safe default-fallback, verified by reading `settingsSchema.ts` directly and confirmed by the round-trip test additions in `__tests__/repositories/settings/SqliteSettingsRepository.test.ts`. Recorded here only for completeness, not as a new gap - no action needed.

### [SEC-003] Untracked personal planning notes (`Cel funkcji.md`, `examples.txt`) sitting in the repo root - LOW
**Category**: Sensitive Data Exposure
**Location**: `/Users/konrad.malinowski/Desktop/GymTracker/Cel funkcji.md`, `/Users/konrad.malinowski/Desktop/GymTracker/examples.txt`
**Reproduction**: Both files are untracked (`git status --short` shows `??`), not part of this feature's diff, and contain personal-life to-do/reminder brainstorming in Polish (a future "Daily Goals & Reminders" feature spec, plus unrelated personal reminder ideas - dog walks, water intake, posture, etc.). No secrets, tokens, or credentials found in either file.
**Impact**: Not a vulnerability in the shipped app - these files aren't imported, bundled, or referenced by any code. The only risk is accidental future `git add -A`/`git add .` committing personal notes into project history.
**Fix**: If these aren't meant to be tracked, add them to `.gitignore` or move them outside the repo; no code change needed for this review.

## Focus-area confirmations (no issues found)

- **`WorkoutReminderService.ts`**: never throws - every public function (`reschedule`, `cancelAll`, `requestPermissionIfNeeded`) wraps its native calls in `try/catch` and degrades to a no-op; permission is requested lazily only inside `reschedule`, never proactively. Cancellation (`cancelAll`) reads `getAllScheduledNotificationsAsync()` and cancels only identifiers starting with `workout-reminder-day-`, confirmed by direct read of lines 86-97 - it never calls `cancelAllScheduledNotificationsAsync()`, so a live `RestTimerNotificationService` notification is untouched. This is exactly the cross-feature bug class the task asked to check for, and it does not exist in this code.
- **`PlateCalculator.ts`**: pure function, no injection surface (no SQL/eval/dynamic code). The per-plate loop is bounded by `availablePlatesKg.length` (a `for...of` over the sorted/filtered array), not by `count`, so a huge `targetWeightKg` just produces a large `count` via `Math.floor` in one step rather than looping per unit - no unbounded-loop/DoS risk. Non-finite/negative `barWeightKg`/`targetWeightKg` are clamped to 0; non-finite/non-positive plate entries are filtered out before sorting; an empty `availablePlatesKg` array degrades to an empty `perSide` breakdown with `achievedWeightKg = safeBarWeightKg`, not a crash. All confirmed by reading the implementation, not assumed.
- **`SetRow.tsx`'s "copy previous" swipe action**: `previousSet` is supplied by `SessionExerciseCard`, itself derived from `useProgressionSuggestion`'s `previousPerformance`, which is fetched via `ExerciseHistoryRepository.getPreviousPerformance(exercise.exerciseId, exercise.sessionId)` - filtered by `exercise_id = ?` and excluding the current session (`SqliteExerciseHistoryRepository.ts:79-99`). The previous session's sets are further filtered to non-drop sets on both sides of the match, and matched purely by ordinal position within that already-exercise-scoped list (`displayNumber.displayNumber - 1` indexing into `previousParentSets`). There is no path by which this can read a different exercise's or a different (unrelated) session's data - confirmed by tracing the full call chain rather than assumed from the doc comments.
- **New SQL surface**: none. `settingsSchema.ts` changes are schema-only (`app_setting` is a generic key/value table with no per-key migration needed); no new repository query was added anywhere in this diff.
- **Hardcoded secrets/tokens**: none found in any changed or new file.
- **Color tokens / new i18n strings**: `theme/tokens.ts`/`tailwind.config.js` changes are a pure color reskin (`accent` blue -> magenta, new `achievement`/`achievementSubtle` gold tokens) with no behavioral or data implications. All new `i18n/catalogs/en.ts` strings (plate calculator, reminders settings, rep-max table, copy-previous accessibility labels) are static UI copy with no user data, credentials, or internal identifiers interpolated in a way that could leak anything - template placeholders (`{{weight}}`, `{{reps}}`, `{{count}}`, `{{delta}}`) only ever carry this user's own local numeric workout data back to themselves.
- **Settings write path**: `SqliteSettingsRepository.set()` re-validates every value against its Zod schema before persisting and throws `InvalidSettingValueError` on failure - the plate-list free-text parser (`PlateCalculatorSettingsScreen.parsePlateList`) independently filters to finite positive numbers and refuses an empty result before ever calling `settings.set`, so the two layers agree and neither can persist a value the other layer would reject.

## Dependency Audit

Not run this pass - no new npm dependency was added in this diff (`expo-notifications` and every other package used here was already present in `package.json` from earlier phases: `RestTimerNotificationService` already depends on `expo-notifications`). Per Step 3 scoping, `/dependency-audit` is only warranted when a dependency is actually added.

## Recommendations (priority order)

1. Optional: add `.max(7)` to `reminders.days`' Zod schema for defense-in-depth (SEC-001) - not blocking.
2. Optional: `.gitignore` or relocate the two untracked personal-notes files (SEC-003) - not blocking, not part of the shipped feature.

Claude-Session: https://claude.ai/code/session_01659JotDFjfkXUvubrHPx4E
