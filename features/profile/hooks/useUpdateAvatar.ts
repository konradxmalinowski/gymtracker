import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useContainer } from '@/services/container';
import type { Profile } from '@/features/profile';

/**
 * The only place `ProfileScreen` touches `ProfileService.updateAvatar`
 * (ARCHITECTURE.md section 3.1, rule 3 - presentation goes through a hook,
 * never a service call inline in a screen body).
 *
 * Same `['profile']` invalidation convention `features/onboarding`'s
 * `useCompleteOnboarding` uses for the same query key - shared by the root
 * splash gate in `app/_layout.tsx` and this feature's own `useProfile`, so
 * both pick up the new avatar without a manual refetch wire-up.
 *
 * Unlike onboarding's best-effort avatar write, `ProfileService.updateAvatar`
 * throws on failure (it's an explicit "change my avatar" action on an
 * existing profile, not a step inside a larger flow) - this mutation's
 * `isError` is the caller's signal to show that failure, not something this
 * hook swallows.
 */
export function useUpdateAvatar() {
  const { profileService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation<Profile, Error, string>({
    mutationFn: (avatarUri) => profileService.updateAvatar(avatarUri),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
