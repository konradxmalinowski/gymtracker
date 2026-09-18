import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { Column, Row, Screen } from '@/components/layout';
import { Avatar, ListRow, Surface, Text } from '@/components/ui';
import { ErrorState, Skeleton } from '@/components/feedback';
import { AVATAR_DIRECTORY } from '@/features/profile';
import { useProfile } from '@/features/profile/hooks/useProfile';
import { useUpdateAvatar } from '@/features/profile/hooks/useUpdateAvatar';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useContainer } from '@/services/container';
import { space } from '@/theme/tokens';

/** `app/(tabs)/profile/index.tsx`'s screen body (CLAUDE.md: "app/ never contains screen bodies"). */
export function ProfileScreen() {
  const { files } = useContainer();
  const { data: profile, isPending, isError, refetch } = useProfile();
  const updateAvatar = useUpdateAvatar();
  const [avatarPermissionDenied, setAvatarPermissionDenied] = useState(false);
  const [avatarPickFailed, setAvatarPickFailed] = useState(false);

  useEffect(() => {
    if (isPending) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    }
  }, [isPending]);

  useEffect(() => {
    if (avatarPermissionDenied) {
      AccessibilityInfo.announceForAccessibility(t('profile.avatarPermissionDeniedMessage'));
    }
  }, [avatarPermissionDenied]);

  useEffect(() => {
    if (avatarPickFailed) {
      AccessibilityInfo.announceForAccessibility(t('profile.avatarPickFailedMessage'));
    }
  }, [avatarPickFailed]);

  useEffect(() => {
    if (updateAvatar.isError) {
      AccessibilityInfo.announceForAccessibility(t('profile.avatarUpdateFailedMessage'));
    }
  }, [updateAvatar.isError]);

  // Exact same crop-free picker pattern as `OnboardingScreen`'s
  // `handlePickAvatar` (no `allowsEditing`/`aspect` - that combination is the
  // confirmed, already-fixed cause of a native crop step silently dropping
  // the picked photo on Android). Permission denial and a picker
  // reject/throw both surface a message rather than blocking or crashing;
  // a user cancel is a silent no-op.
  const handlePickAvatar = useCallback(async () => {
    setAvatarPermissionDenied(false);
    setAvatarPickFailed(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setAvatarPermissionDenied(true);
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });

      if (result.canceled) {
        return;
      }
      const asset = result.assets[0];
      if (!asset) {
        return;
      }

      updateAvatar.mutate(asset.uri);
    } catch {
      setAvatarPickFailed(true);
    }
  }, [updateAvatar]);

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
          <Column gap={2}>
            <Row gap={4} align="center">
              <Avatar
                uri={
                  profile.avatarFileName
                    ? files.getUri(`${AVATAR_DIRECTORY}/${profile.avatarFileName}`)
                    : undefined
                }
                name={profile.nickname}
                size="lg"
                editable
                onPress={handlePickAvatar}
                testID="profile-avatar"
              />
              <Text variant="title2" color="primary">
                {profile.nickname}
              </Text>
            </Row>
            {avatarPermissionDenied ? (
              <Text
                variant="caption"
                color="secondary"
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
              >
                {t('profile.avatarPermissionDeniedMessage')}
              </Text>
            ) : null}
            {avatarPickFailed ? (
              <Text
                variant="caption"
                color="secondary"
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
              >
                {t('profile.avatarPickFailedMessage')}
              </Text>
            ) : null}
            {updateAvatar.isError ? (
              <Text
                variant="caption"
                color="secondary"
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
              >
                {t('profile.avatarUpdateFailedMessage')}
              </Text>
            ) : null}
          </Column>
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
            title={t('bodyMetrics.profileRowTitle')}
            onPress={() => router.push(routes.bodyMetrics.list())}
            showChevron
            testID="profile-body-metrics-row"
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
