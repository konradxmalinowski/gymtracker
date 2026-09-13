import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { z } from 'zod';

import { Column, Row, Screen } from '@/components/layout';
import { Button, Chip, NumberField, Switch, Text, TextField } from '@/components/ui';
import { ErrorState, Skeleton } from '@/components/feedback';
import {
  DAILY_GOAL_NAME_MAX_LENGTH,
  DAILY_GOAL_UNIT_MAX_LENGTH,
  DailyGoalValidationError,
  type GoalType,
} from '@/features/daily-goals';
import { t } from '@/i18n';
import { color, space } from '@/theme/tokens';

import { getGoalIconOptions } from '../components/goalIcons';
import { WeekdayPicker } from '../components/WeekdayPicker';
import { useCreateGoal, useGoal, useSetGoalEnabled, useUpdateGoal } from '../hooks/useDailyGoals';

const GOAL_TYPES: readonly GoalType[] = ['boolean', 'counter', 'numeric'];
const ALL_WEEKDAYS = 127;

const goalFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, t('dailyGoals.form.nameRequiredError'))
      .max(
        DAILY_GOAL_NAME_MAX_LENGTH,
        t('dailyGoals.form.nameTooLongError', { max: DAILY_GOAL_NAME_MAX_LENGTH }),
      ),
    icon: z.string().nullable(),
    goalType: z.enum(GOAL_TYPES as [GoalType, ...GoalType[]]),
    targetValue: z.number().nullable(),
    unit: z
      .string()
      .trim()
      .max(
        DAILY_GOAL_UNIT_MAX_LENGTH,
        t('dailyGoals.form.nameTooLongError', { max: DAILY_GOAL_UNIT_MAX_LENGTH }),
      ),
    activeWeekdays: z.number().int().min(1).max(127),
    isEnabled: z.boolean(),
  })
  .refine(
    (data) => data.goalType === 'boolean' || (data.targetValue !== null && data.targetValue > 0),
    {
      message: t('dailyGoals.form.targetRequiredError'),
      path: ['targetValue'],
    },
  );

type GoalFormValues = z.infer<typeof goalFormSchema>;

const EMPTY_FORM_VALUES: GoalFormValues = {
  name: '',
  icon: null,
  goalType: 'boolean',
  targetValue: null,
  unit: '',
  activeWeekdays: ALL_WEEKDAYS,
  isEnabled: true,
};

export type GoalFormScreenProps = { mode: 'create' } | { mode: 'edit'; goalId: string };

/**
 * Shared body for `app/goals/manage/create.tsx` and
 * `app/goals/manage/edit/[goalId].tsx` - React Hook Form + `zodResolver`,
 * mirroring `ExerciseFormScreen`'s exact shape (client-side schema as a
 * belt-and-suspenders mirror of `DailyGoalService`'s own Zod validation, a
 * `hasInitialized` ref so `useGoal`'s async load only resets the form once).
 *
 * `isEnabled` is only shown in edit mode (a newly created goal always starts
 * enabled, matching `DailyGoalService`'s own repository default) and is
 * applied through a separate `useSetGoalEnabled` call after a successful
 * `updateGoal`, not folded into the update patch itself - `UpdateDailyGoalPatch`
 * has no `isEnabled` field; that's `setEnabled`'s own job per
 * `DailyGoalService`'s "hide without losing history" affordance.
 */
