import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { PressScale } from '@/components/gestures/PressScale';
import { Text } from '@/components/ui';
import { Weight } from '@/domain/Weight';
import { t } from '@/i18n';
import { color, space } from '@/theme/tokens';

import type { ProgressionSuggestion } from '../domain/ProgressionAdvisor';

export interface ProgressionHintProps {
  /** `null` when there is nothing to show yet (e.g. the caller's data is still loading) - renders nothing, the same "clean absence" `PRBadge` uses. */
  suggestion: ProgressionSuggestion | null;
  /**
   * Applies the suggestion to whatever the caller decides is "the next set" -
   * this component only renders the affordance and calls back, per this
   * phase's brief. Omit (or pass `undefined`) when there is no natural next
   * set to apply to (e.g. every set is already completed) - the apply
   * affordance is hidden rather than rendered inert, so a tap never silently
   * does nothing.
   */
  onApply?: (() => void) | undefined;
  testID?: string | undefined;
}

function formatWeight(weightKg: number): string {
  return Weight.fromKilograms(weightKg).toDisplayString('kg');
}

/**
 * ADR-0015 Decision 2's double-progression suggestion, rendered as a pre-fill
 * affordance the user can apply in one tap - never auto-applied, always
 * labeled as a suggestion (the ADR's own framing: "the app does not know
 * whether the user slept, ate or is deloading").
 */
export function ProgressionHint({ suggestion, onApply, testID }: ProgressionHintProps) {
  if (suggestion === null) {
    return null;
  }

  if (suggestion.kind === 'first_time') {
    return (
      <View style={{ paddingVertical: space['0.5'] }} testID={testID}>
        <Text variant="footnote" color="tertiary">
          {t('records.progressionHint.firstTimeMessage')}
        </Text>
      </View>
    );
  }

  const weightLabel = formatWeight(suggestion.weightKg);
  const label = t('records.progressionHint.suggestionTemplate', {
    weight: weightLabel,
    reps: suggestion.reps,
  });

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        paddingVertical: space['0.5'],
      }}
    >
      <Ionicons name="trending-up-outline" size={16} color={color.accentText} />
      <Text variant="footnote" color="accent">
        {label}
      </Text>
    </View>
  );

  if (!onApply) {
    return <View testID={testID}>{content}</View>;
  }

  return (
    <PressScale
      onPress={onApply}
      accessibilityRole="button"
      accessibilityLabel={t('records.progressionHint.applyAccessibilityLabelTemplate', {
        weight: weightLabel,
        reps: suggestion.reps,
      })}
      testID={testID}
    >
      {content}
    </PressScale>
  );
}
