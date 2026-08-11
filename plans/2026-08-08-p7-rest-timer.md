# P7 - Rest timer

## Problem summary

Phase 7 of `docs/ROADMAP.md`: automatic rest timing that stays correct across
backgrounding, Android Doze, and process death. `RestTimerBar`'s slot has been
deliberately omitted from `ActiveWorkoutScreen` since P6 - nothing before this phase
ever populates a timer deadline for it to react to. This phase builds the mechanism:
resolution of the rest duration to use, the countdown itself, OS notification
scheduling for when the app is backgrounded, and the settings surface for it.

## Acceptance criteria (from ROADMAP.md, verbatim scope)

- Complete a set, background the app, wait past the deadline: the notification fires
  and reopening the app shows the timer expired, not still counting.
- Foregrounding mid-timer shows the correct remaining time to the second.
- Killing the app mid-timer and relaunching restores the correct remaining time.
- Timer is accurate on an Android device with battery optimization enabled (R-04).
- Disabling notifications in OS settings degrades to in-app timing plus haptics
  without an error.
- Superset rule (D-03, ADR-0006): completing a set of a non-terminal member of a
  superset group starts no timer; completing a set of the last member starts one.
- Resolution order for the rest duration: exercise override, then plan day, then
  global default.

## Decisions made in Step 0 (user-confirmed)

1. **Presets**: fixed chips at 30/60/90/120/180s. No preset-editing UI.
2. **Tap-to-adjust persistence**: adjusting the running timer writes the new value to
   `session_exercise.rest_seconds_override`, so every remaining set of that exercise
   this session inherits the adjusted duration (not a one-off countdown change).
3. **Notification permission**: requested lazily, the first time a timer would
   actually schedule a notification during a real workout - not during onboarding,
   not proactively from settings.