export function GoalFormScreen(props: GoalFormScreenProps) {
  const isEditMode = props.mode === 'edit';
  const existing = useGoal(isEditMode ? props.goalId : undefined);
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const setGoalEnabled = useSetGoalEnabled();
  const hasInitialized = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<GoalFormValues>({
    resolver: zodResolver(goalFormSchema),
    defaultValues: EMPTY_FORM_VALUES,
    mode: 'onBlur',
  });

  // `useWatch` rather than `useForm()`'s own returned `watch()` function -
  // the latter is a plain function, not a hook, and trips the React
  // Compiler's "cannot be memoized safely" warning
  // (`react-hooks/incompatible-library`) the moment its result drives
  // conditional rendering. `useWatch` is RHF's own hook built for exactly
  // this, and this codebase has no other RHF screen reading a field
  // reactively for conditional rendering to have already established a
  // precedent either way.
  const goalType = useWatch({ control, name: 'goalType' });

  useEffect(() => {
    if (isEditMode && existing.isPending) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    }
  }, [isEditMode, existing.isPending]);

  useEffect(() => {
    if (isEditMode && existing.data && !hasInitialized.current) {
      hasInitialized.current = true;
      const goal = existing.data;
      reset({
        name: goal.name,
        icon: goal.icon,
        goalType: goal.goalType,
        targetValue: goal.targetValue,
        unit: goal.unit ?? '',
        activeWeekdays: goal.activeWeekdays,
        isEnabled: goal.isEnabled,
      });
    }
  }, [isEditMode, existing.data, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);

    const payload = {
      name: values.name.trim(),
      icon: values.icon,
      goalType: values.goalType,
      targetValue: values.goalType === 'boolean' ? null : values.targetValue,
      unit: values.unit.trim() === '' ? null : values.unit.trim(),
      activeWeekdays: values.activeWeekdays,
    };

    try {
      if (props.mode === 'create') {
        await createGoal.mutateAsync(payload);
      } else {
        await updateGoal.mutateAsync({ id: props.goalId, patch: payload });
        if (existing.data && existing.data.isEnabled !== values.isEnabled) {
          await setGoalEnabled.mutateAsync({ id: props.goalId, isEnabled: values.isEnabled });
        }
      }
      router.back();
    } catch (error) {
      if (error instanceof DailyGoalValidationError) {
        applyServerIssues(error.issues);
      } else {
        setSubmitError(t('dailyGoals.form.genericErrorMessage'));
      }
    }
  });

  function applyServerIssues(issues: DailyGoalValidationError['issues']) {
    let mapped = false;
    for (const issue of issues) {
      const key = issue.path[0];
      if (key === 'name' || key === 'targetValue' || key === 'unit' || key === 'activeWeekdays') {
        setError(key, { message: issue.message });
        mapped = true;
      }
    }
    if (!mapped) {
      setSubmitError(t('dailyGoals.form.genericErrorMessage'));
    }
  }

  if (isEditMode && existing.isPending) {
    return (
      <Screen testID="goal-form-screen" scroll>
        <Column gap={4} style={{ paddingVertical: space[4] }}>
          <Skeleton width="60%" height={24} />
          <Skeleton width="100%" height={48} />
          <Skeleton width="100%" height={48} />
        </Column>
      </Screen>
    );
  }

  if (isEditMode && (existing.isError || !existing.data)) {
    return (
      <Screen testID="goal-form-screen">
        <ErrorState
          error={t('dailyGoals.form.loadErrorMessage')}
          onRetry={() => existing.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen testID="goal-form-screen" scroll>
      <Column gap={6} style={{ paddingVertical: space[4] }}>
        <Text variant="title2" color="primary">
          {props.mode === 'create'
            ? t('dailyGoals.form.createTitle')
            : t('dailyGoals.form.editTitle')}
        </Text>

        <Controller
          control={control}
          name="name"
          render={({ field: { value, onChange, onBlur } }) => (
            <TextField
              label={t('dailyGoals.form.nameLabel')}
              placeholder={t('dailyGoals.form.namePlaceholder')}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.name?.message}
              maxLength={DAILY_GOAL_NAME_MAX_LENGTH}
              testID="goal-form-name"
            />
          )}
        />

        <Column gap={2}>
          <Text variant="label" color="secondary">
            {t('dailyGoals.form.iconSectionTitle')}
          </Text>
          <Controller
            control={control}
            name="icon"
            render={({ field: { value, onChange } }) => (
              <Row gap={2} wrap>
                {getGoalIconOptions().map((option) => (
                  <Chip
                    key={option.name}
                    label={option.label}
                    icon={
                      <Ionicons
                        name={option.name}
                        size={14}
                        color={value === option.name ? color.accentText : color.textPrimary}
                      />
                    }
                    selected={value === option.name}
                    onPress={() => onChange(value === option.name ? null : option.name)}
                    testID={`goal-form-icon-${option.name}`}
                  />
                ))}
              </Row>
            )}
          />
        </Column>

        <Column gap={2}>
          <Text variant="label" color="secondary">
            {t('dailyGoals.form.typeSectionTitle')}
          </Text>
          <Controller
            control={control}
            name="goalType"
            render={({ field: { value, onChange } }) => (
              <Row gap={2}>
                <Chip
                  label={t('dailyGoals.form.typeBoolean')}
                  selected={value === 'boolean'}
                  onPress={() => onChange('boolean')}
                  testID="goal-form-type-boolean"
                />
                <Chip
                  label={t('dailyGoals.form.typeCounter')}
                  selected={value === 'counter'}
                  onPress={() => onChange('counter')}
                  testID="goal-form-type-counter"
                />
                <Chip
                  label={t('dailyGoals.form.typeNumeric')}
                  selected={value === 'numeric'}
                  onPress={() => onChange('numeric')}
                  testID="goal-form-type-numeric"
                />
              </Row>
            )}
          />
        </Column>

        {goalType !== 'boolean' ? (
          <Row gap={3}>
            <Column gap={2} style={{ flex: 1 }}>
              <Text variant="label" color="secondary">
                {t('dailyGoals.form.targetLabel')}
              </Text>
              <Controller
                control={control}
                name="targetValue"
                render={({ field: { value, onChange } }) => (
                  <NumberField
                    value={value}
                    onChange={onChange}
                    min={0}
                    precision={goalType === 'numeric' ? 1 : 0}
                    accessibilityLabel={t('dailyGoals.form.targetAccessibilityLabel')}
                    testID="goal-form-target"
                  />
                )}
              />
              {errors.targetValue?.message ? (
                <Text
                  variant="caption"
                  color="danger"
                  accessibilityLiveRegion="polite"
                  accessibilityRole="alert"
                >
                  {errors.targetValue.message}
                </Text>
              ) : null}
            </Column>
            <Column gap={2} style={{ flex: 1 }}>
              <Controller
                control={control}
                name="unit"
                render={({ field: { value, onChange, onBlur } }) => (
                  <TextField
                    label={t('dailyGoals.form.unitLabel')}
                    placeholder={t('dailyGoals.form.unitPlaceholder')}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    maxLength={DAILY_GOAL_UNIT_MAX_LENGTH}
                    testID="goal-form-unit"
                  />
                )}
              />
            </Column>
          </Row>
        ) : null}

        <Column gap={2}>
          <Text variant="label" color="secondary">
            {t('dailyGoals.form.daysSectionTitle')}
          </Text>
          <Controller
            control={control}
            name="activeWeekdays"
            render={({ field: { value, onChange } }) => (
              <WeekdayPicker activeWeekdays={value} onChange={onChange} testID="goal-form-days" />
            )}
          />
        </Column>

        {isEditMode ? (
          <Controller
            control={control}
            name="isEnabled"
            render={({ field: { value, onChange } }) => (
              <Row justify="space-between" align="center">
                <Column gap={1} style={{ flex: 1 }}>
                  <Text variant="body" color="primary">
                    {t('dailyGoals.form.enabledRowTitle')}
                  </Text>
                  <Text variant="footnote" color="secondary">
                    {t('dailyGoals.form.enabledRowSubtitle')}
                  </Text>
                </Column>
                <Switch
                  value={value}
                  onValueChange={onChange}
                  accessibilityLabel={t('dailyGoals.form.enabledRowTitle')}
                  testID="goal-form-enabled-switch"
                />
              </Row>
            )}
          />
        ) : null}

        {submitError ? (
          <Text
            variant="caption"
            color="danger"
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {submitError}
          </Text>
        ) : null}

        <Button
          label={t('dailyGoals.form.saveLabel')}
          onPress={() => void onSubmit()}
          loading={
            isSubmitting || createGoal.isPending || updateGoal.isPending || setGoalEnabled.isPending
          }
          fullWidth
          testID="goal-form-save-button"
        />
      </Column>
    </Screen>
  );
}
