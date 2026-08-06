import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { Screen } from '@/components/layout';
import { EmptyState } from '@/components/feedback';
import { t } from '@/i18n';
import { color } from '@/theme/tokens';

/**
 * Plans tab - genuinely finished "not built yet" state (docs/ROADMAP.md P5),
 * not a stub. Real copy through `t()`, no dead touch target.
 */
export default function PlansScreen() {
  return (
    <Screen testID="plans-screen">
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState
          illustration={<Ionicons name="clipboard-outline" size={48} color={color.textTertiary} />}
          title={t('comingSoon.plansTitle')}
          message={t('comingSoon.plansMessage')}
        />
      </View>
    </Screen>
  );
}
