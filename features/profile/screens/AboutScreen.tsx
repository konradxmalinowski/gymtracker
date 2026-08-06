import Constants from 'expo-constants';

import { Column, Screen } from '@/components/layout';
import { Surface, Text } from '@/components/ui';
import { t } from '@/i18n';
import { space } from '@/theme/tokens';

/** `app/profile/settings/about.tsx`'s screen body. */
export function AboutScreen() {
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen scroll edges={['bottom']} testID="about-screen">
      <Column gap={8} style={{ paddingVertical: space[6] }}>
        <Surface level={1} radius="lg" padding={4}>
          <Column gap={1}>
            <Text variant="label" color="secondary">
              {t('about.versionLabel')}
            </Text>
            <Text variant="body" color="primary" testID="about-version-value">
              {version}
            </Text>
          </Column>
        </Surface>

        <Column gap={2}>
          <Text variant="label" color="secondary">
            {t('about.licenseSectionTitle')}
          </Text>
          <Text variant="body" color="secondary">
            {t('about.licenseMessage')}
          </Text>
        </Column>
      </Column>
    </Screen>
  );
}
