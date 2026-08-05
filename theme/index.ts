/**
 * theme/index.ts - typed barrel for imperative/runtime consumers (Reanimated
 * worklets, Skia paints, future chart components) that cannot resolve
 * NativeWind class names, per the diagram in ARCHITECTURE.md section 11.1:
 *
 *   theme/tokens.ts ──► tailwind.config.js ──► NativeWind class names ──► JSX
 *          │
 *          └────────► theme/index.ts (typed export) ──► Reanimated / Skia /
 *                                                        imperative APIs
 *
 * This is the one place `motion.easing`'s bezier control points become real
 * Reanimated `Easing` curves - `theme/tokens.ts` deliberately stays free of
 * any `react-native-reanimated` import (see that file's header), so
 * `tailwind.config.js` can keep loading it through jiti under plain Node.
 * Everything else is re-exported unchanged.
 */
import { Easing } from 'react-native-reanimated';

import { color, space, radius, elevation, font, hitSlop, motion as rawMotion } from './tokens';

export { color, space, radius, elevation, font, hitSlop };

export const motion = {
  ...rawMotion,
  easing: {
    standard: Easing.bezier(...rawMotion.easing.standard),
    decelerate: Easing.out(Easing.cubic),
    accelerate: Easing.in(Easing.cubic),
  },
} as const;

export const theme = { color, space, radius, elevation, font, motion, hitSlop } as const;

export type Theme = typeof theme;
