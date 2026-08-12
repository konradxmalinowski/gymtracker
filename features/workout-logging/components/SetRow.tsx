import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';

import { Column, Row } from '@/components/layout';
import { Checkbox, Chip, NumberField, Text, TextField } from '@/components/ui';
import { SwipeableRow, type SwipeableRowAction } from '@/components/gestures/SwipeableRow';
import { PressScale } from '@/components/gestures/PressScale';
import type { SetDisplayNumber, UpdateSetPatch, WorkoutSet } from '@/features/workout-logging';
import { PRBadge, type PersonalRecord } from '@/features/records';
import { t } from '@/i18n';
import { color, radius, space } from '@/theme/tokens';

import { useDebouncedFieldCommit } from '../hooks/useDebouncedFieldCommit';
import { PICKABLE_SET_TYPES, setTypeBadgeColor, setTypeLabel } from './setTypeDisplay';

export interface SetRowProps {
  set: WorkoutSet;
  displayNumber: SetDisplayNumber;
  isFocused: boolean;
  /** P8: this set's newly-earned PRs (`SessionExerciseCard`'s `latestPR` prop, matched by set id), `undefined` when this isn't the set that just earned one. */
  prRecords?: readonly PersonalRecord[] | undefined;
  onFocus: (setId: string) => void;
  onComplete: (set: WorkoutSet) => void;
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
 * `SetRow` in a card doesn't wire up its own independent toast), swipe right
 * toggles this row's own inline expanded editor - never a modal (ADR-0007
 * rule 4). `SwipeableRow` already exposes both actions through
 * `accessibilityActions`/`onAccessibilityAction` for a screen-reader or
 * switch-control user, so no separate non-gesture affordance is added here.
 *
 * Completion is a single tap on the checkbox using whatever the row already
 * holds (NFR-01: "completable in two taps from a pre-filled row, no
 * keyboard" - `appendSet`'s own pre-fill means the fields are usually already
 * right, so the *first* of the two taps is "focus/adjust via
 * `QuickAdjustBar`" and is optional, not required). Weight/reps can also be
 * typed directly via the two `NumberField`s, each debounced through
 * `useDebouncedFieldCommit` rather than committing per keystroke.
 */
export function SetRow({
  set,
  displayNumber,
  isFocused,
  prRecords,
  onFocus,
  onComplete,
  onUncomplete,
  onUpdate,
  onDelete,
  onAddDropSet,
  testID,
}: SetRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isDropSegment = displayNumber.isDropSegment;

  const [weightDraft, setWeightDraft] = useDebouncedFieldCommit(set.weightKg, (weightKg) =>
    onUpdate(set.id, { weightKg }),
  );
  const [repsDraft, setRepsDraft] = useDebouncedFieldCommit(set.reps, (reps) =>
    onUpdate(set.id, { reps }),
  );
  const [rpeDraft, setRpeDraft] = useDebouncedFieldCommit(set.rpe, (rpe) =>
    onUpdate(set.id, { rpe }),
  );
  const [noteDraft, setNoteDraft] = useDebouncedFieldCommit(set.note ?? '', (note) =>
    onUpdate(set.id, { note: note.trim() === '' ? null : note }),
  );

  const leftAction: SwipeableRowAction = {
    icon: <Ionicons name="trash-outline" size={20} color={color.textInverse} />,
    label: t('workoutLogging.set.deleteAccessibilityLabel'),
    color: color.danger,
    onTrigger: () => onDelete(set),
  };
  const rightAction: SwipeableRowAction = {
    icon: <Ionicons name="create-outline" size={20} color={color.textInverse} />,
    label: t('workoutLogging.set.editAccessibilityLabel'),
    color: color.accent,
    onTrigger: () => setExpanded((current) => !current),
  };

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
            <PressScale
              onPress={() => onFocus(set.id)}
              accessibilityRole="button"
              accessibilityLabel={t('workoutLogging.set.focusAccessibilityLabelTemplate', {
                number: displayNumber.label,
                type: setTypeLabel(set.setType),
              })}
              style={{ minWidth: 56, alignItems: 'flex-start' }}
            >
              <Column gap={1}>
                <Text variant="numeric" color="primary">
                  {displayNumber.label}
                </Text>
                {isDropSegment ? (
                  <Text variant="caption" color="tertiary">
                    {t('workoutLogging.set.dropLabel')}
                  </Text>
                ) : (
                  <View
                    style={{
                      paddingHorizontal: space[1],
                      borderRadius: radius.sm,
                      backgroundColor: setTypeBadgeColor(set.setType),
                      alignSelf: 'flex-start',
                    }}
                  >
                    <Text variant="caption" color="inverse" numberOfLines={1}>
                      {setTypeLabel(set.setType)}
                    </Text>
                  </View>
                )}
              </Column>
            </PressScale>

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
                onValueChange={(next) => (next ? onComplete(set) : onUncomplete(set.id))}
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
              {!isDropSegment ? (
                <Row gap={2} wrap>
                  {PICKABLE_SET_TYPES.map((type) => (
                    <Chip
                      key={type}
                      label={setTypeLabel(type)}
                      selected={set.setType === type}
                      onPress={() => onUpdate(set.id, { setType: type })}
                      size="sm"
                      testID={testID ? `${testID}-type-${type}` : undefined}
                    />
                  ))}
                </Row>
              ) : (
                <Text variant="footnote" color="secondary">
                  {t('workoutLogging.set.dropSegmentLabel')}
                </Text>
              )}

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
}
