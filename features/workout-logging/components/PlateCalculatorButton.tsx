import Ionicons from '@expo/vector-icons/Ionicons';

import { Button } from '@/components/ui';
import { t } from '@/i18n';
import { color } from '@/theme/tokens';

export interface PlateCalculatorButtonProps {
  onPress: () => void;
  testID?: string | undefined;
}

/**
 * Gravitus-inspired refresh's compact per-exercise toolbar entry point into
 * `PlateCalculatorSheetContent`. Deliberately the only toolbar entry this
 * pass adds - the reference app's fuller "LOG | MAX | PLATES | STRAIN |
 * TREND | NOTES" row was explicitly scoped down to just this one action.
 * Mirrors `AddSetButton`'s exact shape (a `ghost`/`sm` `Button` with a
 * leading icon).
 */
export function PlateCalculatorButton({ onPress, testID }: PlateCalculatorButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      icon={<Ionicons name="barbell-outline" size={16} color={color.accentText} />}
      label={t('workoutLogging.plateCalculator.buttonLabel')}
      onPress={onPress}
      testID={testID}
    />
  );
}