4. **Settings screen**: both ship this phase - the in-workout
   `RestTimerSettingsSheet` modal (current exercise's override + presets) AND the
   standalone `app/profile/settings/timers.tsx` screen (global defaults: default rest
   seconds, sound/vibration/autoStart toggles) already implied as a reachable node in
   `docs/ARCHITECTURE.md`'s section 10.1 nav diagram.

## Task shape and scale

Single application (GymTracker RN/Expo client, no separate backend - offline-only).
One coherent feature phase, following the same single-phase-at-a-time pattern P3-P6
already used. Not parallelized across applications; internally split into two
**sequential** frontend-agent passes (not parallel) because the UI layer directly
consumes the domain/service layer's contracts:

1. Domain + service + store layer (pure functions, notification wrapper, ticking
   store) plus its tests.
2. UI components and screen integration, built against pass 1's already-implemented
   contracts.

Sequential, not parallel, because splitting these into concurrently-running agents
would risk a contract mismatch between the timer math and the bar that renders it -
exactly the case "Workflow flexibility" calls out as not safe to parallelize.

Revised while fixing the resolution-seeding gap above into three sequential passes
(see the updated delegation table) rather than two, so the `workout-logging`
repository/service changes get their own reviewable checkpoint separate from both
the pure `rest-timer` domain layer and the UI layer.

## Platform

React Native / Expo (iOS 15+, Android 8/API 26+), detected from existing
`package.json` (`expo-notifications ~57.0.9`, `expo ~57.0.11`, matching SDK 57 across
the board - no environment/toolchain mismatch found, Step 2a check passed silently).
No web surface exists in this project, so Step 9b (SEO) and the crawler portion of
Step 9d (LLM accessibility) are skipped entirely, as they have been for every prior
phase. No simulator/emulator is available in this environment (same constraint noted
in every prior phase's write-up) - `npx expo export --platform ios` remains the
build-verification proxy for Step 7.

## Affected layers

- Domain (`features/rest-timer/domain/`): pure resolution-order calculator, superset
  skip rule.
- Services (`features/rest-timer/services/`): `expo-notifications` scheduling
  wrapper, permission request.
- Store (`stores/restTimerStore.ts`, project root per existing convention alongside
  `activeWorkoutStore.ts`/`exercisePickerStore.ts`): ticking state derived from
  `timer_deadline_at`, recomputed from wall clock on every foreground - never the
  source of truth for the deadline itself.
- UI (`features/rest-timer/components/`): `RestTimerBar`, `TimerPresetChips`,
  `RestTimerSettingsSheet` content.
- Routes (`app/(modals)/rest-timer-settings.tsx`, `app/profile/settings/timers.tsx`):
  thin wrappers only, per the "app/ never contains screen bodies" rule.
- Integration into existing `features/workout-logging` code:
  `ActiveWorkoutScreen` (mount `RestTimerBar`), `ActiveWorkoutBanner` (add the rest
  countdown half that P6 deliberately left out), the set-completion hook (call
  rest-timer's service to resolve + start the timer), `WorkoutSessionRepository`'s
  existing `saveActiveState` (already persists `active_session_state`, including its
  `timer_deadline_at`/`timer_notification_id` columns per the P6 write-up - extending
  its call sites, not its shape).
- Settings: `timer.defaultRestSeconds`/`timer.sound`/`timer.vibration`/
  `timer.notification`/`timer.autoStart` already exist in `settingsSchema.ts` from
  P2 - no schema change needed, only a UI that reads/writes them via the existing
  `SettingsRepository`.

No database migration - every column this phase needs
(`active_session_state.timer_deadline_at`, `.timer_notification_id`,
`exercise_user_data.default_rest_seconds`, `plan_day_exercise.rest_seconds`,
`session_exercise.rest_seconds_override`) was already shipped in P2's single-migration
schema. Confirmed by reading `database/schema.sql` directly before writing this plan.

## Module dependency graph constraint (load-bearing for the delegation split)

Per `docs/ARCHITECTURE.md` section 9.1: `rest-timer` must not depend on
`workout-logging` - `workout-logging` depends on it, inverting the edge creates a
cycle. Concretely: `rest-timer` owns no database table and therefore no repository -
it exposes a pure resolution function and a notification-scheduling service that
`workout-logging` calls into. `workout-logging` keeps owning the actual persistence
of `timer_deadline_at`/`timer_notification_id` into `active_session_state` and
`rest_seconds_override` into `session_exercise`, through its existing
`WorkoutSessionRepository`, since that aggregate's ownership was already established
in P6. Any change on the `workout-logging` side of this integration stays inside its
own feature directory, not inside `features/rest-timer/`.

**Concrete, already-located gap found while scoping this plan** (read directly from
`features/workout-logging/repository/SqliteWorkoutSessionRepository.ts` before
writing this plan, not assumed):

- `startFromPlanDay` (line ~342-361) seeds `rest_seconds_override` straight from
  `dayExercise.rest_seconds` (the plan day's own column) with no fallback at all -
  if the plan day left it null, the session inherits null, and nothing downstream
  ever resolves it. The query already `LEFT JOIN`s `exercise_user_data ud` for
  `display_name_override`; it needs to also select `ud.default_rest_seconds` and run
  it through `resolveRestSeconds` before the insert.
- `addExercise` (line ~536-551) hardcodes `rest_seconds_override: null` - no plan day
  tier applies here (manual add has no plan day), but the exercise-override tier and
  the global-default tier still should, and neither is applied.
- Neither repository method currently has access to `timer.defaultRestSeconds` (a
  setting, not a joinable column) - the fix is for `WorkoutSessionService`'s
  `startFromPlanDay`/`addExercise` wrappers to read the global default via the
  settings repository/container it already has access to, and pass it down as a
  plain `globalDefaultRestSeconds: number` parameter, keeping the repository free of
  any settings-schema knowledge. `resolveRestSeconds` itself (from `rest-timer`) is
  the single place the three-tier precedence logic lives - the repository calls it,
  it does not reimplement the precedence inline.

## Error handling strategy

- Notification permission denied or `timer.notification` off: schedule nothing,
  timer still ticks in-app from the persisted deadline, `services/haptics`'
  already-existing `timerFinished` haptic still fires locally on expiry. No thrown
  error either way - this is explicit ROADMAP acceptance criteria, not a fallback
  bolted on afterward.
- App killed mid-timer: on relaunch, `active_session_state.timer_deadline_at` is the
  source of truth: remaining time is `deadline - now`, clamped to zero if already
  past (shows expired, matching the OS notification having already fired).
- Early finish of the exercise/set that cancels a still-running timer: the scheduled
  notification (`timer_notification_id`) is cancelled via
  `expo-notifications`' cancel API, mirroring the schema comment already on that
  column ("cancelled on early finish").

## Edge cases to address (Step 6a will re-verify against the actual diff)

System side: app backgrounded past deadline; app killed mid-timer; Doze-mode delay on
the scheduled notification; notification permission denied; `timer.notification`
setting off; rapid double-tap on set-complete re-triggering timer start; superset
group with 1 remaining un-logged member vs. the last member; adjusting the timer to a
value below elapsed time (should show expired immediately, not negative).

Human side: user backgrounds the app in the OS's app switcher without truly leaving
(iOS may not fire background timers the same way - notification is the real
mechanism per R-04, not a JS interval); user swipes to dismiss then immediately taps
a set-complete elsewhere; user changes `timer.sound`/`timer.vibration` mid-countdown;
screen-reader users need the countdown announced meaningfully, not just visually
(flagged for Step 9e).

## Agent delegation plan

| Step | Agent | Files owned | Parallel/Sequential |
|---|---|---|---|
| Pass 1: domain + notification service + store + tests | frontend-agent | `features/rest-timer/domain/**`, `features/rest-timer/services/**`, `features/rest-timer/types/**`, `features/rest-timer/index.ts` (barrel exports for pass 2/3 to consume), `stores/restTimerStore.ts`, their `__tests__/**` counterparts | Sequential, first |
| Pass 2: workout-logging repository/service integration + tests | frontend-agent | `features/workout-logging/repository/{WorkoutSessionRepository.ts,SqliteWorkoutSessionRepository.ts}`, `features/workout-logging/services/WorkoutSessionService.ts`, `services/container.ts` (pass the resolved global default through), their `__tests__/**` counterparts | Sequential, second (depends on pass 1's `resolveRestSeconds`/notification service exports) |
| Pass 3: UI components + screen integration + settings screens | frontend-agent | `features/rest-timer/components/**`, `features/rest-timer/screens/**`, `app/(modals)/rest-timer-settings.tsx`, `app/profile/settings/timers.tsx`, edits to `features/workout-logging/screens/ActiveWorkoutScreen.tsx` and its `ActiveWorkoutBanner` component, `features/workout-logging/hooks/*` set-completion hook | Sequential, third (depends on pass 1 + pass 2 contracts) |
| Test coverage gaps after all three passes | test-agent | any new code the three passes didn't already cover | Sequential, after pass 3 |
| Code review | (orchestrator, this session) | read-only over the full diff | After both passes |
| Security review | security-agent-sonnet | read-only - notification handling, deep link `gymtracker://workout/active` reopening | After review passes |
| Accessibility review | accessibility-agent | read-only - `RestTimerBar`, `TimerPresetChips`, both settings screens | Parallel with security review (both read-only, no file conflict) |
| Docs | docs-agent | `CLAUDE.md`, `docs/architecture-snapshot.md` (stale since the P6 docs commit `13e8e1f`, regenerated here instead of at Step 2b) | After security/accessibility |
| Commit | git-commit-agent | staged per logical group | After docs |

No new npm dependency expected (`expo-notifications` is already installed at
`~57.0.9`, matching the rest of the SDK 57 tree) - if pass 1 finds it needs anything
beyond what's already in `package.json`, that is a stop-and-ask per "Scope is
drifting," not a silent `npm install`.

## Feature flags / NFR decisions

No feature-flag system exists in this project (confirmed: no flags library, no flags
config, no flag-checking pattern found) - not raised further, per the skill's own
rule.

NFR: R-04 (timer accuracy under Android Doze/battery optimization) is the one
non-trivial NFR here, already given a concrete pattern by `docs/ARCHITECTURE.md`
line 1879: never rely on a JS timer or background task: persist the absolute
deadline, schedule the notification with the OS, recompute remaining time from wall
clock on every foreground. That pattern is what pass 1's store and pass 2's
`RestTimerBar` are built against - not a fallback if the simple approach turns out
insufficient.
