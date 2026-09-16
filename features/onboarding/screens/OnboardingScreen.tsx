import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as ImagePicker from 'expo-image-picker';
import { z } from 'zod';

import { Column, Screen } from '@/components/layout';
import { Avatar, Button, Text, TextField } from '@/components/ui';
import { NICKNAME_MAX_LENGTH } from '@/features/profile';
import { useCompleteOnboarding } from '@/features/onboarding/hooks/useCompleteOnboarding';
import { t } from '@/i18n';
import { space } from '@/theme/tokens';

const onboardingSchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(1, t('onboarding.nicknameRequiredError'))
    .max(NICKNAME_MAX_LENGTH, t('onboarding.nicknameTooLongError', { max: NICKNAME_MAX_LENGTH })),
});

type OnboardingFormValues = z.infer<typeof onboardingSchema>;

/**
 * First-launch onboarding (docs/ROADMAP.md P3). A nickname is required; an
 * avatar is optional and fully skippable - denying photo-library permission
 * or tapping "Skip" both leave onboarding completable, never blocked.
 *
 * No partial profile row is ever written: `ProfileService.completeOnboarding`
 * only inserts once, with the nickname and (if present) the avatar together,
 * so killing the app mid-flow naturally resumes here on next launch - there
 * is nothing to reconcile.
 */
export function OnboardingScreen() {
  const [avatarUri, setAvatarUri] = useState<string | undefined>(undefined);
  const [avatarPermissionDenied, setAvatarPermissionDenied] = useState(false);
  const [avatarPickFailed, setAvatarPickFailed] = useState(false);
  const completeOnboarding = useCompleteOnboarding();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { nickname: '' },
    mode: 'onBlur',
  });

  // `accessibilityLiveRegion` alone has no effect on iOS - paired with an
  // explicit announcement the same way TextField.tsx and ErrorState.tsx
  // already do (accessibility audit A11Y-002), since a VoiceOver user on
  // this screen has no way to skip past either error otherwise.
  useEffect(() => {
    if (avatarPermissionDenied) {
      AccessibilityInfo.announceForAccessibility(t('onboarding.avatarPermissionDeniedMessage'));
    }
  }, [avatarPermissionDenied]);

  useEffect(() => {
    if (avatarPickFailed) {
      AccessibilityInfo.announceForAccessibility(t('onboarding.avatarPickFailedMessage'));
    }
  }, [avatarPickFailed]);

  useEffect(() => {
    if (completeOnboarding.isError) {
      AccessibilityInfo.announceForAccessibility(t('onboarding.genericErrorMessage'));
    }
  }, [completeOnboarding.isError]);

  const handlePickAvatar = useCallback(async () => {
    setAvatarPermissionDenied(false);
    setAvatarPickFailed(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setAvatarPermissionDenied(true);
      return;
    }

    try {
      // No `allowsEditing`/`aspect` here on purpose (root cause of a
      // confirmed Android bug: the photo picker and its native crop step
      // both opened fine, but tapping the crop step's own confirm button
      // could resolve `launchImageLibraryAsync` as a plain
      // `{ canceled: true }` - indistinguishable from the user backing out
      // - silently dropping the picked photo with no error shown. This
      // avoids that separate native crop activity
      // (`ExpoCropImageActivity`/`com.canhub.cropper`) entirely, matching
      // the pattern `body-metrics`' `PhotoSourceSheetContent` already uses
      // for every picked photo. `Avatar`'s circular frame plus `Image`'s
      // default `cover` resizeMode already center-crops whatever aspect
      // ratio comes back, so no client-side crop step is needed here.
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

      setAvatarUri(asset.uri);
    } catch {
      setAvatarPickFailed(true);
    }
  }, []);

  // No manual `router.replace()` on success here on purpose (root cause of a
  // confirmed bug: this used to race the `['profile']` query invalidation
  // `useCompleteOnboarding`'s own `onSuccess` triggers, which is async and
  // often lost the race, bouncing the user straight back to `/onboarding`
  // via `RootNavigationGate`'s stale-profile guard with no forward redirect
  // to recover - see that file's `RootNavigationGate` comment). Once the
  // mutation succeeds, the invalidated query resolving is the single signal
  // `RootNavigationGate` needs to leave onboarding; navigating here too just
  // reintroduces the race.
  const onSubmit = handleSubmit((values) => {
    completeOnboarding.mutate(
      avatarUri ? { nickname: values.nickname, avatarUri } : { nickname: values.nickname },
    );
  });

  return (
    <Screen scroll testID="onboarding-screen">
      <Column gap={8} style={{ paddingVertical: space[8] }}>
        <Column gap={2}>
          <Text variant="display" color="primary">
            {t('onboarding.title')}
          </Text>
          <Text variant="body" color="secondary">
            {t('onboarding.subtitle')}
          </Text>
        </Column>

        <Column gap={3}>
          <Text variant="label" color="secondary">
            {t('onboarding.avatarSectionTitle')}
          </Text>
          <Column gap={3} align="center">
            <Avatar
              uri={avatarUri}
              name={t('onboarding.title')}
              size="lg"
              editable
              onPress={handlePickAvatar}
              testID="onboarding-avatar"
            />
            <Button
              variant="secondary"
              size="sm"
              label={
                avatarUri ? t('onboarding.changePhotoLabel') : t('onboarding.choosePhotoLabel')
              }
              onPress={handlePickAvatar}
              testID="onboarding-pick-avatar-button"
            />
            {avatarPermissionDenied ? (
              <Text
                variant="caption"
                color="secondary"
                align="center"
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
              >
                {t('onboarding.avatarPermissionDeniedMessage')}
              </Text>
            ) : null}
            {avatarPickFailed ? (
              <Text
                variant="caption"
                color="secondary"
                align="center"
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
              >
                {t('onboarding.avatarPickFailedMessage')}
              </Text>
            ) : null}
          </Column>
        </Column>

        <Controller
          control={control}
          name="nickname"
          render={({ field: { value, onChange, onBlur } }) => (
            <TextField
              label={t('onboarding.nicknameLabel')}
              placeholder={t('onboarding.nicknamePlaceholder')}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.nickname?.message}
              maxLength={NICKNAME_MAX_LENGTH}
              testID="onboarding-nickname-field"
            />
          )}
        />

        {completeOnboarding.isError ? (
          <Text
            variant="caption"
            color="danger"
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {t('onboarding.genericErrorMessage')}
          </Text>
        ) : null}

        <Column gap={2}>
          <Button
            label={t('onboarding.continueLabel')}
            onPress={onSubmit}
            loading={completeOnboarding.isPending}
            fullWidth
            testID="onboarding-continue-button"
          />
        </Column>
      </Column>
    </Screen>
  );
}
