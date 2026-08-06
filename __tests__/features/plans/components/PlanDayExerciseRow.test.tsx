import { act, render } from '@testing-library/react-native';

import { DraggableList } from '@/components/gestures/DraggableList';
import type { ExerciseListItem } from '@/features/exercise-library';
import { PlanDayExerciseRow } from '@/features/plans/components/PlanDayExerciseRow';
import { SupersetGroupEditor } from '@/features/plans/components/SupersetGroupEditor';
import type { PlanDayExercise } from '@/features/plans';

// See `__tests__/__mocks__/vectorIconsMock.tsx` for why this is a separate module.
jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

function exerciseListItem(overrides: Partial<ExerciseListItem> = {}): ExerciseListItem {
  return {
    id: 'exercise-1',
    source: 'custom',
    catalogSlug: null,
    nameEn: 'Bench Press',
    namePl: null,
    displayNameOverride: null,
    level: null,
    equipmentSlug: 'barbell',
    bodyPart: null,
    trackingType: 'weight_reps',
    primaryImage: null,
    isFavorite: false,
    ...overrides,
  };
}

function dayExercise(overrides: Partial<PlanDayExercise> = {}): PlanDayExercise {
  return {
    id: 'day-exercise-1',
    planDayId: 'day-1',
    exerciseId: 'exercise-1',
    sortOrder: 0,
    targetSets: null,
    targetRepMin: null,
    targetRepMax: null,
    targetRpe: null,
    restSeconds: null,
    supersetGroup: null,
    note: null,
    createdAt: 0,
    updatedAt: 0,
    exercise: exerciseListItem(),
    ...overrides,
  };
}

function noop() {}

interface JsonNode {
  type?: string;
  props?: Record<string, unknown>;
  children?: (JsonNode | string)[] | null;
}

/** Same helper `DraggableList.test.tsx`/`PlanCard.test.tsx`/`SwipeableRow.test.tsx` use. */
function findAllByProp(node: JsonNode | string | null, propName: string): JsonNode[] {
  if (node == null || typeof node === 'string') {
    return [];
  }
  const self = node.props && propName in node.props ? [node] : [];
  const fromChildren = (node.children ?? []).flatMap((child) => findAllByProp(child, propName));
  return [...self, ...fromChildren];
}

describe('PlanDayExerciseRow composed with DraggableList and SupersetGroupEditor (integration)', () => {
  const items = [
    dayExercise({ id: 'day-exercise-1', supersetGroup: 1 }),
    dayExercise({ id: 'day-exercise-2', supersetGroup: 1, exercise: exerciseListItem({ id: 'exercise-2', nameEn: 'Overhead Press' }) }),
  ];

  it('reaches a native node in dragHandle="row" mode even when wrapped in SupersetGroupEditor - the third drop point an accessibility review found', async () => {
    let toJSON: () => unknown = () => null;
    await act(async () => {
      const result = await render(
        <DraggableList
          data={items}
          keyExtractor={(item) => item.id}
          rowHeight={76}
          dragHandle="row"
          onReorder={() => {}}
          renderItem={(item) => (
            <SupersetGroupEditor group={item.supersetGroup ?? 1}>
              <PlanDayExerciseRow
                dayExercise={item}
                selectMode={false}
                selected={false}
                onToggleSelected={noop}
                onPress={noop}
                onRemove={noop}
              />
            </SupersetGroupEditor>
          )}
        />,
      );
      toJSON = result.toJSON;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const nodesWithActions = findAllByProp(toJSON() as JsonNode, 'accessibilityActions');
    expect(nodesWithActions.length).toBeGreaterThan(0);

    const actionNames = (nodesWithActions[0]!.props?.accessibilityActions as { name: string }[]).map(
      (action) => action.name,
    );
    expect(actionNames).toEqual(expect.arrayContaining(['moveDown']));
  });

  it('reaches a native node (the drag handle) in dragHandle="handle" mode, matching PlanDayEditorScreen\'s actual wiring', async () => {
    let toJSON: () => unknown = () => null;
    await act(async () => {
      const result = await render(
        <DraggableList
          data={items}
          keyExtractor={(item) => item.id}
          rowHeight={76}
          dragHandle="handle"
          onReorder={() => {}}
          renderItem={(item, _index, dragHandle) => {
            const row = (
              <PlanDayExerciseRow
                dayExercise={item}
                selectMode={false}
                selected={false}
                onToggleSelected={noop}
                onPress={noop}
                onRemove={noop}
                dragHandle={dragHandle}
              />
            );
            return item.supersetGroup !== null ? (
              <SupersetGroupEditor group={item.supersetGroup}>{row}</SupersetGroupEditor>
            ) : (
              row
            );
          }}
        />,
      );
      toJSON = result.toJSON;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const nodesWithActions = findAllByProp(toJSON() as JsonNode, 'accessibilityActions');
    expect(nodesWithActions.length).toBeGreaterThan(0);
  });
});
