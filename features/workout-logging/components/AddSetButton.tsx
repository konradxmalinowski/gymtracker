import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui';
import { t } from '@/i18n';
import { color } from '@/theme/tokens';

export interface AddSetButtonProps {
  onPress: () => void;
  loading?: boolean | undefined;
  testID?: string | undefined;
}

/** Calls `appendSet(sessionExerciseId)` with no seed - the repository's own pre-fill chain (FR-11) does the rest; this component has no prefill logic of its own. */
export function AddSetButton({ onPress, loading = false, testID }: AddSetButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      icon={<Ionicons name="add" size={16} color={color.accentText} />}
      label={t('workoutLogging.active.addSetButtonLabel')}
      onPress={onPress}
      loading={loading}
      testID={testID}
    />
  );
}
