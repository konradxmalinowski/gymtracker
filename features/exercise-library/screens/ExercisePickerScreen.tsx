import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Image, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';

// No `@/assets/*` tsconfig path alias exists yet - see ExerciseImageGallery.tsx's identical note.
import { getExerciseImageSource } from '../../../assets/exercises';
import { Column, Row, Screen } from '@/components/layout';
import { Button, Checkbox, Text, TextField } from '@/components/ui';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback';
import { PressScale } from '@/components/gestures/PressScale';
import { t } from '@/i18n';
import { color, radius, space } from '@/theme/tokens';

import { formatExerciseName } from '../domain/formatExerciseName';
import { DEFAULT_EXERCISE_FILTERS } from '../hooks/exerciseFilterStore';
import { useExerciseSearch } from '../hooks/useExerciseSearch';
import type { ExerciseListItem } from '../repository/ExerciseRepository';

const THUMBNAIL_SIZE = 40;

export interface ExercisePickerScreenProps {
  /** Exercise ids already present in the destination (e.g. already in this plan day) - rendered checked and non-toggleable rather than omitted, so the caller's existing selection stays visible for context. */
  alreadySelectedIds: readonly string[];
  onConfirm: (selectedIds: string[]) => void;
}

/**
 * `app/(modals)/exercise-picker.tsx`'s screen body. Multi-select sibling of
 * `ExerciseLibraryScreen` - reuses `useExerciseSearch` (the same instant,
 * diacritic-folded search this feature already ships) but renders a
 * `Checkbox` per row instead of navigating to the detail screen on tap, and
 * has no filter sheet of its own: a picker opened mid-flow (from the plan
 * day editor today, the future active-workout screen per the route graph)
 * is meant to be quick, not a second full library browse. Deliberately does
 * *not* read/write `useExerciseFilterStore` - that store is a single global
 * singleton shared with the real library screen, and this picker having its
 * own always-default filters keeps opening it from never silently
 * mutating (or being mutated by) whatever filters are active on the
 * Exercises tab.
 */
export function ExercisePickerScreen({ alreadySelectedIds, onConfirm }: ExercisePickerScreenProps) {
  const [searchText, setSearchText] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data, isPending, isError, refetch } = useExerciseSearch(
    searchText,
    DEFAULT_EXERCISE_FILTERS,
  );

  const alreadySelectedSet = new Set(alreadySelectedIds);

  useEffect(() => {
    // `accessibilityLiveRegion="polite"` on the count `Text` below is
    // Android-only - VoiceOver has no equivalent, so a selection change
    // would go unannounced on iOS without this. Mirrors the fix already
    // applied to Toast/ErrorState/TextField for the identical gap
    // (accessibility audit A11Y-002, reports/accessibility-2026-08-05-p1.md).
    AccessibilityInfo.announceForAccessibility(
      t('exerciseLibrary.picker.selectedCountLabel', { count: selectedIds.size }),
    );
  }, [selectedIds]);

  function toggle(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleConfirm() {
    onConfirm(Array.from(selectedIds));
  }

  return (
    <Screen testID="exercise-picker-screen" padded={false} edges={['bottom']}>
      <Column gap={3} style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: space[4], paddingTop: space[3] }}>
          <TextField
            value={searchText}
            onChangeText={setSearchText}
            placeholder={t('exerciseLibrary.searchPlaceholder')}
            testID="exercise-picker-search-field"
          />
        </View>

        <View style={{ flex: 1 }}>
          {isPending ? (
            <ExercisePickerSkeleton />
          ) : isError ? (
            <ErrorState error={t('exerciseLibrary.loadErrorMessage')} onRetry={() => refetch()} />
          ) : !data || data.length === 0 ? (
            <EmptyState
              illustration={<Ionicons name="search-outline" size={48} color={color.textTertiary} />}
              title={t('exerciseLibrary.emptyResultsTitle')}
              message={t('exerciseLibrary.emptyResultsMessage')}
              testID="exercise-picker-empty-state"
            />
          ) : (
            <FlashList
              data={data}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <ExercisePickerRow
                  item={item}
                  selected={selectedIds.has(item.id) || alreadySelectedSet.has(item.id)}
                  disabled={alreadySelectedSet.has(item.id)}
                  onToggle={() => toggle(item.id)}
                  testID={`exercise-picker-row-${item.id}`}
                />
              )}
              contentContainerStyle={{ paddingBottom: space[20] }}
              testID="exercise-picker-list"
            />
          )}
        </View>

        <View
          style={{
            paddingHorizontal: space[4],
            paddingVertical: space[3],
            borderTopWidth: 1,
            borderTopColor: color.border,
          }}
        >
          <Row justify="space-between" align="center" gap={3}>
            <Text
              variant="footnote"
              color="secondary"
              accessibilityLiveRegion="polite"
              testID="exercise-picker-selected-count"
            >
              {t('exerciseLibrary.picker.selectedCountLabel', { count: selectedIds.size })}
            </Text>
            <Button
              variant="primary"
              label={t('exerciseLibrary.picker.confirmButtonLabel')}
              onPress={handleConfirm}
              disabled={selectedIds.size === 0}
              testID="exercise-picker-confirm-button"
            />
          </Row>
        </View>
      </Column>
    </Screen>
  );
}

function ExercisePickerRow({
  item,
  selected,
  disabled,
  onToggle,
  testID,
}: {
  item: ExerciseListItem;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  testID?: string | undefined;
}) {
  const name = formatExerciseName({
    nameEn: item.nameEn,
    namePl: item.namePl,
    displayNameOverride: item.displayNameOverride,
  });
  const imageSource = getExerciseImageSource(item.primaryImage ?? undefined);

  const accessibilityLabel = disabled
    ? t('exerciseLibrary.picker.alreadyInDayAccessibilityLabelTemplate', { name })
    : name;

  return (
    <PressScale
      onPress={disabled ? undefined : onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: selected, disabled }}
      style={{ borderBottomWidth: 1, borderBottomColor: color.border }}
      testID={testID}
    >
      <Row
        gap={3}
        align="center"
        style={{ paddingVertical: space[3], paddingHorizontal: space[4] }}
      >
        <Checkbox
          value={selected}
          onValueChange={disabled ? () => {} : onToggle}
          disabled={disabled}
          accessibilityLabel={accessibilityLabel}
        />
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
            <Ionicons name="barbell-outline" size={18} color={color.textTertiary} />
          )}
        </View>

        <Column gap={1} style={{ flex: 1 }}>
          <Text variant="bodyMedium" color="primary" numberOfLines={1}>
            {name}
          </Text>
          {disabled ? (
            <Text variant="footnote" color="tertiary">
              {t('exerciseLibrary.picker.alreadyInDayLabel')}
            </Text>
          ) : null}
        </Column>
      </Row>
    </PressScale>
  );
}

function ExercisePickerSkeleton() {
  return (
    <Column gap={4} style={{ padding: space[4] }}>
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <Row key={index} gap={3} align="center">
          <Skeleton width={24} height={24} radius="sm" />
          <Skeleton width={40} height={40} radius="md" />
          <Column gap={2} style={{ flex: 1 }}>
            <Skeleton width="70%" height={16} />
          </Column>
        </Row>
      ))}
    </Column>
  );
}
