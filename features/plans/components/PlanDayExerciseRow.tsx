import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import {
  Image,
  View,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
} from 'react-native';

// No `@/assets/*` tsconfig path alias exists yet - see ExerciseImageGallery.tsx's identical note.
import { getExerciseImageSource } from '../../../assets/exercises';
import { Column, Row } from '@/components/layout';
import { Checkbox, IconButton, Text } from '@/components/ui';
import { PressScale } from '@/components/gestures/PressScale';
import { formatExerciseName } from '@/features/exercise-library';
import type { PlanDayExercise } from '@/features/plans';
import { t } from '@/i18n';
import { color, radius, space } from '@/theme/tokens';

import { formatDayExerciseTarget } from '../domain/formatDayExerciseTarget';

const THUMBNAIL_SIZE = 44;

export interface PlanDayExerciseRowProps {
  dayExercise: PlanDayExercise;
  /** Multi-select mode (the "Group" action bar's source list) - swaps the leading thumbnail for a checkbox and routes taps through `onToggleSelected` instead of `onPress`. */
  selectMode: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  /** Opens the inline edit sheet for target sets/reps/RPE/rest/note - ignored while `selectMode` is true. */
  onPress: () => void;
  onRemove: () => void;
  /** Present only when `dayExercise.supersetGroup !== null` - removes just this one exercise from its group back to standalone. */
  onUngroup?: (() => void) | undefined;
  dragHandle?: ReactNode | undefined;
  /** Forwarded to the root `PressScale` - see `PlanCard.tsx`'s identical props for why this can't be a closed prop interface with no pass-through. */
  accessible?: boolean | undefined;
  accessibilityActions?: readonly AccessibilityActionInfo[] | undefined;
  onAccessibilityAction?: ((event: AccessibilityActionEvent) => void) | undefined;
  testID?: string | undefined;
}

/**
 * Day editor's row (ARCHITECTURE.md's `plans` component table). Target
 * fields are summarized on one line and edited via an inline sheet
 * (`onPress`) rather than exploding into a form on this row itself - the
 * "avoid modal spam, inline editing" nav rule this phase's brief calls out,
 * same shape `ExerciseDetailScreen`'s note/rest-override fields already
 * establish for a single screen's worth of inline editing (this is a sheet
 * instead of inline-on-screen only because a plan day already has a lot of
 * on-screen rows; the target fields themselves are still edited without a
 * full-screen form).
 */
export function PlanDayExerciseRow({
  dayExercise,
  selectMode,
  selected,
  onToggleSelected,
  onPress,
  onRemove,
  onUngroup,
  dragHandle,
  accessible,
  accessibilityActions,
  onAccessibilityAction,
  testID,
}: PlanDayExerciseRowProps) {
  const exercise = dayExercise.exercise;
  const name = formatExerciseNameSafe(exercise);
  const imageSource = getExerciseImageSource(exercise.primaryImage ?? undefined);
  const targetSummary = formatDayExerciseTarget(dayExercise);

  return (
    <PressScale
      onPress={selectMode ? onToggleSelected : onPress}
      accessibilityRole={selectMode ? 'checkbox' : 'button'}
      accessibilityLabel={name}
      accessibilityState={selectMode ? { checked: selected } : undefined}
      accessible={accessible}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      style={{ borderBottomWidth: 1, borderBottomColor: color.border }}
      testID={testID}
    >
      <Row gap={3} align="center" style={{ paddingVertical: space[3], paddingHorizontal: space[4] }}>
        {dragHandle ? <View>{dragHandle}</View> : null}

        {selectMode ? (
          <Checkbox
            value={selected}
            onValueChange={onToggleSelected}
            accessibilityLabel={name}
          />
        ) : (
          <View
            style={{
              width: THUMBNAIL_SIZE,
              height: THUMBNAIL_SIZE,
              borderRadius: radius.md,
              overflow: 'hidden',
              backgroundColor: color.surfaceElevated,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {imageSource ? (
              <Image
                source={imageSource}
                style={{ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE }}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <Ionicons name="barbell-outline" size={20} color={color.textTertiary} />
            )}
          </View>
        )}

        <Column gap={1} style={{ flex: 1 }}>
          <Text variant="bodyMedium" color="primary" numberOfLines={1}>
            {name}
          </Text>
          {targetSummary ? (
            <Text variant="footnote" color="secondary" numberOfLines={1}>
              {targetSummary}
            </Text>
          ) : null}
        </Column>

        {!selectMode ? (
          <Row gap={1} align="center">
            {onUngroup ? (
              <IconButton
                icon={<Ionicons name="git-branch-outline" size={18} color={color.textTertiary} />}
                variant="ghost"
                size="sm"
                accessibilityLabel={t('plans.day.ungroupAccessibilityLabelTemplate', { name })}
                onPress={onUngroup}
                testID={testID ? `${testID}-ungroup` : undefined}
              />
            ) : null}
            <IconButton
              icon={<Ionicons name="close-circle-outline" size={18} color={color.danger} />}
              variant="ghost"
              size="sm"
              accessibilityLabel={t('plans.day.removeAccessibilityLabelTemplate', { name })}
              onPress={onRemove}
              testID={testID ? `${testID}-remove` : undefined}
            />
          </Row>
        ) : null}
      </Row>
    </PressScale>
  );
}

function formatExerciseNameSafe(exercise: PlanDayExercise['exercise']): string {
  return formatExerciseName({
    nameEn: exercise.nameEn,
    namePl: exercise.namePl,
    displayNameOverride: exercise.displayNameOverride,
  });
}
