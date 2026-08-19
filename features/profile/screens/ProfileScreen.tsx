import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';

import { Column, Row, Screen } from '@/components/layout';
import { Avatar, ListRow, Surface, Text } from '@/components/ui';
import { ErrorState, Skeleton } from '@/components/feedback';
import { AVATAR_DIRECTORY } from '@/features/profile';
import { useProfile } from '@/features/profile/hooks/useProfile';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useContainer } from '@/services/container';
import { space } from '@/theme/tokens';

/** `app/(tabs)/profile/index.tsx`'s screen body (CLAUDE.md: "app/ never contains screen bodies"). */
export function ProfileScreen() {
  const { files } = useContainer();
  const { data: profile, isPending, isError, refetch } = useProfile();

  useEffect(() => {
    if (isPending) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    }
  }, [isPending]);

  return (
    <Screen scroll testID="profile-screen">
      <Column gap={8} style={{ paddingVertical: space[6] }}>
        {isPending ? <ProfileHeaderSkeleton /> : null}

        {isError ? (
          <Surface level={1} radius="lg">
            <ErrorState error={t('profile.loadErrorMessage')} onRetry={() => refetch()} />
          </Surface>
        ) : null}

        {!isPending && !isError && profile ? (
          <Row gap={4} align="center">
            <Avatar
              uri={
                profile.avatarFileName
                  ? files.getUri(`${AVATAR_DIRECTORY}/${profile.avatarFileName}`)
                  : undefined
              }
              name={profile.nickname}
              size="lg"
            />
            <Text variant="title2" color="primary">
              {profile.nickname}
            </Text>
          </Row>
        ) : null}

        <Surface level={1} radius="lg">
          <ListRow
            title={t('records.list.title')}
            onPress={() => router.push(routes.profile.records())}
            showChevron
            testID="profile-records-row"
          />
          <ListRow
            title={t('workoutLogging.history.rowTitle')}
            onPress={() => router.push(routes.profile.history())}
            showChevron
            testID="profile-history-row"
          />
          <ListRow
            title={t('calendar.profileRowTitle')}
            onPress={() => router.push(routes.profile.calendar())}
            showChevron
            testID="profile-calendar-row"
          />
          <ListRow
            title={t('profile.settingsRowTitle')}
            subtitle={t('profile.settingsRowSubtitle')}
            onPress={() => router.push(routes.profileSettings.index())}
            showChevron
            testID="profile-settings-row"
          />
        </Surface>
      </Column>
    </Screen>
  );
}

function ProfileHeaderSkeleton() {
  return (
    <Row gap={4} align="center">
      <Skeleton width={72} height={72} radius="full" />
      <Skeleton width={160} height={24} />
    </Row>
  );
}
