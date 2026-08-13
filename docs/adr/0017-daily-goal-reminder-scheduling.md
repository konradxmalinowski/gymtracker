# ADR-0017: Weekday bitmask, derived completion state, and today-only interval reminders

- Status: accepted
- Date: 2026-08-11

## Context

Daily goals and reminders (ARCHITECTURE.md section 7.12) need three things nothing
else in this schema has needed before:

1. A per-goal and per-reminder "which days of the week does this apply to"
   configuration - not a training-day concept, a literal Monday-Sunday one, entirely
   independent of `plan_day`.
2. A definition of "is this goal done today" that stays correct as progress is entered
   incrementally across boolean, counter and numeric goal types, and that a future
   streak/completion-rate calculator can read without redoing the logic.
3. A way to fire local notifications either at a fixed time of day or on a repeating
   interval, on a platform pair that does not offer a matching primitive for the
   interval case: iOS has no durable, minutes-level repeating local-notification
   trigger, Android's repeating triggers behave differently under Doze and OEM battery
   optimization than a naive reading of the API would suggest, and both platforms cap
   the number of notifications an app may have pending at once. Diverging by platform
   was considered and rejected - it would mean two scheduling implementations to keep
   correct instead of one, for a problem this codebase has already solved once.

## Decision 1: `active_weekdays` is a bitmask INTEGER, not a join table or a JSON column

Options considered: a `goal_weekday(goal_id, weekday)` join table - the most
normalized option, but requires a join for every "is this goal active today" check,
which is disproportionate ceremony for a 7-bit fact checked on every daily-view render.
A JSON text column (`'["mon","wed"]'`) - untyped at the SQL level, cannot be validated
by a `CHECK` constraint, and needs a codec on every read.

**Chosen: a single `INTEGER` column, bit0 = Monday through bit6 = Sunday, values 1-127.**
`CHECK (active_weekdays BETWEEN 1 AND 127)` guarantees at the database level that at
least one day is always set - a goal or reminder configured for zero days is rejected
by the schema, not caught later in application code. Membership testing is a plain
bitwise expression in both the domain layer and, if ever needed, directly in SQL
(`(active_weekdays >> weekday_index) & 1`). This is a new convention for this schema -
no existing table encodes "which weekdays apply" (`plan_day` is day-index based, not
weekday based) - and is flagged as such rather than presented as reuse of something
already established.

## Decision 2: completion state is derived, never stored

`daily_goal_entry` stores a raw `progress_value`. Whether a given day's entry counts
as "done" is always computed from `goal_type` + `target_value` + `progress_value` by a
pure domain function, not read from a stored `is_completed` column. This follows the
same "pure calculator over persisted values" pattern already established for
`SetVolume`, `Estimated1RM` and `StreakCalculator` (ARCHITECTURE.md section 6.2): a
denormalized completion flag would need to be kept in sync on every progress write and
is exactly the kind of derived state that drifts. Because the raw progress value is
what is stored, a future streak, completion-rate or weekly/monthly statistics
calculator reads from the same rows without any schema change.

## Decision 3: interval reminders schedule only today's remaining occurrences and re-arm on every foreground/boot

Rejected approach: schedule an indefinite repeating trigger at reminder-creation time
and leave it running. This is the naive reading of both platforms' repeating-
notification APIs, and it is exactly what R-04 (ARCHITECTURE.md section 17) already
identifies as unreliable for the rest timer - Doze and OEM battery optimization do not
honor long-lived background schedules consistently, and a repeating trigger set once
and forgotten cannot be corrected if the user changes the reminder's configuration
without the app being open to cancel and re-create it.

**Chosen: compute and schedule only the reminder's remaining occurrences for today,
and re-arm - recompute and reschedule - on every app foreground and on every app boot,
uniform across iOS and Android rather than diverging by platform.** This is the same
"absolute deadline, recompute on foreground, never a long-lived OS-level repeat"
pattern ADR-0005 mechanism 5 already established for the rest timer's countdown
(`timer_deadline_at`, never a JS interval) and that R-04's mitigation already relies
on. Applying it here is reuse of a decision already proven at P7's scale, not a new
risk. The re-arm call goes through the shared `NotificationScheduler` ADR-0016
introduces, not a bespoke daily-goals-only mechanism - `NotificationScheduler` owns
"recompute and reschedule this reminder's remaining occurrences for today" as a
general operation, and daily-goals is simply its first caller.

Because only today's remaining occurrences are ever scheduled at once, per-reminder,
the OS-level pending-notification cap is never a practical concern even with several
active reminders and goals.

## Consequences

Positive:
- Correctness under Doze/OEM killers is inherited from a decision already validated at
  P7, not re-derived and re-risked for a second feature.
- No risk of exceeding either platform's pending-scheduled-notification limit, since
  the scheduled set is always bounded to "what's left today," never an unbounded
  future series.
- Editing or disabling a reminder takes effect on the next foreground/boot re-arm
  without needing to hunt down and cancel a previously-scheduled long-lived trigger,
  because no such trigger is ever created.

Negative:
- A reminder that should fire while the app has not been foregrounded and the device
  has not rebooted in a long time (the phone sits untouched for several days) will not
  have its *next* day's occurrences generated until the app is opened again -
  today's already-scheduled occurrences still fire correctly via the OS regardless of
  foregrounding, since they were scheduled in advance; only tomorrow's schedule
  generation waits on a foreground/boot event. This is the exact tradeoff already
  accepted for the rest timer's own notification scheduling and is not a new risk
  category introduced by this feature.
- No `notification_id` column is kept on `daily_reminder` to track the currently
  scheduled OS instance (contrast `active_session_state.timer_notification_id`,
  section 7.6) - by design, since the scheduled instance is always ephemeral and
  re-derivable, but this does mean the OS's own notification identifier is not
  queryable from the database if a mismatch ever needs debugging; it would have to be
  logged separately if that becomes a real diagnostic need.

## Revisit if

Either platform ships a durable, minutes-level repeating local-notification trigger
that is confirmed to survive Doze/App Standby without periodic re-arming. As of this
writing that primitive does not exist on either platform; if it did, the today-only
recompute strategy would be a conservative choice worth relaxing rather than a
requirement.
