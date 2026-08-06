import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { Screen } from '@/components/layout';
import { EmptyState } from '@/components/feedback';
import { t } from '@/i18n';
import { color } from '@/theme/tokens';

/**
 * Exercises tab - genuinely finished "not built yet" state (docs/ROADMAP.md
 * P4), not a stub. Real copy through `t()`, no dead touch target.
 */
export default function ExercisesScreen() {
  return (
    <Screen testID="exercises-screen">
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState
          illustration={<Ionicons name="barbell-outline" size={48} color={color.textTertiary} />}
          title={t('comingSoon.exercisesTitle')}
          message={t('comingSoon.exercisesMessage')}
        />
      </View>
    </Screen>
  );
}
