import { useQuery } from '@tanstack/react-query';

import { useContainer } from '@/services/container';

/** Query key convention (ARCHITECTURE.md section 12.1): `['profile']`. Shared with the root splash gate in `app/_layout.tsx` - both read the same cache entry, invalidated together by `features/onboarding`'s `useCompleteOnboarding`. */
export function useProfile() {
  const { profileService } = useContainer();

  return useQuery({
    queryKey: ['profile'],
    queryFn: () => profileService.getProfile(),
  });
}
