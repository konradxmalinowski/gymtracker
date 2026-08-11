import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Cross-feature `AppState` reader (CLAUDE.md section 9's `hooks/` folder -
 * this is its first occupant). Returns the current foreground/background
 * status and re-renders on every transition, so a caller can react to
 * "the app just came back to 'active'" (P7's rest timer is the first real
 * consumer: R-04 requires recomputing the countdown from wall clock on every
 * foreground, not trusting whatever a backgrounded JS timer thinks elapsed).
 *
 * Deliberately just a thin `AppState.addEventListener` wrapper with no
 * feature-specific logic - "what changed" is this hook's whole job, "what to
 * do about it" is the caller's.
 */
export function useAppState(): AppStateStatus {
  const [state, setState] = useState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setState);
    return () => subscription.remove();
  }, []);

  return state;
}
