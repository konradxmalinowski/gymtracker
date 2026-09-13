# P17 Daily goals and reminders - backend slice

## Task

Implement the persistence/domain/service/notification layers for "Daily goals and
reminders" (ARCHITECTURE.md section 7.12, ADR-0016, ADR-0017). Migration
(`003_daily_goals.ts`) and `schema.sql` already landed on this branch from a prior
pass - not this task's job. UI (`app/goals/**`, `features/daily-goals/screens|
components|hooks`) and `features/home/` wiring are explicitly out of scope - a
frontend-agent handles those next against this slice's barrel.

## Acceptance criteria

- `features/daily-goals/domain/*` - pure (no React/RN/Expo import), fast-check-tested:
  weekday bitmask helpers, derived goal-completion, reminder-occurrence calculator.
- `features/daily-goals/repository/*` - `DailyGoalRepository`/`SqliteDailyGoalRepository`,
  `DailyReminderRepository`/`SqliteDailyReminderRepository` on `BaseSqliteRepository`.
  Integration tests against real `schema.sql` via `NodeSqlExecutor` covering every
  CHECK constraint, both unique-index upsert paths, and both FK cascade/set-null rules.
- `features/daily-goals/services/*` - Zod-validated `DailyGoalService`/
  `DailyReminderService`, the only door into the two repositories.
- `services/notifications/NotificationScheduler.ts` - new, third sibling notification
  wrapper (does NOT touch `WorkoutReminderService.ts`/`RestTimerNotificationService.ts`).
  Own Android channel, own notification-category with "Zrealizowane"/"Nie" actions,
  per-reminder-scoped cancellation, absolute DATE triggers only, never throws.
- `services/container.ts` - additive `notifications`/`dailyGoalRepository`/
  `dailyGoalService`/`dailyReminderRepository`/`dailyReminderService` members.
- `features/daily-goals/index.ts` barrel - domain types/constants, repository
  interfaces (never Sqlite impls), services + input/error types. No screens/hooks.
- `eslint.config.js` - add `'daily-goals'` to `FEATURES`.
- `__tests__/database/schema.test.ts` / `database/diagnostics.ts` - extend with the
  four new tables/indexes (flagged as left undone by the migration-authoring pass).

## Files (see final report for the authoritative list with paths)

Domain: `weekdayBitmask.ts`, `localDate.ts`, `goalCompletion.ts`,
`reminderOccurrences.ts` + one `.test.ts` each.
Types: `types/DailyGoal.ts`, `types/DailyReminder.ts`.
Repository: `DailyGoalRepository.ts`/`SqliteDailyGoalRepository.ts`,
`DailyReminderRepository.ts`/`SqliteDailyReminderRepository.ts` + integration tests.
Services: `DailyGoalService.ts`, `DailyReminderService.ts`, `errors.ts`.
Barrel: `features/daily-goals/index.ts`.
Notifications: `services/notifications/NotificationScheduler.ts`,
`services/notifications/index.ts` (additive line).
Container: `services/container.ts` (additive members).
Config: `eslint.config.js` (additive FEATURES entry).
Test infra: `__tests__/database/schema.test.ts`, `database/diagnostics.ts`.

## Error handling strategy

Repository: constraint violations surface as the underlying SQLite error (tests
assert the raw throw for CHECK violations - a DB-level guarantee distinct from the
service's own Zod guarantee). `RepositoryNotFoundError` (existing, from
`repositories/base`) for missing-id mutations. Service: `DailyGoalValidationError`/
`DailyReminderValidationError` (Zod issues attached), mirroring `PlanValidationError`/
`BodyMetricValidationError`. `NotificationScheduler`: never throws - every failure
(permission denied, native module missing, native call rejected) degrades to a no-op,
matching `WorkoutReminderService`/`RestTimerNotificationService`'s own contract.

## Edge cases

- `counter`/`numeric` goal with null `target_value` - rejected at both the Zod layer
  and the raw DB CHECK (both asserted in tests).
- `active_weekdays` outside 1-127, or all-zero - rejected at both layers.
- `reminder_type` scheduled/interval XOR on `time_of_day`/`interval_minutes`.
- Re-writing an entry/response for the same `(goal_id, local_date)`/
  `(reminder_id, local_date)` day updates in place; a different date is an
  independent row (both asserted).
- Deleting a goal cascades its entries and nulls out any linked reminder's `goal_id`
  (reminder survives). Deleting a reminder cascades its responses.
- "Ignored" (active day, no response row) is computed in `DailyReminderService
.getReminderStats`, never stored or computed in the repository.
- Interval reminder occurrence generation excludes "right now" and anything past
  local end-of-day; scheduled-time-already-passed returns zero occurrences.
