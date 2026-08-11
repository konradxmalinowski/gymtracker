/**
 * Public barrel for the "rest-timer" feature.
 *
 * This is the ONLY surface other features may import from (ARCHITECTURE.md
 * section 3.1, rule 4 - enforced by the import/no-restricted-paths zones in
 * eslint.config.js). Reaching into "features/rest-timer/<subfolder>/..." from any
 * other feature is a lint error; import from "@/features/rest-timer" instead.
 *
 * P7 pass 1 (`plans/2026-08-08-p7-rest-timer.md`) populates this with the
 * domain/service layer: the rest-duration resolution order, the superset
 * skip rule, and the notification-scheduling wrapper. `features/workout-
 * logging` (pass 2) and this feature's own UI (pass 3) build against exactly
 * this surface - never a subpath. Components/screens/hooks land in pass 3 and
 * are re-exported here when they do.
 */

export { resolveRestSeconds, type RestSecondsResolutionInput } from './domain/resolveRestSeconds';
export {
  shouldStartRestTimer,
  type ShouldStartRestTimerInput,
  type SupersetSessionExercise,
} from './domain/supersetRestRule';
export {
  restTimerNotificationService,
  REST_TIMER_DEEP_LINK,
} from './services/RestTimerNotificationService';

// Pass 3 (`plans/2026-08-08-p7-rest-timer.md`): UI components and the
// ticking hook, as this file's own header predicted they would be.
export { RestTimerBar, type RestTimerBarProps } from './components/RestTimerBar';
export {
  RestTimerSettingsSheet,
  type RestTimerSettingsSheetProps,
} from './components/RestTimerSettingsSheet';
export {
  TimerPresetChips,
  REST_TIMER_PRESET_SECONDS,
  type TimerPresetChipsProps,
} from './components/TimerPresetChips';
export { formatRestSeconds } from './components/formatRestSeconds';
export { useRestTimerTick } from './hooks/useRestTimerTick';
