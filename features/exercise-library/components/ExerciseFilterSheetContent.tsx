import { ScrollView, View } from 'react-native';

import { Column, Row } from '@/components/layout';
import { Button, Chip, SegmentedControl, Switch, Text } from '@/components/ui';
import type { ExerciseContext, ExerciseLevel } from '@/features/exercise-library';
import { t } from '@/i18n';
import { useSheetStore } from '@/stores/sheetStore';
import { space } from '@/theme/tokens';

import { countActiveFilterCategories, useExerciseFilterStore } from '../hooks/exerciseFilterStore';
import { EQUIPMENT_LABELS, MUSCLE_LABELS, BODY_PART_LABELS } from '../types/labels';

const MUSCLE_OPTIONS = Object.entries(MUSCLE_LABELS).map(([slug, label]) => ({ slug, label }));
const EQUIPMENT_OPTIONS = Object.entries(EQUIPMENT_LABELS).map(([slug, label]) => ({
  slug,
  label,
}));
const BODY_PART_OPTIONS = Object.entries(BODY_PART_LABELS).map(([slug, label]) => ({
  slug,
  label,
}));

const LEVEL_OPTIONS: readonly { value: 'any' | ExerciseLevel; label: string }[] = [
  { value: 'any', label: t('exerciseLibrary.filters.anyLevel') },
  { value: 'beginner', label: t('exerciseLibrary.filters.levelBeginner') },
  { value: 'intermediate', label: t('exerciseLibrary.filters.levelIntermediate') },
  { value: 'expert', label: t('exerciseLibrary.filters.levelExpert') },
];

const CONTEXT_OPTIONS: readonly { value: 'any' | ExerciseContext; label: string }[] = [
  { value: 'any', label: t('exerciseLibrary.filters.anyContext') },
  { value: 'gym', label: t('exerciseLibrary.filters.contextGym') },
  { value: 'home', label: t('exerciseLibrary.filters.contextHome') },
];

function ChipMultiSelectGroup({
  title,
  options,
  selected,
  onToggle,
  testID,
}: {
  title: string;
  options: readonly { slug: string; label: string }[];
  selected: readonly string[];
  onToggle: (slug: string) => void;
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
    </Column>
  );
}

/**
 * Rendered inside the app-root `SheetHost`/`BottomSheet` (`present()`d from
 * `ExerciseLibraryScreen`). Takes no props and reads/writes
 * `useExerciseFilterStore` directly - see that store's file header for why a prop
 * closure captured at `present()` time would not stay reactive to further chip
 * taps once the sheet is open.
 *
 * `level`/`context`/`favoritesOnly` render as single-select/toggle controls, not
 * chip multi-select groups, because `ExerciseQuery` (ARCHITECTURE.md section 8.3)
 * defines them as scalar fields (`level?: ExerciseLevel`, `context?: 'gym'|'home'`,
 * `favoritesOnly?: boolean`) - only `muscleSlugs`/`equipmentSlugs`/`bodyParts` are
 * arrays the repository actually composes with OR-within-category semantics.
 */
export function ExerciseFilterSheetContent() {
  const filters = useExerciseFilterStore((state) => state.filters);
  const toggleMuscle = useExerciseFilterStore((state) => state.toggleMuscle);
  const toggleEquipment = useExerciseFilterStore((state) => state.toggleEquipment);
  const toggleBodyPart = useExerciseFilterStore((state) => state.toggleBodyPart);
  const setLevel = useExerciseFilterStore((state) => state.setLevel);
  const setContext = useExerciseFilterStore((state) => state.setContext);
  const setFavoritesOnly = useExerciseFilterStore((state) => state.setFavoritesOnly);
  const clear = useExerciseFilterStore((state) => state.clear);
  const dismiss = useSheetStore((state) => state.dismissCurrent);

  const activeCount = countActiveFilterCategories(filters);

  return (
    <Column gap={4} style={{ flex: 1 }}>
      <Row justify="space-between" align="center">
        <Text variant="title3" color="primary" accessibilityRole="header">
          {t('exerciseLibrary.filters.title')}
        </Text>
        <Text
          variant="footnote"
          color="secondary"
          accessibilityLiveRegion="polite"
          testID="exercise-filters-active-count"
        >
          {activeCount > 0
            ? t('exerciseLibrary.filters.activeCount', { count: activeCount })
            : t('exerciseLibrary.filters.noneActive')}
        </Text>
      </Row>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <Column gap={5} style={{ paddingBottom: space[4] }}>
          <Column gap={2}>
            <Text variant="label" color="secondary">
              {t('exerciseLibrary.filters.levelSectionTitle')}
            </Text>
            <SegmentedControl
              options={LEVEL_OPTIONS}
              value={filters.level ?? 'any'}
              onChange={(value) => setLevel(value === 'any' ? null : value)}
              testID="exercise-filter-level"
            />
          </Column>

          <Column gap={2}>
            <Text variant="label" color="secondary">
              {t('exerciseLibrary.filters.contextSectionTitle')}
            </Text>
            <SegmentedControl
              options={CONTEXT_OPTIONS}
              value={filters.context ?? 'any'}
              onChange={(value) => setContext(value === 'any' ? null : value)}
              testID="exercise-filter-context"
            />
          </Column>

          <Row justify="space-between" align="center">
            <Text variant="body" color="primary">
              {t('exerciseLibrary.filters.favoritesOnlyLabel')}
            </Text>
            <Switch
              value={filters.favoritesOnly}
              onValueChange={setFavoritesOnly}
              accessibilityLabel={t('exerciseLibrary.filters.favoritesOnlyLabel')}
              testID="exercise-filter-favorites-only"
            />
          </Row>

          <ChipMultiSelectGroup
            title={t('exerciseLibrary.filters.muscleSectionTitle')}
            options={MUSCLE_OPTIONS}
            selected={filters.muscleSlugs}
            onToggle={toggleMuscle}
            testID="exercise-filter-muscle"
          />

          <ChipMultiSelectGroup
            title={t('exerciseLibrary.filters.equipmentSectionTitle')}
            options={EQUIPMENT_OPTIONS}
            selected={filters.equipmentSlugs}
            onToggle={toggleEquipment}
            testID="exercise-filter-equipment"
          />

          <ChipMultiSelectGroup
            title={t('exerciseLibrary.filters.bodyPartSectionTitle')}
            options={BODY_PART_OPTIONS}
            selected={filters.bodyParts}
            onToggle={toggleBodyPart}
            testID="exercise-filter-body-part"
          />
        </Column>
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <Button
          variant="ghost"
          label={t('exerciseLibrary.filters.clearAllLabel')}
          onPress={clear}
          testID="exercise-filters-clear"
        />
        <View style={{ flex: 1 }}>
          <Button
            variant="primary"
            label={t('exerciseLibrary.filters.doneLabel')}
            onPress={dismiss}
            fullWidth
            testID="exercise-filters-done"
          />
        </View>
      </View>
    </Column>
  );
}
