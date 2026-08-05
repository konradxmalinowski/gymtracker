# Accessibility Audit Report
**Date**: 2026-08-05
**Scope**: P1 design system - `theme/tokens.ts`, `components/ui/*` (22 primitives), `components/layout/*`, `components/feedback/*`, `components/gestures/*`, `app/dev/gallery.tsx`. No feature screens exist yet in this phase; this is a review of the primitive library itself.
**Triggered by**: `plans/2026-08-05-p1-design-system.md`'s Step 9e, end of P1 phase, prior to commit on `feat/p1-design-system`
**Method**: Manual read-through of every file in scope against platform-native accessibility equivalents (VoiceOver/TalkBack semantics as exposed through React Native's accessibility props), plus computed WCAG relative-luminance contrast ratios for every actual token combination in use (not eyeballed - see the Color/Contrast section for the formula and inputs).
**Agent**: general-purpose (acting as dedicated accessibility auditor per this task's brief)

## Summary
Total: 11 - Blocking: 0 | High (fix before first consumer ships): 3 | Medium: 2 | Low/Informational: 6

Three findings were fixed directly in this pass (additive, non-breaking - see "Direct fixes made" below). Two structural gesture-accessibility gaps (SwipeableRow's action reachability, DraggableList's missing non-gesture alternative) are reported but **not** fixed, per this audit's own scoping rules: both would require rethinking component structure/behavior in ways that risk colliding with the interactive-behavior RNTL tests test-agent is writing in parallel on this same branch. Neither blocks *this* commit (P1 ships zero consumers of either component into a real screen yet), but both must be resolved before `SwipeableRow` or `DraggableList` is wired into a real feature screen (`plans`, `workout-logging` reordering, `records`, etc.).

**Verdict: clear to proceed to commit.** Nothing found here is a P1-blocking defect - the primitives render, have roles/labels, and (after the three direct fixes) clear their own stated 44pt/contrast bars. The two gesture-alternative gaps are real and should be tracked as fast-follow work items attached to whichever feature phase first consumes `SwipeableRow`/`DraggableList`, not blockers for this scaffold-only phase.

## Direct fixes made

| # | File | Change | Risk |
|---|------|--------|------|
| A11Y-001 | `theme/tokens.ts` | `color.textTertiary` `#6B6B76` -> `#838390` | **Design-system color change - see below** |
| A11Y-002 | `components/feedback/Toast.tsx`, `components/feedback/ErrorState.tsx`, `components/ui/TextField.tsx` | Added `AccessibilityInfo.announceForAccessibility()` alongside the existing `accessibilityLiveRegion` | Additive only, no prop/structure change |
| A11Y-003 | `components/ui/SegmentedControl.tsx` | Added `hitSlop={hitSlop.small}` to each segment `Pressable` | Additive only, no prop/structure change |

All three were verified with `tsc --noEmit` (clean) and `eslint` (clean) after editing, and the full `jest` suite was re-run - no regressions attributable to these changes (see "Pre-existing test suite state" at the end for the 4 unrelated failures already present before this audit touched anything).

---

## Findings

### [A11Y-001] `textTertiary` fails WCAG AA for real (non-decorative) body-sized text - MEDIUM, FIXED, **design-system color change**
**Category**: Color/Contrast
**Location**: `theme/tokens.ts` (`color.textTertiary`), consumed by `components/ui/TextField.tsx:108` (helper text), `components/ui/StatTile.tsx:66,83` (unit/delta text), and others.

**Computed ratios (original `#6B6B76`)**:
| Foreground | Background | Ratio | AA-normal (4.5:1) |
|---|---|---|---|
| textTertiary | background `#09090B` | 3.78:1 | FAIL |
| textTertiary | surface `#151518` | 3.46:1 | FAIL |
| textTertiary | surfaceElevated `#1C1C21` | 3.22:1 | FAIL |

These all clear the *large-text/UI-component* 3:1 bar but fail the 4.5:1 bar for regular text. Most `color="tertiary"` call sites are decorative and already hidden from assistive tech (`accessibilityElementsHidden`) - `ListRow`'s chevron, `NumberField`'s unit suffix, `Toast`'s close glyph, `DraggableList`'s handle glyph - so those are exempt in practice (decorative text has no contrast requirement) even though they're still visible to low-vision sighted users. Two call sites are **not** decorative and **not** hidden: `TextField`'s helper text (`components/ui/TextField.tsx:108`, `variant="caption"`) and `StatTile`'s unit/delta labels (`components/ui/StatTile.tsx:66,83`, `variant="footnote"`/`"caption"`) - both are real, meaningful, non-large-text content rendered below AA.

**Fix applied**: brightened `color.textTertiary` from `#6B6B76` to `#838390` (kept the same cool tint ratio, just scaled up ~22%). New ratios: 5.32:1 (background), 4.87:1 (surface), 4.54:1 (surfaceElevated) - clears AA everywhere it's used, and stays visibly dimmer than `textSecondary` (`#A1A1AA`, 6.62-7.76:1) so the primary > secondary > tertiary hierarchy is preserved.

**This is flagged prominently because it is a color VALUE change to a token consumed by every component in the system that uses `color="tertiary"`** (`ListRow`, `NumberField`, `StatTile`, `Toast`, `DraggableList`, and any future consumer). No key was renamed, added, or removed - `tailwind.config.js`'s generated classes and every existing `color.textTertiary` import resolve to the new value automatically, nothing else needed editing. Visually this is a subtle brightening (RGB 107->131 per channel), not a hue change - recommend a quick visual pass over `/dev/gallery` to confirm it still reads as "tertiary" against the rest of the ladder, but the math says the hierarchy holds.

### [A11Y-002] Toast/ErrorState/TextField-error rely solely on an Android-only announcement mechanism - HIGH, FIXED
**Category**: Perceivable / transient content
**Location**: `components/feedback/Toast.tsx`, `components/feedback/ErrorState.tsx`, `components/ui/TextField.tsx`

`accessibilityLiveRegion` (used by `Toast`'s and `ErrorState`'s wrapping views, and `TextField`'s error `<Text>`) is an **Android-only** prop - it maps to `android:accessibilityLiveRegion` and has no iOS counterpart. React Native's only cross-platform way to announce dynamic content to VoiceOver is the imperative `AccessibilityInfo.announceForAccessibility()` call. As shipped, a VoiceOver user on iOS (this app's primary target platform per `CLAUDE.md`'s "iOS 15+, Android 8+" min-OS line) would never hear:
- A toast appearing (`UndoToast` included - the entire point of that component is giving the user a window to react, and on iOS that window would pass in total silence for a screen-reader user).
- An `ErrorState` replacing loading/list content.
- A `TextField` validation error appearing.

Since `Toast`/`UndoToast` share one component and `TextField`'s error path was the only other silent-on-iOS case, three files covered all of it.

**Fix applied**: added a `useEffect` in each that calls `AccessibilityInfo.announceForAccessibility(message)` whenever the message/error text changes, alongside (not replacing) the existing `accessibilityLiveRegion` prop. On Android this means the announcement fires twice (once from each mechanism) - both are the same idempotent, user-facing announcement, not a functional bug, just a redundant one worth knowing about if it ever needs deduplicating later.

### [A11Y-003] `SegmentedControl` segments are ~36pt tall with zero `hitSlop` - HIGH, FIXED
**Category**: Touch target size
**Location**: `components/ui/SegmentedControl.tsx` (the `Segment` sub-component)

Computed the actual rendered height: `paddingVertical: space[2]` (8pt) top and bottom plus the `callout` text variant's 20pt line height = **36pt total**, with no `minHeight` and - before this fix - no `hitSlop` at all on the `Pressable`. This is a direct violation of this phase's own acceptance criterion ("Every interactive element has an accessibility label and a >= 44x44 pt effective target") and of the exact pattern `IconButton` and `Checkbox` get right elsewhere in the same PR (`Math.max(hitSlop.small, (44 - dimension) / 2)` in `IconButton`, a flat `hitSlop.default` on `Checkbox`). This is the one primitive in the inventory that fell through that pattern - every other undersized-looking control (`IconButton` `sm` at 32pt, `Checkbox` at 24pt, `DraggableList`'s handle at 32pt, `StepperField`'s `StepButton` at 40pt) was already correctly compensated.

**Fix applied**: added `hitSlop={hitSlop.small}` (8pt/side) to the segment `Pressable`, bringing the effective target to 36 + 16 = 52pt, comfortably clearing 44pt.

### [A11Y-004] `SwipeableRow`'s `accessibilityActions` are likely unreachable via VoiceOver's rotor - HIGH, REPORT ONLY (needs frontend-agent)
**Category**: Gesture accessibility / operable
**Location**: `components/gestures/SwipeableRow.tsx:130-135`

The component does exactly what the task brief asked it to verify - it exposes `accessibilityActions`/`onAccessibilityAction` on the wrapping `View` as the intentional non-gesture alternative to the swipe, because a raw pan gesture would conflict with VoiceOver/TalkBack's own swipe-to-navigate semantics (the in-code comment gets this exactly right). Both actions are present when configured, correctly labeled from `SwipeableRowAction.label`, and `handleAccessibilityAction` correctly dispatches to `leftAction.onTrigger`/`rightAction.onTrigger` by `actionName`. **The wiring itself is correct.**

The problem is reachability: the outer `View` that carries `accessibilityActions`/`onAccessibilityAction` does **not** set `accessible={true}`. React Native's own documentation example for this exact API always pairs `accessibilityActions` with `accessible={true}` on the same element, and for good reason - without it, the `View` is not itself a focusable accessibility element; VoiceOver/TalkBack skip straight through to whatever focusable elements exist inside `children` (in this app's real usage, that will typically be a `ListRow` or similar, whose own `PressScale`-based `Pressable` already gets `accessible={true}` by default). A screen-reader user swiping through the list will land on the *row's own button*, not on a stop that also carries the custom left/right actions - the rotor's "Actions" menu for that focus point would show whatever the inner `Pressable` exposes, not `SwipeableRow`'s `leftAction`/`rightAction`.

**Why this isn't a small fix**: the obvious patch (add `accessible={true}` to the wrapping `View`) creates a worse problem than it solves. `accessible={true}` on a container collapses its entire subtree into one opaque accessibility node - the child `ListRow`'s own button would stop being individually focusable/activatable, and its primary tap action (e.g. "mark set complete") would no longer fire from a VoiceOver double-tap on that merged node, since the merge target is a bare `View`, not a `Pressable`. Fixing this properly requires deciding how the row's *primary* interaction and its *swipe actions* coexist as one accessible unit for screen-reader/switch-control users - e.g. exposing the primary action as the node's default "activate" behavior while the swipe actions ride alongside as custom actions on the same node - which is a real design decision about the component's accessibility structure, not a one-line prop addition. Flagging for frontend-agent rather than patching here, per this audit's scoping rules (no structural changes while test-agent's interactive-behavior tests are being written in parallel on this branch).

**Severity context**: not blocking P1 - no feature screen consumes `SwipeableRow` yet. This must be resolved before whatever feature first uses it (most likely `workout-logging`'s set rows or `plans`' exercise rows) ships, since at that point it becomes a real, user-facing operable-content failure, not a library-only concern.

### [A11Y-005] `DraggableList` has no non-gesture reorder alternative, and its `'handle'` mode's `adjustable` role is a promise it doesn't keep - HIGH, REPORT ONLY (needs frontend-agent)
**Category**: Gesture accessibility / operable
**Location**: `components/gestures/DraggableList.tsx:209-236` (handle mode), `:240-246` (row mode)

This is the real, known gap the task brief asked about, and it is real:

1. **No non-gesture alternative exists in either drag mode.** `dragHandle: 'row'` activates the pan after a 250ms long-press on the whole row; `dragHandle: 'handle'` activates immediately on a dedicated 32pt handle. Both are pure `Gesture.Pan()` interactions with no `accessibilityActions`/`onAccessibilityAction` pairing anywhere in the file - unlike `SwipeableRow`, which at least attempted the alternative-path pattern (see A11Y-004), `DraggableList` has no alternative path at all. A VoiceOver/TalkBack or switch-control user has literally no way to reorder the list.
2. **In `'handle'` mode specifically, the handle is given `accessibilityRole="adjustable"` (`DraggableList.tsx:219`) with no matching behavior.** The `adjustable` role tells VoiceOver to announce "swipe up or down to adjust" and expects the component to respond to increment/decrement accessibility actions (or the `onAccessibilityAction` equivalent) - this component does neither. A screen-reader user who discovers the handle, hears "adjustable," and performs the expected swipe-up/down gesture gets no response. This is arguably worse than having no role at all, since it actively signals a working interaction that isn't wired up.
3. **In `'row'` mode, the wrapping `Animated.View` around `GestureDetector` (`DraggableList.tsx:240-246`) carries no accessibility props of its own** - it inherits whatever `renderItem`'s output provides, which is fine for the row's *primary* action but means there is nothing at all - not even a misleading one - signaling that reordering is possible.

**What a real fix needs** (per the task brief's own framing, and confirmed correct after reading the implementation): an `accessibilityActions` pair - `increment`/`decrement` (matching the `adjustable` role already half-applied) or a custom `moveUp`/`moveDown` pair, either is defensible - wired to `onAccessibilityAction`, calling the same `onDragEnd(id, currentIndex, currentIndex ± 1)` path the drag gesture already calls at `DraggableList.tsx:198-200`. The data needed is already available: `orderIds` (a `SharedValue<string[]>`) can be read via `.value` from JS the same way `commitReorder` already does, and `onDragEnd`/`onReorder` are already plumbed through to the parent. This is very achievable, but touches the internal structure of `DraggableRow` (new props/state for the accessibility-action handler, a label that should probably include position context - "Row 3 of 8, move up or down") in a way that overlaps exactly the surface test-agent is writing interactive-behavior RNTL tests against right now. Deferring to frontend-agent rather than implementing here.

**Severity context**: same as A11Y-004 - not blocking P1 (no consumer yet), but this is the single most consequential accessibility gap in the whole primitive set and should be treated as a hard prerequisite before `DraggableList` ships in any real feature (plan exercise reordering, etc.), not a "nice to have later" item. Recommend it gets its own tracked follow-up rather than silently riding along with whichever feature phase first needs reordering.

### [A11Y-006] `ConfirmDialog`: initial VoiceOver focus on open is not explicitly verified - LOW, REPORT ONLY
**Category**: Focus management
**Location**: `components/feedback/ConfirmDialog.tsx`

The modal itself is built correctly for the two things the task brief asked about:
- **Not a focus trap**: `onRequestClose={onCancel}` is wired at the `Modal` level, so Android's hardware back button always reaches `onCancel` - there's no dead end.
- **No accidental dismiss**: RN's native `Modal` intercepts all touches to whatever's behind it by construction (it's a real modal presentation, not an absolutely-positioned overlay), and the backdrop `View` has no `onPress` at all, so the "not dismissible via tap-through" edge case from the plan is genuinely satisfied, for destructive and non-destructive dialogs alike.
- **Modal isolation**: `accessibilityViewIsModal` is set on the content container with `accessible={false}` on that same container - this is the correct pairing (the container itself shouldn't be one opaque node; its title/message/buttons should stay individually focusable within the isolated subtree).

What's *not* independently verified (and can't be, from static reading) is whether VoiceOver's focus actually lands inside the dialog the moment it opens, versus requiring the user to swipe once to discover it landed there. RN's `Modal` on iOS is backed by a real `UIViewController` presentation, which typically triggers UIKit's own screen-changed accessibility notification and reasonable default focus behavior - so this is likely fine, but "likely fine by default" is exactly the kind of claim worth confirming with VoiceOver on a real device rather than asserting from source alone.

Not implemented as a direct fix: the natural fix (explicitly calling `AccessibilityInfo.setAccessibilityFocus()` on the title after `visible` becomes `true`) needs a ref to a native text node, and this project's `Text` primitive (`components/ui/Text.tsx`) is a plain function component, not wrapped in `forwardRef` - adding ref-forwarding to `Text` is exactly the kind of component-structure change this audit was told to avoid making unilaterally, since `Text` is the single most-consumed primitive in the whole library. Recommend as a follow-up: either add `forwardRef` support to `Text` (frontend-agent call, small but touches every consumer's type surface) or verify on-device that the default behavior is already sufficient and skip the fix entirely.

### [A11Y-007] `Toast`'s fixed 4-second auto-dismiss doesn't account for assistive-tech users - LOW, REPORT ONLY
**Category**: Timing / perceivable
**Location**: `components/feedback/Toast.tsx` (`DEFAULT_DURATION_MS = 4000`)

Every toast - including `UndoToast`, where the entire point of the component is giving the user a real window to act - dismisses after a flat 4000ms regardless of whether a screen reader is running. For a VoiceOver/TalkBack user, that 4 seconds has to cover: the announcement being read aloud (which itself takes real time, especially for a longer message), locating the action control, and performing the double-tap. Sighted users scan the toast visually almost instantly by comparison; screen-reader users get the same clock with strictly less time to act within it. This is a well-known transient-UI failure mode, and A11Y-002's announcement fix (screen reader now actually *hears* the toast) makes this timing gap more consequential than it was before that fix, not less - now that VoiceOver users reliably hear the toast, the 4-second window to react to it becomes the binding constraint.

**Recommended fix** (not implemented here): extend `effectiveDuration` when `AccessibilityInfo.isScreenReaderEnabled()` resolves `true` (e.g. double it, or add a fixed floor like +3000ms). Not implemented directly in this pass because it changes the component's core timing behavior - exactly the kind of thing test-agent's concurrent RNTL suite is likely to assert against with fake timers - and because `AccessibilityInfo.isScreenReaderEnabled()` is async and has no established mocking precedent anywhere in this codebase yet (grepped for `AccessibilityInfo` - the only place it now appears is the three files this audit just edited for A11Y-002). Introducing an untested async native-module dependency into a component the parallel test-agent is actively writing timer-based tests against carries a real chance of flaking that suite. Flagging as a clean, well-scoped follow-up instead.

### [A11Y-008] `Card`'s `accessibilityLabel` is optional even though `onPress` makes it a `button`-role control - LOW, REPORT ONLY
**Category**: Label quality
**Location**: `components/ui/Card.tsx`

`IconButton` gets this exactly right: an icon-only control has no fallback text for VoiceOver to read, so `accessibilityLabel` is a *required* prop there (`components/ui/IconButton.tsx:26`, with a comment explaining why). `Card` has the same shape of risk without the same guarantee - when `onPress` is provided, `Card` becomes a `button`-role `PressScale` (`components/ui/Card.tsx:53-65`), but `accessibilityLabel` remains optional. If a caller builds a pressable `Card` out of only icons/images with no text children, VoiceOver will announce an unlabeled button (RN does auto-derive a label from nested `Text` when none is given, which covers the common case where a card has a title, but not the icon-only case). Not fixed here because making the prop required is a breaking signature change - out of scope per this audit's rules. Worth a callout for future review, and worth adding to whatever lint/review checklist watches for icon-only interactive elements going forward.

### [A11Y-009] `Badge`'s `warning` tone uses `dangerSubtle`, not a warning-tinted background - LOW, informational (not primarily an a11y defect)
**Category**: Semantic color correctness (adjacent to, not itself, accessibility)
**Location**: `components/ui/Badge.tsx:17` - `warning: { background: color.dangerSubtle, text: 'primary' }`

Looks like a copy/paste artifact - every other tone's background matches its own name (`accentSubtle` for `accent`, `successSubtle` for `success`, `dangerSubtle` for `danger`), but `warning` reuses `dangerSubtle` instead of a warning-tinted background, even though `color.warning` (`#F5A524`) exists as a token and is used elsewhere (set-type badges). Contrast is not actually broken by this (computed at 15.79:1, `textPrimary` on the composited `dangerSubtle`) - the bug is semantic, not perceptual: a "warning" badge currently reads visually identical to a "danger" badge's background tint. Flagging because it's a real inconsistency the review would otherwise catch, not because it fails any accessibility criterion.

### [A11Y-010] `Avatar`: `editable={true}` without `onPress` renders a non-functional button - LOW, REPORT ONLY
**Category**: Label quality / affordance honesty
**Location**: `components/ui/Avatar.tsx:63-88`

When `editable` is `true`, the component appends `". Edit"` to the accessibility label and renders a `Pressable` with `accessibilityRole="button"` regardless of whether `onPress` was actually supplied - if a caller sets `editable` without wiring `onPress`, VoiceOver announces a tappable "Edit" affordance that does nothing when activated. Type signature doesn't prevent this combination. Low severity (call-site discipline issue, not a component defect that would surface without a caller mistake), noted for completeness.

### [A11Y-011] Surface-ladder and border contrast are well under WCAG's 3:1 non-text guideline - INFORMATIONAL, not changed
**Category**: Color/Contrast (component boundaries)
**Location**: `theme/tokens.ts` (`color.surface`, `.surfaceElevated`, `.surfacePressed`, `.border`, `.borderStrong`)

Computed ratios against `background` (`#09090B`):

| Pair | Ratio |
|---|---|
| `surface` (`#151518`) vs `background` | 1.09:1 |
| `surfaceElevated` (`#1C1C21`) vs `background` | 1.17:1 |
| `surfacePressed` (`#232329`) vs `surfaceElevated` | 1.09:1 |
| `border` (`#26262C`) vs `background` | 1.32:1 |
| `borderStrong` (`#35353E`) vs `background` | 1.64:1 |

All well under WCAG 1.4.11's 3:1 guideline for identifying UI component boundaries by color alone. This is a deliberate, already-documented design choice, not an oversight - `theme/tokens.ts`'s own comment states depth "comes primarily from the surface ladder plus a 1px border" and was calibrated against Hevy/Linear (both known for exactly this kind of subtle near-black layering). In practice, component boundaries in this system are rarely communicated by fill/border color alone - they're reinforced by padding, grouping, icon/text content, and (for interactive surfaces) `PressScale`'s press feedback - so the strict 3:1 non-text guideline being unmet on paper doesn't necessarily mean boundaries are actually hard to perceive in the rendered UI. **Not changed** in this pass: unlike `textTertiary` (a single, narrowly-scoped token whose only visible use cases were two specific text spots), the surface ladder and border tokens are the single most load-bearing, most-consumed values in the entire design system - every `Card`, `TextField`, `Surface`, `Divider`, and dozens of other consumers key off them simultaneously. A change here is a full visual-identity change to the whole app, which is squarely outside "small, clearly-scoped fix" territory for an audit pass. Recommend a real-device evaluation (VoiceOver/TalkBack + Apple's Accessibility Inspector or Android's Accessibility Scanner) once actual screens exist and boundaries can be judged in context, rather than adjusting these foundational values from token math alone.

For context, `textDisabled` (`#4A4A53`, 1.94-2.27:1 against the surface ladder) is **not** a finding - WCAG 1.4.3/1.4.11 both explicitly exempt inactive/disabled UI text from contrast minimums, and this project's own `Button`/`TextField`/`Checkbox` disabled-state comments confirm the low contrast is intentional ("disabled" needs to read as unambiguously non-interactive, not just dimmer).

---

## Color/Contrast methodology

Computed via the standard WCAG relative-luminance formula (`L = 0.2126*R + 0.7152*G + 0.0722*B` on linearized sRGB channels, contrast ratio `(L1+0.05)/(L2+0.05)`), scripted against the literal hex/rgba values in `theme/tokens.ts` as of this audit - not eyeballed. `rgba(...)` tokens (`accentSubtle`, `successSubtle`, `dangerSubtle`) were alpha-composited over their actual real-world backdrop (`background` or `surfaceElevated`, matching where each is actually rendered - e.g. `Badge`/`Chip` pill fills) before computing the ratio against their foreground text, since the raw rgba alone isn't a meaningful opaque comparison.

Full results (all combinations checked, not just the failures already called out above):

| Combination | Ratio | AA-normal (4.5:1) | AA-large/UI (3:1) |
|---|---|---|---|
| textPrimary / background | 18.10:1 | PASS | PASS |
| textSecondary / background | 7.76:1 | PASS | PASS |
| textPrimary / surface | 16.58:1 | PASS | PASS |
| textSecondary / surface | 7.11:1 | PASS | PASS |
| textPrimary / surfaceElevated | 15.44:1 | PASS | PASS |
| textSecondary / surfaceElevated | 6.62:1 | PASS | PASS |
| accentText / background | 9.76:1 | PASS | PASS |
| accentText / surfaceElevated | 8.33:1 | PASS | PASS |
| success / background | 11.15:1 | PASS | PASS |
| success / surfaceElevated | 9.51:1 | PASS | PASS |
| danger / background | 5.87:1 | PASS | PASS |
| danger / surfaceElevated | 5.01:1 | PASS | PASS |
| warning / background | 9.75:1 | PASS | PASS |
| textInverse / accent (Button primary bg) | 6.22:1 | PASS | PASS |
| textInverse / accentPressed | 4.69:1 | PASS | PASS |
| textTertiary (disabled-button text) / surfaceElevated,surface,background | 3.22-3.78:1 | n/a - disabled-UI exempt | PASS |
| danger / dangerSubtle-composited (destructive button text) | 5.12:1 | PASS | PASS |
| Badge neutral (textPrimary/surfaceElevated) | 15.44:1 | PASS | PASS |
| Badge accent (accentText/accentSubtle-composited) | 8.44:1 | PASS | PASS |
| Badge success (success/successSubtle-composited) | 8.86:1 | PASS | PASS |
| Badge danger (danger/dangerSubtle-composited) | 5.12:1 | PASS | PASS |
| Chip selected (accentText/accentSubtle-composited on surfaceElevated) | 6.84:1 | PASS | PASS |

Everything not called out as a finding above is a clean pass. `textDisabled` combinations are listed as PASS-by-exemption in A11Y-011's note, not included in this table since they're not subject to the normal-text bar at all.

---

## Pre-existing test suite state (informational, out of scope)

Ran the full `jest` suite after making the direct fixes above to confirm no regressions. Result: `TextField.test.tsx` (touched by A11Y-002) and every other test file this audit's edits could plausibly affect **pass**. Four suites fail (`NumberField.test.tsx`, `Slider.test.tsx`, `Chip.test.tsx`, `SegmentedControl.test.tsx`) - all four are files this audit never touched, and `SegmentedControl.test.tsx` fails on `getByRole('tablist')` not finding a match, which is unrelated to the `hitSlop` fix made here (verified by re-running it in isolation before and after A11Y-003's edit - same failure both times). These look like test-agent's concurrent, still-in-progress work on this same branch (per the plan's delegation order, test-agent's RNTL suite runs after frontend-agent's report lands, and both are active right now). Not investigated further and no test files were touched, per this audit's explicit rules - noting only for handoff transparency.

## Recommendations, priority order

1. **Before `SwipeableRow` ships in a real feature screen**: resolve A11Y-004 (wire `accessible={true}` correctly without breaking the row's primary interaction - likely needs a combined "activate = primary action, custom actions = swipe actions" design on one accessible node).
2. **Before `DraggableList` ships in a real feature screen**: resolve A11Y-005 (add a real `increment`/`decrement` or `moveUp`/`moveDown` accessibility-action pair; at minimum, stop claiming `accessibilityRole="adjustable"` without backing it - this is the single highest-impact gap found in this audit).
3. (Optional, low priority) A11Y-006 - verify ConfirmDialog's initial VoiceOver focus on a real device; only add `forwardRef` to `Text` if that verification actually finds a problem.
4. (Optional, low priority) A11Y-007 - extend Toast duration for screen-reader users, coordinated with test-agent so the async `AccessibilityInfo.isScreenReaderEnabled()` check doesn't collide with in-progress timer-based tests.
5. (Optional, low priority) A11Y-008/A11Y-009/A11Y-010 - small consistency/type-safety cleanups, no urgency.
6. (Forward-looking, not scored) None of the Reanimated-driven motion in this phase (`PressScale`'s spring, `Skeleton`'s shimmer, `SegmentedControl`'s highlight, `Toast`'s fade, `BottomSheet`'s slide, `ConfirmDialog`'s fade) currently checks the OS "Reduce Motion" setting. This is a WCAG 2.3.3 (AAA, not AA) concern, not a blocker, but worth a note for whenever `services/haptics`-style semantic wrappers get a motion equivalent - `useReducedMotion()` from Reanimated is the natural hook once that's prioritized.

## Sign-off

Nothing found in this audit blocks committing P1. The three direct fixes (A11Y-001, A11Y-002, A11Y-003) are applied, typecheck-clean, lint-clean, and don't regress the existing test suite. The two structural gesture-accessibility gaps (A11Y-004, A11Y-005) are real and should be tracked, but by design this phase ships zero consumers of either component into a live screen, so they're correctly scoped as "must-fix-before-first-use" rather than "must-fix-before-this-commit."
