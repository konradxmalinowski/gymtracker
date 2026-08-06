import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { Screen } from '@/components/layout';
import { EmptyState } from '@/components/feedback';
import { t } from '@/i18n';
import { color } from '@/theme/tokens';

/**
 * Stats tab - genuinely finished "not built yet" state (docs/ROADMAP.md
 * P11), not a stub. Real copy through `t()`, no dead touch target.
 */
export default function StatsScreen() {
  return (
    <Screen testID="stats-screen">
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState
          illustration={
            <Ionicons name="stats-chart-outline" size={48} color={color.textTertiary} />
          }
          title={t('comingSoon.statsTitle')}
          message={t('comingSoon.statsMessage')}
        />
      </View>
    </Screen>
  );
}
