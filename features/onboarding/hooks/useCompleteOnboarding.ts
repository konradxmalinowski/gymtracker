import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useContainer } from '@/services/container';
import type { CompleteOnboardingInput, Profile } from '@/features/profile';

/**
 * The only place the onboarding screen touches `ProfileService`
 * (ARCHITECTURE.md section 3.1, rule 3 - presentation goes through a hook,
 * never a service call inline in a screen body).
 *
 * On success the `['profile']` query (read by the root splash gate in
 * `app/_layout.tsx` and by `features/profile`'s `useProfile`) is
 * invalidated so both pick up the new row without a manual refetch wire-up.
 */
export function useCompleteOnboarding() {
  const { profileService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation<Profile, Error, CompleteOnboardingInput>({
    mutationFn: (input) => profileService.completeOnboarding(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
