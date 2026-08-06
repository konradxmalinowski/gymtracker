import type { PropsWithChildren, ReactElement, ReactNode } from 'react';
import { Children, cloneElement, Fragment, isValidElement } from 'react';
import {
  View,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
} from 'react-native';

import { Badge } from '@/components/ui';
import { t } from '@/i18n';
import { color, space } from '@/theme/tokens';

export interface SupersetGroupEditorProps extends PropsWithChildren {
  group: number;
  /**
   * Forwarded onto `children` (the wrapped `PlanDayExerciseRow`), not onto
   * this component's own outer `View` - the same reasoning as
   * `SwipeableRow.tsx`'s `attachAccessibilityActions`/`DraggableList.tsx`'s
   * `attachMoveActions`: marking an ancestor `View` `accessible` collapses
   * everything below it into one opaque node, which would make the row's
   * own interactive children unreachable. This is the third of three real
   * drop points an accessibility review found for `DraggableList`'s move-up/
   * move-down actions (`PressScale` and the row components being the other
   * two) - without this, a grouped row's accessibility actions would vanish
   * the moment it got wrapped for its superset bracket, even after the other
   * two fixes.
   */
  accessible?: boolean | undefined;
  accessibilityActions?: readonly AccessibilityActionInfo[] | undefined;
  onAccessibilityAction?: ((event: AccessibilityActionEvent) => void) | undefined;
  testID?: string | undefined;
}

interface ChildAccessibilityProps {
  accessible?: boolean | undefined;
  accessibilityActions?: readonly AccessibilityActionInfo[] | undefined;
  onAccessibilityAction?: ((event: AccessibilityActionEvent) => void) | undefined;
}

/** Merges the incoming accessibility props onto `children` when it's a single attachable element (always true for this component's real usage - one `PlanDayExerciseRow` per group member); falls back to the outer `View` only for a shape this component doesn't actually receive today. */
function attachToChild(
  children: ReactNode,
  accessible: boolean | undefined,
  accessibilityActions: readonly AccessibilityActionInfo[] | undefined,
  onAccessibilityAction: ((event: AccessibilityActionEvent) => void) | undefined,
): { content: ReactNode; outerProps: ChildAccessibilityProps } {
  if (accessible === undefined && accessibilityActions === undefined && !onAccessibilityAction) {
    return { content: children, outerProps: {} };
  }

  const canAttachToChild =
    isValidElement(children) &&
    Children.count(children) === 1 &&
    (children as ReactElement).type !== Fragment;

  if (canAttachToChild) {
    const child = children as ReactElement<ChildAccessibilityProps>;
    const childProps = child.props;
    return {
      content: cloneElement(child, {
        accessible: accessible ?? childProps.accessible,
        accessibilityActions: [
          ...(childProps.accessibilityActions ?? []),
          ...(accessibilityActions ?? []),
        ],
        onAccessibilityAction: (event: AccessibilityActionEvent) => {
          onAccessibilityAction?.(event);
          childProps.onAccessibilityAction?.(event);
        },
      } satisfies Partial<ChildAccessibilityProps>),
      outerProps: {},
    };
  }

  return {
    content: children,
    outerProps: { accessible, accessibilityActions, onAccessibilityAction },
  };
}

/**
 * Visual bracket/grouping indicator for a run of grouped `PlanDayExerciseRow`s
 * (ARCHITECTURE.md's `plans` component table). Deliberately simple - a left
 * accent-colored bar plus a small group-number badge - per this phase's own
 * task brief ("keep this simple, it doesn't need to be identical to the
 * future workout-logging `SupersetBracket`"). Per-exercise ungroup is each
 * row's own action (`PlanDayExerciseRow`'s `onUngroup`); this component only
 * renders the grouping itself, it doesn't own any mutation.
 */
export function SupersetGroupEditor({
  group,
  children,
  accessible,
  accessibilityActions,
  onAccessibilityAction,
  testID,
}: SupersetGroupEditorProps) {
  const { content, outerProps } = attachToChild(
    children,
    accessible,
    accessibilityActions,
    onAccessibilityAction,
  );

  return (
    <View
      style={{ borderLeftWidth: 3, borderLeftColor: color.accent, marginLeft: space[2] }}
      testID={testID}
      {...outerProps}
    >
      <View style={{ paddingLeft: space[3], paddingTop: space[2], paddingBottom: space[1] }}>
        <Badge label={t('plans.day.supersetLabelTemplate', { group })} tone="accent" size="sm" />
      </View>
      {content}
    </View>
  );
}
