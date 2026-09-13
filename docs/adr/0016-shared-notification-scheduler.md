# ADR-0016: Daily goals finally implement the shared NotificationScheduler; rest-timer's own wrapper stays as-is

- Status: accepted
- Date: 2026-08-11

## Context

`services/notifications/` has been reserved since P0. ARCHITECTURE.md section 9's
folder-structure tree has described it as "`NotificationScheduler` over Expo
Notifications" from the very first version of this document, and section 8.4's
`AppContainer` interface has declared a `notifications: NotificationScheduler;` member
since the same pass - but nothing has ever implemented it. It has sat as an empty,
reserved skeleton (`services/notifications/.gitkeep` only) through every phase so far.

P7 (rest-timer) was the first feature to actually need scheduled local notifications -
the rest timer's absolute-deadline notification, cancelled on early finish, per
ADR-0005 mechanism 4 and R-04. Rather than build out the shared skeleton, P7 built its
own feature-scoped wrapper, `features/rest-timer/services/RestTimerNotificationService.ts`.
That was a reasonable call at the time: the shared service had no second consumer yet
to validate its shape against, and getting the rest timer's specific deadline/cancel
behavior right under Doze and OEM battery optimization was the phase's actual risk
(R-04), not designing a general-purpose scheduler abstraction speculatively.

P17 (Daily Goals & Reminders) is the second feature that needs local notifications -
scheduled and interval goal reminders (ARCHITECTURE.md section 7.12) - and now faces
the same choice P7 faced, except this time there is a real precedent to weigh against
building a second one.

## Options considered

**A. Daily-goals builds its own feature-scoped wrapper, mirroring rest-timer's.**
Fast, and consistent with the one existing precedent. Rejected: a second independent
notification wrapper confirms `services/notifications/` was never anything but a stale
placeholder, and duplicates permission-request handling, Android notification-channel
setup, and OS pending-notification-count awareness across two call sites with no
shared surface - exactly the "same fact, stored in two places, drifting" failure
ADR-0008 already names as the thing this codebase's state-ownership rules exist to
prevent, applied here to notifications instead of application state.

**B. Build the shared `NotificationScheduler` now; daily-goals is its first consumer;
migrate rest-timer onto it in the same phase.** Closes the gap completely in one pass.
Rejected for now: as of this writing, P7 is mid-implementation on its own branch and
not yet merged. Reaching into an in-flight, not-yet-reviewed phase's code from a
documentation-only planning pass for a different, later phase is out of scope and adds
avoidable coupling risk to a phase that has not shipped yet.

**C. Build the shared `NotificationScheduler` now; daily-goals is its first consumer;
leave rest-timer's already-shipped wrapper untouched; migrate it later as a separate,
tracked, non-blocking backlog item.** **Chosen.**

## Decision

P17 is what finally implements `services/notifications/NotificationScheduler`, as
originally intended by section 9's folder structure and section 8.4's container
interface, and `daily-goals` becomes its first real consumer. `services/container.ts`
gains its `notifications` member at this phase - the last member section 8.4 declared
that no phase had wired up yet.

`features/rest-timer/services/RestTimerNotificationService.ts` is **not** touched by
this decision. It keeps scheduling and cancelling the rest timer's own notifications
exactly as P7 built it. Migrating rest-timer onto the shared scheduler is recorded as
a separate, non-blocking backlog item (`docs/ROADMAP.md`, "Prioritized backlog
(post-1.0)", Should have table) rather than folded into P17 or silently deferred with
no record.

## Consequences

Positive:
- One notification implementation going forward. Any future feature needing local
  notifications has a real shared service to extend rather than a third bespoke
  wrapper, and the shared service's permission-request flow, Android channel setup,
  and pending-notification budgeting are built and tested once.
- The `AppContainer` interface in section 8.4 stops having a declared-but-unimplemented
  member - a small but real reduction in the gap between the architecture document and
  the actual composition root.

Negative:
- Rest-timer and daily-goals run two different notification code paths until the
  backlog migration happens. This is an accepted, tracked inconsistency, not a silent
  gap: it is named in this ADR and has a row in the roadmap backlog rather than being
  left implicit.
- `NotificationScheduler`'s interface is shaped by daily-goals' needs first (today-only
  interval scheduling, re-arm on foreground/boot - see ADR-0017), not by rest-timer's.
  If rest-timer's migration surfaces a need the interface does not cover, the interface
  grows to accommodate it rather than rest-timer being force-fit into a shape designed
  for a different feature.

## Revisit if

Rest-timer's migration onto the shared scheduler is actually scheduled. At that point,
diff `RestTimerNotificationService`'s still-open needs (an absolute single deadline,
cancelled on early finish) against what `NotificationScheduler` ended up looking like
after daily-goals' usage, before assuming the existing interface is sufficient as-is.

## P17 resolution (2026-09-12)

This ADR's "Negative" consequence above was written assuming exactly two
notification code paths would exist until the backlog migration happens:
rest-timer's own wrapper, and the shared `NotificationScheduler` this ADR
introduces. Between this ADR being accepted and P17 actually being implemented, a
separate, unrelated pass - the "Gravitus-inspired UI refresh" (see `CLAUDE.md`'s
Status section) - added a *third* independent wrapper,
`services/notifications/WorkoutReminderService.ts` (local weekly workout
reminders), built the same feature-scoped-wrapper way rest-timer's was, not
through this ADR's still-unbuilt `NotificationScheduler`. That pass had no reason
to reach for `NotificationScheduler`, since as of that date it still did not
exist - `daily-goals` (P17) is what finally builds it, per this ADR's own
decision, unchanged.

So as of P17's implementation, there are three independent local-notification
code paths, not the two this ADR anticipated: `RestTimerNotificationService`
(P7), `WorkoutReminderService` (Gravitus refresh), and `NotificationScheduler`
(P17, `daily-goals`' own consumer). This is named here for the same reason this
ADR already named the original two-path inconsistency - an accepted, tracked
gap, not a silently-widening one. It does not change this ADR's decision or its
consequences in substance: `NotificationScheduler` is still built exactly as
decided, `RestTimerNotificationService` is still left untouched, and
`WorkoutReminderService` is likewise left untouched by this phase - migrating
either (or both) onto the shared scheduler remains the same single backlog item
in `docs/ROADMAP.md`'s "Prioritized backlog (post-1.0)" table, now covering three
call sites converging to one instead of two. P17's own security review
(`reports/security-2026-09-12-p17.md`) confirmed the three paths do not conflict
in practice: each scopes its own notification-id prefix when
listing/cancelling pending notifications, and none of the three ever calls
`cancelAllScheduledNotificationsAsync()`, which would cancel another path's
live, unrelated notification.
