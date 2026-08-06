import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { z } from 'zod';

import { Column, Row, Screen } from '@/components/layout';
import { Button, Chip, Text, TextField } from '@/components/ui';
import { ErrorState, Skeleton } from '@/components/feedback';
import {
  EXERCISE_NAME_MAX_LENGTH,
  EXERCISE_NOTE_MAX_LENGTH,
  ExerciseValidationError,
  type CreateCustomExerciseInput,
  type ExerciseLevel,
  type ExerciseMuscleRef,
} from '@/features/exercise-library';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { space } from '@/theme/tokens';

import { useCreateExercise } from '../hooks/useCreateExercise';
import { useExercise } from '../hooks/useExercise';
import { useUpdateExercise } from '../hooks/useUpdateExercise';
import { BODY_PART_LABELS, EQUIPMENT_LABELS, MUSCLE_LABELS, LEVEL_LABELS } from '../types/labels';

const MUSCLE_OPTIONS = Object.entries(MUSCLE_LABELS).map(([slug, label]) => ({ slug, label }));
const EQUIPMENT_OPTIONS = Object.entries(EQUIPMENT_LABELS).map(([slug, label]) => ({
  slug,
  label,
}));
const BODY_PART_OPTIONS = Object.entries(BODY_PART_LABELS).map(([slug, label]) => ({
  slug,
  label,
}));
const LEVEL_OPTIONS = (Object.entries(LEVEL_LABELS) as [ExerciseLevel, string][]).map(
  ([value, label]) => ({ slug: value, label }),
);

const exerciseFormSchema = z.object({
  nameEn: z
    .string()
    .trim()
    .min(1, t('exerciseLibrary.form.nameRequiredError'))
    .max(
      EXERCISE_NAME_MAX_LENGTH,
      t('exerciseLibrary.form.nameTooLongError', { max: EXERCISE_NAME_MAX_LENGTH }),
    ),
  namePl: z
    .string()
    .trim()
    .max(
      EXERCISE_NAME_MAX_LENGTH,
      t('exerciseLibrary.form.nameTooLongError', { max: EXERCISE_NAME_MAX_LENGTH }),
    ),
  primaryMuscleSlugs: z
    .array(z.string())
    .min(1, t('exerciseLibrary.form.primaryMuscleRequiredError')),
  secondaryMuscleSlugs: z.array(z.string()),
  equipmentSlug: z.string().min(1, t('exerciseLibrary.form.equipmentRequiredError')),
  bodyPart: z.string(),
  level: z.union([z.literal(''), z.enum(['beginner', 'intermediate', 'expert'])]),
  notes: z.string().max(EXERCISE_NOTE_MAX_LENGTH),
});

type ExerciseFormValues = z.infer<typeof exerciseFormSchema>;

const EMPTY_FORM_VALUES: ExerciseFormValues = {
  nameEn: '',
  namePl: '',
  primaryMuscleSlugs: [],
  secondaryMuscleSlugs: [],
  equipmentSlug: '',
  bodyPart: '',
  level: '',
  notes: '',
};

export type ExerciseFormScreenProps = { mode: 'create' } | { mode: 'edit'; exerciseId: string };

/**
 * Shared body for `app/(tabs)/exercises/create.tsx` and
 * `app/(tabs)/exercises/edit/[id].tsx`. React Hook Form + `zodResolver` mirrors
 * `OnboardingScreen`'s pattern; `exerciseFormSchema` is a client-side-only mirror
 * of `ExerciseService`'s own Zod validation (belt-and-suspenders per this phase's
 * brief) - a validation failure that slips past this schema and still comes back
 * from `createCustom`/`updateCustom` as `ExerciseValidationError` is mapped onto
 * the closest matching field, falling back to a generic error line for anything
 * that doesn't map cleanly.
 */
