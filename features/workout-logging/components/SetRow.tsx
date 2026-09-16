import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useState } from 'react';
import { View } from 'react-native';

import { Column, Row } from '@/components/layout';
import { Checkbox, Chip, NumberField, Text, TextField } from '@/components/ui';
import { SwipeableRow, type SwipeableRowAction } from '@/components/gestures/SwipeableRow';
import { PressScale } from '@/components/gestures/PressScale';
import type {
  CompleteSetValues,
  PreviousPerformanceSet,
  SetDisplayNumber,
  UpdateSetPatch,
  WorkoutSet,
} from '@/features/workout-logging';
import { PRBadge, type PersonalRecord } from '@/features/records';
import { useRenderCount } from '@/hooks/useRenderCount';
import { t } from '@/i18n';
import { useSheetStore } from '@/stores/sheetStore';
import { color, radius, space } from '@/theme/tokens';

import { useDebouncedFieldCommit } from '../hooks/useDebouncedFieldCommit';
import { setTypeBadgeColor, setTypeLabel } from './setTypeDisplay';
import { SetTypePickerSheetContent } from './SetTypePickerSheetContent';

export interface SetRowProps {
  set: WorkoutSet;
  displayNumber: SetDisplayNumber;
  isFocused: boolean;
  /** P8: this set's newly-earned PRs (`SessionExerciseCard`'s `latestPR` prop, matched by set id), `undefined` when this isn't the set that just earned one. */
  prRecords?: readonly PersonalRecord[] | undefined;
  /**
   * Gravitus-inspired refresh: the previous session's set at this same
   * display-number ordinal (`SessionExerciseCard` matches by position among
   * non-drop sets, since a drop segment has no clean equivalent to copy
   * from) - `undefined` when there's nothing at that position to copy,
   * which hides the swipe-right "copy previous" action entirely rather than
   * offering a copy with nothing behind it.
   */
  previousSet?: PreviousPerformanceSet | undefined;
  onFocus: (setId: string) => void;
  /**
   * `values` is optional only for signature compatibility with older
   * callers - `SetRow` itself always passes the row's current on-screen
   * weight/reps/rpe/note (see the completion handler below), per
   * `CompleteSetValues`'s own "the values the user had on screen when they
   * tapped the checkbox" contract.
   */
  onComplete: (set: WorkoutSet, values?: CompleteSetValues) => void;
  onUncomplete: (setId: string) => void;
  onUpdate: (setId: string, patch: UpdateSetPatch) => void;
  onDelete: (set: WorkoutSet) => void;
  onAddDropSet: (parentSetId: string) => void;
  testID?: string | undefined;
}

/**
 * The `SetRow` from ARCHITECTURE.md section 10.3 / this phase's roadmap
 * entry. Built on `SwipeableRow` exactly as the P6 brief specifies: swipe
 * left deletes (with undo, `useDeleteSet`'s job, not this component's -
 * `onDelete` is called and the toast is the caller's responsibility so every
 * `SetRow` in a card doesn't wire up its own independent toast). Swipe right
 * used to toggle this row's own inline expanded editor; the Gravitus-inspired
 * refresh repurposed it to copy the previous session's weight/reps into this
 * set instead (`SwipeableRow` supports only one action per side), with the
 * expand/collapse trigger relocated onto a tap of the set-number/focus
 * control - never a modal either way (ADR-0007 rule 4). `SwipeableRow`
 * already exposes both actions through `accessibilityActions`/
 * `onAccessibilityAction` for a screen-reader or switch-control user, so no
 * separate non-gesture affordance is added here.
 *
 * Completion is a single tap on the checkbox using whatever the row already
 * holds (NFR-01: "completable in two taps from a pre-filled row, no
 * keyboard" - `appendSet`'s own pre-fill means the fields are usually already
 * right, so the *first* of the two taps is "focus/adjust via
 * `QuickAdjustBar`" and is optional, not required). Weight/reps can also be
 * typed directly via the two `NumberField`s, each debounced through
 * `useDebouncedFieldCommit` rather than committing per keystroke.
 *
 * Gravitus-inspired refresh: swipe right used to toggle this row's inline
 * expanded editor; it now copies the previous session's weight/reps into
 * this set instead (`SwipeableRow` only supports one action per side, and
 * this was the approved trade). The expand/collapse trigger moved onto a
 * tap of the set-number/focus control below, so no functionality was lost,
 * just relocated.
 *
 * P15 (performance hardening): wrapped in `React.memo` with the default
 * shallow prop comparison - every prop `SessionExerciseCard` passes down is
 * already stable render-over-render for an untouched set (its own
 * memoized `orderedSets`/`displayNumbers`, and the screen-level callbacks
 * it forwards straight through unchanged), so this stops an edit to one set
 * from re-rendering every other set in the same card.
 */
