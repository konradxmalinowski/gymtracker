# ADR-0007: The active workout is a root-level full-screen route outside the tabs

- Status: accepted
- Date: 2026-08-04

## Context

Expo Router is fixed by the brief. What is not fixed is where the workout screen lives
in the route tree, and that placement determines whether a user can lose a workout by
swiping in the wrong direction.

Constraints from the brief: one-hand usage, minimal taps, "avoid modal spam", and the
workout screen is "the most important screen".

## Options considered for the active workout route

**A. A sixth tab, shown only while a workout is running.**
Discoverable and cheap. Rejected: the tab bar steals ~80 pt of the most valuable screen
real estate on the app's densest screen, and a mistap on an adjacent tab silently leaves
the workout - which, combined with the persistent tab bar, invites exactly that mistap.

**B. A stack screen pushed inside the current tab.**
Simplest routing. Rejected: it inherits iOS's interactive back-swipe from the left edge,
which is a gesture users perform constantly and would dismiss the workout screen mid-set.
It also means the workout's route depends on which tab it was started from, so
`gymtracker://workout/active` from the rest-timer notification has no single target.

**C. A root-level route group outside `(tabs)`, presented as `fullScreenModal` with
gestures disabled.** **Chosen.**

**D. A persistent overlay component rendered above the router.**
Maximum control, and how some native apps do it. Rejected: it puts the app's most
complex screen outside the router entirely, so it has no URL, no deep link, no back
handling and no typed route. Debugging navigation state becomes guesswork.

## Decision

```
app/
  (tabs)/...                    Home, Plans, Exercises, Stats, Profile
  workout/
    _layout.tsx                 Stack, presentation: 'fullScreenModal',
                                gestureEnabled: false, animation: 'slide_from_bottom'
    active.tsx
    summary/[sessionId].tsx
  (modals)/...                  presentation: 'modal' - pickers only
  history/[sessionId].tsx
  onboarding/index.tsx
```

with these rules:

1. **`workout/active` is presented full-screen with `gestureEnabled: false`**, and the
   Android hardware back button is intercepted to show the minimize/finish choice rather
   than popping the route. Leaving an active workout is always a deliberate act.

2. **Minimizing routes back to the tabs and shows an `ActiveWorkoutBanner`** docked
   above the tab bar with elapsed time and the rest countdown, tapping it returns to
   `workout/active`. This exists because users genuinely need to open an exercise's
   technique video or check a past workout mid-session, and forcing them to finish the
   workout to do so would be worse than the mistap risk option A introduced.

3. **`workout/summary/[sessionId]` lives in the same group** so that finishing is a
   `replace`, not a push - the user cannot swipe back from the summary into a workout
   that no longer exists.

4. **Modals are for pickers and single-value entry only.** Exercise picker, plan-day
   picker, set-type picker, timer settings, body-metric entry. Editing a set is inline
   (swipe right expands the row in place). This is the brief's "avoid modal spam" made
   concrete: five modal routes exist in the whole app and none of them is on the set
   logging path.

5. **Confirmation dialogs are enumerated, not ad hoc.** Discard workout, delete plan,
   delete session, replace-mode import, purge data. Everything else - deleting a set,
   removing an exercise, unfavoriting - uses immediate action plus an undo toast, which
   is what the soft-delete decision in ADR-0002 pays for.

6. **Typed routes on, and all navigation through `navigation/routes.ts` helpers.**
   `routes.workout.active()` rather than `router.push('/workout/active')`. Renaming a
   route becomes a compile error rather than a dead link discovered by a user.

7. **Deep links:** `gymtracker://workout/active` (rest-timer notification tap),
   `gymtracker://exercise/:id`, `gymtracker://plan/:id`, `gymtracker://history/:id`.
   The notification target is the reason the workout route must be addressable at a
   fixed path independent of tab state.

8. **The splash screen is held** until fonts are loaded, migrations have run, the
   profile query has resolved and the MMKV active-session flag has been read. Without
   this the user sees Home flash before being redirected to onboarding, which reads as a
   bug.

## Consequences

Positive:
- The workout screen gets the full viewport, which matters for one-handed use with large
  targets.
- It cannot be dismissed accidentally by either platform's standard back gesture.
- It has a stable URL, so the rest-timer notification, and any future widget or
  shortcut, has one target.

Negative:
- Two navigation contexts exist (tabs and the workout stack), so shared UI that needs to
  appear in both - the toast host, the bottom-sheet host - must be mounted at the root
  layout rather than inside the tab layout. Handled once in `app/_layout.tsx`.
- Intercepting Android back is a behavior users may find surprising the first time.
  Mitigated by making the interception show an action sheet with Minimize / Finish /
  Discard rather than blocking silently.
- `fullScreenModal` animates from the bottom on both platforms, which is slightly
  unusual for a "screen" on Android. Accepted: it reinforces that the workout is a mode
  the user entered, not a page they browsed to.