export function ExerciseFormScreen(props: ExerciseFormScreenProps) {
  const isEditMode = props.mode === 'edit';
  const existing = useExercise(isEditMode ? props.exerciseId : undefined);
  const createExercise = useCreateExercise();
  const updateExercise = useUpdateExercise();
  const hasInitialized = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    getValues,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ExerciseFormValues>({
    resolver: zodResolver(exerciseFormSchema),
    defaultValues: EMPTY_FORM_VALUES,
    mode: 'onBlur',
  });

  useEffect(() => {
    if (isEditMode && existing.data && !hasInitialized.current) {
      hasInitialized.current = true;
      const exercise = existing.data;
      reset({
        nameEn: exercise.nameEn,
        namePl: exercise.namePl ?? '',
        primaryMuscleSlugs: exercise.muscles
          .filter((muscle) => muscle.role === 'primary')
          .map((muscle) => muscle.slug),
        secondaryMuscleSlugs: exercise.muscles
          .filter((muscle) => muscle.role === 'secondary')
          .map((muscle) => muscle.slug),
        equipmentSlug: exercise.equipmentSlug ?? '',
        bodyPart: exercise.bodyPart ?? '',
        level: exercise.level ?? '',
        notes: exercise.instructions.join('\n'),
      });
    }
  }, [isEditMode, existing.data, reset]);

  function toggleMuscle(field: 'primaryMuscleSlugs' | 'secondaryMuscleSlugs', slug: string) {
    const otherField =
      field === 'primaryMuscleSlugs' ? 'secondaryMuscleSlugs' : 'primaryMuscleSlugs';
    const current = getValues(field);
    const isSelected = current.includes(slug);
    setValue(field, isSelected ? current.filter((item) => item !== slug) : [...current, slug], {
      shouldValidate: true,
    });
    if (!isSelected) {
      const other = getValues(otherField);
      if (other.includes(slug)) {
        setValue(
          otherField,
          other.filter((item) => item !== slug),
          { shouldValidate: true },
        );
      }
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);

    const muscles: ExerciseMuscleRef[] = [
      ...values.primaryMuscleSlugs.map((slug) => ({ slug, role: 'primary' as const })),
      ...values.secondaryMuscleSlugs.map((slug) => ({ slug, role: 'secondary' as const })),
    ];
    // `TextField` is single-line (no `multiline` prop exists on it), so the
    // notes field can never contain a real newline to split on - it maps to
    // `instructions` as a single free-text entry rather than a numbered list.
    const trimmedNotes = values.notes.trim();
    const instructions = trimmedNotes === '' ? [] : [trimmedNotes];

    const payload: CreateCustomExerciseInput = {
      nameEn: values.nameEn.trim(),
      namePl: values.namePl.trim() === '' ? null : values.namePl.trim(),
      equipmentSlug: values.equipmentSlug,
      bodyPart: values.bodyPart === '' ? null : values.bodyPart,
      level: values.level === '' ? null : values.level,
      instructions,
      muscles,
    };

    try {
      if (props.mode === 'create') {
        const created = await createExercise.mutateAsync(payload);
        router.replace(routes.exercises.detail(created.id));
      } else {
        const updated = await updateExercise.mutateAsync({ id: props.exerciseId, patch: payload });
        router.replace(routes.exercises.detail(updated.id));
      }
    } catch (error) {
      if (error instanceof ExerciseValidationError) {
        applyServerIssues(error.issues);
      } else {
        setSubmitError(t('exerciseLibrary.form.genericErrorMessage'));
      }
    }
  });

  function applyServerIssues(issues: ExerciseValidationError['issues']) {
    let mapped = false;
    for (const issue of issues) {
      const key = issue.path[0];
      if (key === 'nameEn') {
        setError('nameEn', { message: issue.message });
        mapped = true;
      } else if (key === 'namePl') {
        setError('namePl', { message: issue.message });
        mapped = true;
      } else if (key === 'equipmentSlug') {
        setError('equipmentSlug', { message: issue.message });
        mapped = true;
      } else if (key === 'muscles') {
        setError('primaryMuscleSlugs', { message: issue.message });
        mapped = true;
      }
    }
    if (!mapped) {
      setSubmitError(t('exerciseLibrary.form.genericErrorMessage'));
    }
  }

  if (isEditMode && existing.isPending) {
    return (
      <Screen testID="exercise-form-screen" scroll>
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
      <Screen testID="exercise-form-screen">
        <ErrorState
          error={t('exerciseLibrary.detail.loadErrorMessage')}
          onRetry={() => existing.refetch()}
        />
      </Screen>
    );
  }

  // Defensive: the detail screen never shows an Edit action for a catalog
  // exercise, but a direct deep link to `/exercises/edit/:id` could still land
  // here for one - `updateCustom` would reject it as `ExerciseNotEditableError`
  // anyway, this just fails visibly before the user fills out a form for nothing.
  if (isEditMode && existing.data && existing.data.source !== 'custom') {
    return (
      <Screen testID="exercise-form-screen">
        <ErrorState error={t('exerciseLibrary.detail.loadErrorMessage')} />
      </Screen>
    );
  }

  return (
    <Screen testID="exercise-form-screen" scroll>
      <Column gap={6} style={{ paddingVertical: space[4] }}>
        <Text variant="title2" color="primary">
          {props.mode === 'create'
            ? t('exerciseLibrary.form.createTitle')
            : t('exerciseLibrary.form.editTitle')}
        </Text>

        <Controller
          control={control}
          name="nameEn"
          render={({ field: { value, onChange, onBlur } }) => (
            <TextField
              label={t('exerciseLibrary.form.nameEnLabel')}
              placeholder={t('exerciseLibrary.form.nameEnPlaceholder')}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.nameEn?.message}
              maxLength={EXERCISE_NAME_MAX_LENGTH}
              testID="exercise-form-name-en"
            />
          )}
        />

        <Controller
          control={control}
          name="namePl"
          render={({ field: { value, onChange, onBlur } }) => (
            <TextField
              label={t('exerciseLibrary.form.namePlLabel')}
              placeholder={t('exerciseLibrary.form.namePlPlaceholder')}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.namePl?.message}
              maxLength={EXERCISE_NAME_MAX_LENGTH}
              testID="exercise-form-name-pl"
            />
          )}
        />

        <Column gap={3}>
          <Text variant="title3" color="primary">
            {t('exerciseLibrary.form.musclesSectionTitle')}
          </Text>

          <Controller
            control={control}
            name="primaryMuscleSlugs"
            render={({ field: { value } }) => (
              <ChipSelectGroup
                title={t('exerciseLibrary.form.primaryMusclesLabel')}
                options={MUSCLE_OPTIONS}
                selected={value}
                onToggle={(slug) => toggleMuscle('primaryMuscleSlugs', slug)}
                error={errors.primaryMuscleSlugs?.message}
                testID="exercise-form-primary-muscle"
              />
            )}
          />

          <Controller
            control={control}
            name="secondaryMuscleSlugs"
            render={({ field: { value } }) => (
              <ChipSelectGroup
                title={t('exerciseLibrary.form.secondaryMusclesLabel')}
                options={MUSCLE_OPTIONS}
                selected={value}
                onToggle={(slug) => toggleMuscle('secondaryMuscleSlugs', slug)}
                testID="exercise-form-secondary-muscle"
              />
            )}
          />
        </Column>

        <Controller
          control={control}
          name="equipmentSlug"
          render={({ field: { value, onChange } }) => (
            <ChipSelectGroup
              title={t('exerciseLibrary.form.equipmentLabel')}
              options={EQUIPMENT_OPTIONS}
              selected={value ? [value] : []}
              onToggle={(slug) => onChange(value === slug ? '' : slug)}
              error={errors.equipmentSlug?.message}
              testID="exercise-form-equipment"
            />
          )}
        />

        <Controller
          control={control}
          name="bodyPart"
          render={({ field: { value, onChange } }) => (
            <ChipSelectGroup
              title={t('exerciseLibrary.form.bodyPartLabel')}
              options={BODY_PART_OPTIONS}
              selected={value ? [value] : []}
              onToggle={(slug) => onChange(value === slug ? '' : slug)}
              testID="exercise-form-body-part"
            />
          )}
        />

        <Controller
          control={control}
          name="level"
          render={({ field: { value, onChange } }) => (
            <ChipSelectGroup
              title={t('exerciseLibrary.form.levelLabel')}
              options={LEVEL_OPTIONS}
              selected={value ? [value] : []}
              onToggle={(slug) => onChange(value === slug ? '' : (slug as ExerciseLevel))}
              testID="exercise-form-level"
            />
          )}
        />

        <Controller
          control={control}
          name="notes"
          render={({ field: { value, onChange, onBlur } }) => (
            <TextField
              label={t('exerciseLibrary.form.instructionsLabel')}
              placeholder={t('exerciseLibrary.form.instructionsPlaceholder')}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              maxLength={EXERCISE_NOTE_MAX_LENGTH}
              testID="exercise-form-notes"
            />
          )}
        />

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
          label={t('exerciseLibrary.form.saveLabel')}
          onPress={onSubmit}
          loading={isSubmitting || createExercise.isPending || updateExercise.isPending}
          fullWidth
          testID="exercise-form-save-button"
        />
      </Column>
    </Screen>
  );
}

function ChipSelectGroup({
  title,
  options,
  selected,
  onToggle,
  error,
  testID,
}: {
  title: string;
  options: readonly { slug: string; label: string }[];
  selected: readonly string[];
  onToggle: (slug: string) => void;
  error?: string | undefined;
  testID: string;
}) {
  return (
    <Column gap={2}>
      <Text variant="label" color="secondary">
        {title}
      </Text>
      <Row gap={2} wrap>
        {options.map((option) => (
          <Chip
            key={option.slug}
            label={option.label}
            selected={selected.includes(option.slug)}
            onPress={() => onToggle(option.slug)}
            testID={`${testID}-${option.slug}`}
          />
        ))}
      </Row>
      {error ? (
        <Text
          variant="caption"
          color="danger"
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {error}
        </Text>
      ) : null}
    </Column>
  );
}
