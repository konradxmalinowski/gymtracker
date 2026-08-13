# ADR-0018: Estimated calories use a flat kcal-per-minute constant, not a bodyweight-based formula

- Status: accepted
- Date: 2026-08-13

## Context

D-04 (`docs/ARCHITECTURE.md` section 18) settled *whether* the workout summary shows
an estimated-calories figure at all: yes, labeled "estimate", off by default. It did
not settle *how* that estimate is computed - the decision register's ADR column for
D-04 said "-" until this document.

P9 (workout summary and history) is the phase that actually builds the summary
screen, so the formula has to be picked now. The obvious "correct" approach - a MET
(metabolic equivalent of task) value per exercise, multiplied by the user's
bodyweight and set duration - needs a bodyweight input this app does not have: body
measurements are P13 (body-metrics) scope, not built yet, and `user_profile` carries
no weight field. Shipping the calorie feature at all therefore requires either
inventing a bodyweight input ahead of its own phase, deferring the whole feature
until P13, or estimating without one.

## Options considered

**A. MET x bodyweight.** The standard formula real fitness apps use
(`kcal = MET * weight_kg * duration_hours`), and the only one of the three options
that is a genuine, individualized estimate. Rejected for v1: it needs a bodyweight
field that does not exist in this app yet, and different exercises would need their
own MET values researched and maintained - a second content-authoring surface this
phase has no scope to build. Building a bodyweight field solely to unblock this one
estimate would be scope creep pulling P13 forward for a value the summary screen
already labels "estimate," not a precision claim.

**B. Defer the calculation entirely to P13, ship the summary screen with no calorie
figure until then.** Simplest, and defers the real problem (no bodyweight data)
rather than working around it. Rejected: it ships the whole feature (D-04 already
decided to include it) with no value at all for however many phases separate P9 from
P13 - a real regression against what was decided, not a neutral deferral.

**C. A flat kcal-per-minute constant applied to `duration_seconds`, no bodyweight or
exercise-specific input.** **Chosen.**

## Decision

`estimated_kcal` is computed as a flat rate applied to the session's own logged
duration, implemented as a pure calculator,
`features/workout-logging/domain/EstimatedCalories.ts`:

```ts
export const CALORIES_PER_MINUTE = 5;

export function estimatedCalories(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 0;
  }
  return Math.round((durationSeconds / 60) * CALORIES_PER_MINUTE);
}
```

`durationSeconds` is the same `duration_seconds` `SessionTotals.ts` already computes
and `workout_session` already denormalizes - it excludes paused time by construction,
so no separate "active time" concept is needed for this estimate. `5` kcal/minute
sits in the middle of the roughly 3-7 kcal/minute range resistance training generally
falls in, chosen as a defensible single number rather than a researched one - the
constant is named and exported (never a magic number at its one call site,
`WorkoutSessionRepository.finish()`), the same convention this codebase already uses
for `REST_SECONDS_MIN`/`REST_SECONDS_MAX` in `repositories/settings/settingsSchema.ts`.

`WorkoutSessionService.finish()` reads the `workout.showEstimatedCalories` setting
(default `false`, per D-04) and passes it to the repository as a plain boolean,
mirroring exactly how it already passes `timer.defaultRestSeconds` down to
`startFromPlanDay` - the repository itself stays free of settings-schema knowledge.
When the setting is off, `estimated_kcal` is written `null`, and it stays `null`
retroactively for any session finished before this phase or with the setting off at
finish time - there is no backfill pass. `estimated_kcal` is written once, at
`finish()` time, and is not recomputed by a later historical edit
(`syncCompletedSessionAfterEdit`, P9's historical-edit resync helper, deliberately
does not touch it - see that helper's own doc comment): every historical mutation
this phase added only touches `session_exercise`/`workout_set` rows, never
`started_at`/`finished_at`/`paused_ms`, the three inputs `duration_seconds` (and
therefore this estimate) depends on, so recomputing it on every edit would always
reproduce exactly what `finish()` already wrote.

## Consequences

Positive:
- Ships the feature D-04 already committed to, on the phase that was supposed to
  build it, with no bodyweight field invented ahead of its own phase and no
  per-exercise MET content-authoring surface to build and maintain.
- One constant, one call site, trivially revisitable: replacing the formula later
  (bodyweight-aware, once P13 lands) means changing `estimatedCalories()`'s body, not
  hunting down every place calories are computed.
- The estimate is honest about its own precision: the summary screen labels it
  "estimate" regardless of which constant backs it, and the feature ships off by
  default, so a user who cares about calorie precision simply never turns it on.

Negative:
- The number is not personalized. A 60 kg lifter and a 110 kg lifter doing the same
  workout get the same estimate, which is wrong in the way every non-bodyweight-aware
  calorie estimate is wrong. Accepted because the alternative (no estimate until P13)
  is a worse outcome for a feature already decided as in-scope, and because the
  feature's own UI already sets the expectation that this is a rough figure, not a
  metabolic measurement.
- No per-exercise or per-intensity variation - a set of heavy squats and a set of
  light curls contribute identically to the estimate, since only elapsed logged time
  matters. Revisit once P13 body-metrics exists and a MET-per-exercise dataset is in
  scope to build.

## Revisit if

P13 (body-metrics) ships a bodyweight field. At that point, re-evaluate Option A
(MET x bodyweight) against what `estimatedCalories()` looks like by then, rather than
assuming the flat constant should simply gain a bodyweight multiplier bolted on -
MET-based estimation also wants per-exercise MET values, which is a separate content
question this ADR did not have to answer because Option C avoided it entirely.
