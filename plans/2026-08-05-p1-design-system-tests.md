# P1 design system - RNTL accessibility/behavior tests

## Scope

RNTL tests verifying the phase's hard acceptance criterion ("every primitive
has an accessibility role and label, verified by RNTL") plus interactive
behavior, for the components built in P1.

Priority 1 - every interactive `components/ui` primitive: `Button`,
`IconButton`, `Chip`, `SegmentedControl`, `TextField`, `NumberField`,
`StepperField`, `Switch`, `Slider`, `Checkbox`, `ListRow` (pressable variant).
For each: correct `accessibilityRole`, a meaningful `accessibilityLabel`,
`disabled` reflected in `accessibilityState`, `onPress`/`onChange` firing
(and not firing when disabled).

Priority 2 - `components/gestures/PressScale`: forwards accessibility props,
doesn't swallow `onPress`.

Priority 3 - `components/feedback/ConfirmDialog`: backdrop has no dismiss
handler, Cancel/Confirm both fire their callback.

Priority 4 - `StepperField` min/max boundary: repeated increment/decrement
via press-and-hold does not exceed `max` or go below `min`.

Priority 5 - `NumberField` null value handling: empty input commits `null`,
not `0`; clearing an existing value round-trips through blur.

Lower priority (smoke only, no simulated pan gestures) -
`components/gestures/SwipeableRow` and `DraggableList`: render without
crashing, expose the right `accessibilityActions`/`accessibilityRole`.

## Test types

All RNTL component/integration-style tests (render real component tree,
assert on accessibility tree and fired callbacks) - no unit tests needed
since these are presentational primitives with no extracted pure logic
beyond what's already exercised through the rendered component (e.g.
`StepperField`'s clamp math is only reachable through the rendered buttons).

## Test cases (by file)

- `Button.test.tsx`: role=button, label=`label` prop, disabled/loading ->
  `accessibilityState.disabled`, `busy` while loading, `onPress` fires once,
  no fire when `disabled` or `loading`.
- `IconButton.test.tsx`: role=button, required `accessibilityLabel` used
  verbatim, disabled state, `onPress` gating.
- `Chip.test.tsx`: no-`onPress` chip renders plain (no button role), `onPress`
  chip gets role=button + `selected` in state, `onRemove` renders a nested
  IconButton with a distinct "Remove {label}" label and fires independently
  of the chip's own `onPress`.
- `SegmentedControl.test.tsx`: container role=tablist, each option
  role=tab + `selected` state, `onChange` fires with the pressed option's
  value, pressing the already-selected segment does not re-fire `onChange`.
- `TextField.test.tsx`: label wired via `accessibilityLabelledBy`, disabled ->
  `editable=false` + `accessibilityState.disabled`, `onChangeText` fires,
  error text gets `accessibilityRole="alert"`.
- `NumberField.test.tsx`: accessibilityLabel required prop surfaced,
  clearing text commits `null` (not `0`), typing a value commits the parsed
  number on blur clamped to `[min, max]`, disabled -> not editable.
- `StepperField.test.tsx`: +/- buttons have distinct accessibility labels
  built from `common.increase`/`common.decrease` + the field's label,
  single press increments/decrements by `step`, repeated increments stop
  exactly at `max` and repeated decrements stop exactly at `min` (using fake
  timers to drive the press-and-hold repeat loop deterministically),
  disabled buttons don't fire.
- `Switch.test.tsx`: role=switch, `checked` mirrors `value`, disabled state,
  `onValueChange` fires with the flipped value.
- `Slider.test.tsx`: `accessibilityLabel` passed through, disabled state,
  `onValueChange` fires on a native change event.
- `Checkbox.test.tsx`: role=checkbox, `checked` mirrors `value`, disabled
  state, pressing toggles the boolean.
- `ListRow.test.tsx`: no-`onPress` row has no button role, `onPress` row gets
  role=button with a label combining title+subtitle when present, disabled
  gating.
- `PressScale.test.tsx`: forwards `accessibilityRole`/`accessibilityLabel`/
  `accessibilityState` verbatim onto the underlying pressable, `onPress`
  fires, disabled both blocks `onPress` and sets `accessibilityState.disabled`.
- `ConfirmDialog.test.tsx`: backdrop `View` has no `onPress` prop at all
  (assert `props.onPress` is undefined on the outer overlay), Cancel button
  calls `onCancel`, Confirm button calls `onConfirm`, default vs custom
  button labels, `destructive` flips the confirm button's variant.
- `SwipeableRow.test.tsx` (smoke): renders children, exposes
  `accessibilityActions` matching the configured `leftAction`/`rightAction`
  labels, `onAccessibilityAction` invokes the matching action's `onTrigger`
  (this is how a screen-reader/switch-control user actually triggers it, so
  it's real coverage, not a gesture simulation).
- `DraggableList.test.tsx` (smoke): renders all rows via `renderItem`, drag
  handle variant exposes `accessibilityRole="adjustable"` with a label.

## Setup/teardown

No test DB, no fixtures. Two pieces of test infrastructure were missing and
had to be added (repo's first RNTL suite - see report):

- `test-renderer` devDependency (RNTL 14's peer dependency, the React 19
  replacement for the deprecated `react-test-renderer`).
- `jest.config.js`: `moduleNameMapper` for `react-native-reanimated` (+
  `react-native-worklets`, needed transitively) to their own JS-only mocks,
  and `setupFiles` for `react-native-gesture-handler/jestSetup` - both are
  each library's own documented Jest entry point, appended to (not replacing)
  jest-expo's preset `setupFiles`.

`render()` is async in this RNTL version - every test `await`s it. So is
`fireEvent`/`fireEvent.press`/`fireEvent.changeText` - every call is
`await`ed too (an unawaited `fireEvent` produced "overlapping act() calls"
warnings and intermittent "unable to find element" failures bleeding across
tests in the same file until this was fixed everywhere).

## Results

59 passed, 3 failed. All 3 failures are genuine accessibility gaps in the
implementation surfaced by writing the tests the acceptance criteria asked
for - not test bugs, not flakiness. Each failing `it` has a `NOTE` comment
at the call site explaining exactly what's missing and why the assertion is
left in place (not weakened) rather than adapted around it:

1. `components/ui/Slider.tsx` never sets `accessibilityRole` - unlike
   `Switch`/`Checkbox`, which each set one explicitly, it relies on
   `@react-native-community/slider`'s native component, which (confirmed by
   inspecting the rendered tree) doesn't supply one outside its web
   fallback. Fix: add `accessibilityRole="adjustable"`.
2. `components/ui/SegmentedControl.tsx`'s outer container sets
   `accessibilityRole="tablist"` but never `accessible={true}`, so it's
   invisible to RNTL's (and, by the same logic, TalkBack/VoiceOver's)
   accessibility tree - a plain `View` defaults `accessible` to `false`. The
   individual `tab` segments are unaffected (`Pressable` defaults
   `accessible` to `true`). Fix: add `accessible` to the container `View`.
3. `components/gestures/DraggableList.tsx`'s drag handle (`dragHandle:
   'handle'` variant) has the same gap: `accessibilityRole="adjustable"`
   without `accessible={true}`. Same fix.

Also noted, not covered by a failing assertion since it's not an
accessibility-role gap: `DraggableList`'s drag handle label
(`"Drag to reorder"`) is a hardcoded English string, not routed through
`t()` - inconsistent with every other user-facing string in this phase and
with the phase's own acceptance criterion ("every new user-facing string
routed through the i18n layer").
