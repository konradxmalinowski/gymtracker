import { Ionicons } from '@expo/vector-icons';

import { Card, StatTile } from '@/components/ui';
import { t } from '@/i18n';
import { color } from '@/theme/tokens';

export interface StreakCardProps {
  streak: number;
  testID?: string | undefined;
}

/**
 * Home's streak card. `streak` is `calculateStreak`'s own output (P10
 * decision, `features/home/domain/StreakCalculator.ts`) - `0` is a real,
 * valid value ("no streak yet"), not an empty/error state, so this always
 * renders the same `StatTile` shape and only varies its caption copy.
 */
export function StreakCard({ streak, testID }: StreakCardProps) {
  return (
    <Card variant="elevated" testID={testID}>
      <StatTile
        label={t('home.streak.title')}
        value={streak}
        unit={t('home.streak.unitLabel', { count: streak })}
        delta={streak === 0 ? t('home.streak.zeroMessage') : t('home.streak.activeMessage')}
        icon={<Ionicons name="flame" size={18} color={color.accentText} />}
        testID={testID ? `${testID}-stat-tile` : undefined}
      />
    </Card>
  );
}