export const SetRow = memo(function SetRow({
  set,
  displayNumber,
  isFocused,
  prRecords,
  previousSet,
  onFocus,
  onComplete,
  onUncomplete,
  onUpdate,
  onDelete,
  onAddDropSet,
  testID,
}: SetRowProps) {
  useRenderCount(`SetRow:${set.id}`);

  const [expanded, setExpanded] = useState(false);
  const isDropSegment = displayNumber.isDropSegment;

  const [weightDraft, setWeightDraft, cancelWeightCommit] = useDebouncedFieldCommit(
    set.weightKg,
    (weightKg) => onUpdate(set.id, { weightKg }),
  );
  const [repsDraft, setRepsDraft, cancelRepsCommit] = useDebouncedFieldCommit(set.reps, (reps) =>
    onUpdate(set.id, { reps }),
  );
  const [rpeDraft, setRpeDraft, cancelRpeCommit] = useDebouncedFieldCommit(set.rpe, (rpe) =>
    onUpdate(set.id, { rpe }),
  );
  const [noteDraft, setNoteDraft, cancelNoteCommit] = useDebouncedFieldCommit(
    set.note ?? '',
    (note) => onUpdate(set.id, { note: note.trim() === '' ? null : note }),
  );

  // Completing a set used to call `onComplete(set)` with no values, relying
  // on each field's own independent debounced `updateSet` write to have
  // already landed - a real race (not just a theoretical one; confirmed on
  // a real Android device) between that write and `completeSet`'s own write,
  // where either could resolve last and its full-object-replace response
  // stomp the other's field. `handleComplete` instead reads whatever this
  // row currently has on screen - including an edit still sitting in its
  // debounce window, not yet committed anywhere - and sends it straight
  // through `completeSet`'s own `CompleteSetValues`, the one write that then
  // atomically carries weight/reps/rpe/note *and* completion together.
  // `cancel*Commit` drops each field's now-redundant pending timer so it
  // can't fire a second, independent write afterward and reopen the same
  // race.
  function handleComplete() {
    cancelWeightCommit();
    cancelRepsCommit();
    cancelRpeCommit();
    cancelNoteCommit();
    const values: CompleteSetValues = {
      weightKg: weightDraft,
      reps: repsDraft,
      rpe: rpeDraft,
      note: noteDraft.trim() === '' ? null : noteDraft,
    };
    onComplete(set, values);
  }

  // Only offers the copy when there is a real previous value behind it -
  // both fields null (e.g. a duration/distance-only set last time) means
  // nothing to copy, so the action is hidden rather than a no-op tap target.
  const canCopyPrevious =
    previousSet !== undefined && (previousSet.weightKg !== null || previousSet.reps !== null);

  // Writes through the same debounced-commit path typing already uses
  // (`setWeightDraft`/`setRepsDraft` update the draft and schedule the
  // normal `onUpdate` commit) rather than a raw direct write - only the
  // fields the previous set actually had a value for are touched.
  function handleCopyPrevious() {
    if (!previousSet) {
      return;
    }
    if (previousSet.weightKg !== null) {
      setWeightDraft(previousSet.weightKg);
    }
    if (previousSet.reps !== null) {
      setRepsDraft(previousSet.reps);
    }
  }

  const leftAction: SwipeableRowAction = {
    icon: <Ionicons name="trash-outline" size={20} color={color.textInverse} />,
    label: t('workoutLogging.set.deleteAccessibilityLabel'),
    color: color.danger,
    onTrigger: () => onDelete(set),
  };
  // Item 4 fix: the type picker used to be an inline `Row wrap` of `Chip`s
  // inside this row's own expanding section, which pushed every row below
  // it down the screen on every tap. It now opens as a bottom sheet instead
  // (the app's established "present a sheet with this content" pattern,
  // see `ExerciseFilterSheetContent`) - the row itself never changes height
  // for this interaction.
  function openTypePicker() {
    useSheetStore.getState().present({
      id: `set-type-picker-${set.id}`,
      content: (
        <SetTypePickerSheetContent
          currentType={set.setType}
          onSelect={(setType) => {
            onUpdate(set.id, { setType });
            useSheetStore.getState().dismissCurrent();
          }}
          testID={testID ? `${testID}-type-picker` : undefined}
        />
      ),
      snapPoints: [0.35],
    });
  }

  const rightAction: SwipeableRowAction | undefined = canCopyPrevious
    ? {
        icon: <Ionicons name="copy-outline" size={20} color={color.textInverse} />,
        label: t('workoutLogging.set.copyPreviousAccessibilityLabel'),
        color: color.accent,
        onTrigger: handleCopyPrevious,
      }
    : undefined;

  const completeLabel = set.isCompleted
    ? t('workoutLogging.set.uncompleteAccessibilityLabelTemplate', { number: displayNumber.label })
    : t('workoutLogging.set.completeAccessibilityLabelTemplate', { number: displayNumber.label });

  // P8's `PRBadge` is deliberately rendered as a sibling *outside*
  // `SwipeableRow`'s single child rather than inside it (accessibility
  // finding A11Y-P8-001). `SwipeableRow` clones its `accessible`/
  // `accessibilityActions` props onto whatever single element it's given as
  // `children` (see `attachAccessibilityActions` in
  // `components/gestures/SwipeableRow.tsx`) - that's the exact same
  // collapse-a-multi-control-child pattern P7's `RestTimerBar` fix already
  // solved for this codebase (CLAUDE.md's P7 section), and the fix here is
  // the same shape: keep the swipe gesture's target scoped to the row's own
  // controls, and render the badge as an independent sibling below it so it
  // isn't swallowed by that clone. `PRBadge` has no `onPress` and no swipe
  // affinity of its own - it never needed to be inside the swipeable region.
  return (
    <View>
      <SwipeableRow leftAction={leftAction} rightAction={rightAction} testID={testID}>
        <View
          style={{
            backgroundColor: isFocused ? color.surfaceElevated : 'transparent',
            borderRadius: radius.md,
          }}
        >
          <Row
            gap={2}
            align="center"
            style={{
              paddingVertical: space[2],
              paddingHorizontal: space[2],
              marginLeft: isDropSegment ? space[6] : 0,
            }}
          >
            <Column gap={1} style={{ minWidth: 56, alignItems: 'flex-start' }}>
              <PressScale
                onPress={() => {
                  onFocus(set.id);
                  setExpanded((current) => !current);
                }}
                accessibilityRole="button"
                accessibilityLabel={t('workoutLogging.set.focusAccessibilityLabelTemplate', {
                  number: displayNumber.label,
                  type: setTypeLabel(set.setType),
                })}
                accessibilityHint={t('workoutLogging.set.editAccessibilityHint')}
              >
                <Text variant="numeric" color="primary">
                  {displayNumber.label}
                </Text>
              </PressScale>
              {isDropSegment ? (
                <Text variant="caption" color="tertiary">
                  {t('workoutLogging.set.dropLabel')}
                </Text>
              ) : (
                // Item 4 fix: tapping the badge opens the set-type picker as
                // a bottom sheet (`openTypePicker` above) instead of
                // expanding this row inline - the badge itself never grows,
                // so it also doubles as the always-visible "currently
                // selected type" indicator the row already had.
                <PressScale
                  onPress={openTypePicker}
                  accessibilityRole="button"
                  accessibilityLabel={t('workoutLogging.set.typeAccessibilityLabelTemplate', {
                    type: setTypeLabel(set.setType),
                  })}
                  accessibilityHint={t('workoutLogging.set.typePickerAccessibilityHint')}
                  style={{
                    paddingHorizontal: space[1],
                    borderRadius: radius.sm,
                    backgroundColor: setTypeBadgeColor(set.setType),
                    alignSelf: 'flex-start',
                  }}
                  testID={testID ? `${testID}-type-badge` : undefined}
                >
                  <Text variant="caption" color="inverse" numberOfLines={1}>
                    {setTypeLabel(set.setType)}
                  </Text>
                </PressScale>
              )}
            </Column>

            <NumberField
              value={weightDraft}
              onChange={setWeightDraft}
              precision={2}
              min={0}
              unitSuffix={t('workoutLogging.set.weightUnitSuffix')}
              accessibilityLabel={t('workoutLogging.set.weightAccessibilityLabel')}
              testID={testID ? `${testID}-weight` : undefined}
            />
            <NumberField
              value={repsDraft}
              onChange={setRepsDraft}
              min={0}
              max={1000}
              accessibilityLabel={t('workoutLogging.set.repsAccessibilityLabel')}
              testID={testID ? `${testID}-reps` : undefined}
            />

            <View style={{ marginLeft: 'auto' }}>
              <Checkbox
                value={set.isCompleted}
                onValueChange={(next) => (next ? handleComplete() : onUncomplete(set.id))}
                accessibilityLabel={completeLabel}
                testID={testID ? `${testID}-complete` : undefined}
              />
            </View>
          </Row>

          {expanded ? (
            <Column
              gap={3}
              style={{
                paddingHorizontal: space[2],
                paddingBottom: space[3],
                marginLeft: isDropSegment ? space[6] : 0,
              }}
            >
              <Row gap={3} align="center">
                <Text variant="footnote" color="secondary">
                  {t('workoutLogging.set.rpeAccessibilityLabel')}
                </Text>
                <NumberField
                  value={rpeDraft}
                  onChange={setRpeDraft}
                  min={1}
                  max={10}
                  precision={1}
                  accessibilityLabel={t('workoutLogging.set.rpeAccessibilityLabel')}
                  testID={testID ? `${testID}-rpe` : undefined}
                />
              </Row>

              <TextField
                label={t('workoutLogging.set.noteLabel')}
                value={noteDraft}
                onChangeText={setNoteDraft}
                placeholder={t('workoutLogging.set.notePlaceholder')}
                testID={testID ? `${testID}-note` : undefined}
              />

              {!isDropSegment ? (
                <Chip
                  label={t('workoutLogging.set.addDropSetButtonLabel')}
                  icon={<Ionicons name="add" size={14} color={color.textPrimary} />}
                  onPress={() => onAddDropSet(set.id)}
                  testID={testID ? `${testID}-add-drop-set` : undefined}
                />
              ) : null}
            </Column>
          ) : null}
        </View>
      </SwipeableRow>

      {prRecords && prRecords.length > 0 ? (
        <View
          style={{
            paddingHorizontal: space[2],
            paddingBottom: space[2],
            marginLeft: isDropSegment ? space[6] : 0,
            alignItems: 'flex-start',
          }}
        >
          <PRBadge records={prRecords} testID={testID ? `${testID}-pr-badge` : undefined} />
        </View>
      ) : null}
    </View>
  );
});
