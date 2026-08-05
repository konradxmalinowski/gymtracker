/**
 * theme/tokens.ts - the single source of truth for design tokens
 * (ARCHITECTURE.md section 11.1).
 *
 * Two runtimes read this file: `tailwind.config.js` (via jiti, so NativeWind
 * class names resolve to these values) and any imperative code that cannot
 * resolve Tailwind classes (Reanimated worklets, Skia paints, chart
 * components) via a direct `import { color } from '@/theme/tokens'` or the
 * typed `@/theme` barrel. Duplicating a value in either consumer instead of
 * reading it from here is the mistake this file exists to prevent.
 *
 * This file must stay importable from plain Node (jiti evaluates it outside
 * the React Native runtime to build `tailwind.config.js`), so it never
 * imports `react-native`, `react-native-reanimated`, or any other RN-only
 * package - `react-native-reanimated`'s entry point transitively pulls in
 * `react-native/index.js`, which is Flow-typed and fails to parse under
 * plain Node. The motion tokens below therefore store plain, serializable
 * data (bezier control points, spring configs); `theme/index.ts` is where
 * that data becomes real Reanimated `Easing` curves for RN consumers.
 *
 * The app is dark-only (product brief), so tokens are flat - no light/dark
 * map. Semantic names (`surface`, `textSecondary`) exist rather than raw
 * scales, so adding a light theme later is a matter of introducing a map
 * behind the same names rather than editing every component.
 *
 * Accent discipline (ARCHITECTURE.md section 11.2) is an explicit rule, not
 * a suggestion: blue (`accent`) is interactive, green (`success`) is
 * achievement. A completed set turns green because it is an accomplishment;
 * a primary button is blue because it is an action. Mixing them makes both
 * meaningless - do not reach for `success` to mean "primary" or `accent` to
 * mean "done".
 */

export const color = {
  // Surfaces - the "almost black to dark gray" ladder
  background: '#09090B',
  backgroundElevated: '#0F0F12',
  surface: '#151518',
  surfaceElevated: '#1C1C21',
  surfacePressed: '#232329',
  surfaceOverlay: 'rgba(9,9,11,0.72)',

  // Borders - the main hierarchy tool in a dark UI where shadows barely read
  border: '#26262C',
  borderStrong: '#35353E',
  borderAccent: 'rgba(76,141,255,0.40)',

  // Text
  textPrimary: '#F4F4F5',
  textSecondary: '#A1A1AA',
  // Brightened from the original #6B6B76 (accessibility audit,
  // reports/accessibility-2026-08-05-p1.md, A11Y-001) - the original value
  // measured 3.2:1-3.8:1 against the surface ladder, below WCAG AA's 4.5:1
  // for regular-size text (TextField helper text, StatTile footnote/caption
  // labels are real, non-decorative content rendered at this color, not just
  // decorative/hidden glyphs). #838390 clears 4.5:1 against background,
  // surface, and surfaceElevated alike while staying visibly dimmer than
  // textSecondary, preserving the primary > secondary > tertiary hierarchy.
  textTertiary: '#838390',
  // textDisabled is exempt from WCAG contrast minimums (1.4.3/1.4.11 both
  // explicitly exclude inactive/disabled UI text) - intentionally low
  // contrast so "disabled" reads as unambiguously not interactive.
  textDisabled: '#4A4A53',
  textInverse: '#09090B',

  // Accent - interactive and brand. Blue. Used sparingly.
  accent: '#4C8DFF',
  accentPressed: '#3B78E0',
  accentSubtle: 'rgba(76,141,255,0.14)',
  accentText: '#8FB6FF',

  // Semantic
  success: '#3DDC84', // set completed, PR achieved - NEVER used as brand accent
  successSubtle: 'rgba(61,220,132,0.14)',
  warning: '#F5A524',
  danger: '#F2545B',
  dangerSubtle: 'rgba(242,84,91,0.14)',

  // Set-type badges
  setWarmup: '#F5A524',
  setNormal: '#A1A1AA',
  setDrop: '#B48BFF',
  setFailure: '#F2545B',
  setAssisted: '#4CC9F0',
  setPartial: '#8B8B95',

  // Charts - 6 hues, checked for separation on #09090B and for deuteranopia.
  // components/charts is out of scope for P1 (ADR-0010 lands with
  // statistics), but the tokens are harmless to define now alongside the
  // rest of the color block per ARCHITECTURE.md section 11.2.
  chart: ['#4C8DFF', '#3DDC84', '#B48BFF', '#F5A524', '#4CC9F0', '#FF7AB6'],
  chartGrid: '#1F1F25',
  chartAxis: '#6B6B76',
} as const;

export const space = {
  0: 0,
  px: 1,
  0.5: 2,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const;

// Cards default to radius.xl (20) and sheets to radius['2xl'] (28) - the
// brief's "large rounded corners", calibrated against Hevy and Linear.
export const radius = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 28,
  '3xl': 36,
  full: 9999,
} as const;

// Honest note on shadows: on a near-black background a drop shadow is
// almost invisible. Depth in this app comes primarily from the surface
// ladder plus a 1px border; shadows are applied only to genuinely floating
// elements (rest timer bar, bottom sheets, FAB) where separation from
// scrolling content matters. These are consumed imperatively (spread into a
// `style` prop) - React Native shadow props have no NativeWind class
// equivalent, so they are not mirrored in tailwind.config.js.
export const elevation = {
  none: {},
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  sheet: {
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  float: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
} as const;

// Minimum 44x44pt effective target (WCAG 2.5.5 / Apple HIG). `default` is
// what most icon-sized (24-32pt) interactive elements need to clear 44pt;
// `small` is for elements already close to 44pt on their own.
export const hitSlop = { small: 8, default: 12 } as const;

// Every numeric display (set rows, timers, weights, statistics tiles) uses
// `fontVariant: ['tabular-nums']` (see components/ui/Text.tsx's `numeric`/
// `numericLarge` variants). Without it the rest timer's digits jitter as
// they count down and set-row columns fail to align.
export const font = {
  family: { sans: 'System', mono: 'SpaceMono' }, // system = SF Pro on iOS, Roboto on Android
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700' },
  size: {
    caption: 12,
    footnote: 13,
    subhead: 14,
    callout: 15,
    body: 16,
    title3: 18,
    title2: 22,
    title1: 28,
    display: 34,
    numeric: 44,
  },
  lineHeight: {
    caption: 16,
    footnote: 18,
    subhead: 20,
    callout: 20,
    body: 22,
    title3: 24,
    title2: 28,
    title1: 34,
    display: 41,
    numeric: 48,
  },
  tracking: { tight: -0.4, normal: 0, wide: 0.4 },
} as const;

// Rules (ARCHITECTURE.md section 11.5): no animation on the set-completion
// critical path may delay the state change - the checkmark flips
// immediately and the color/scale animation plays over it. Swipe gestures
// use Reanimated worklets on the UI thread so they never drop frames while
// SQLite writes on the JS thread.
export const motion = {
  duration: { instant: 0, fast: 120, normal: 200, slow: 320, deliberate: 480 },
  // Bezier control points only, not `Easing.bezier(...)` calls - see the
  // file header for why this module never imports react-native-reanimated.
  // `standard` is ARCHITECTURE.md section 11.5's Easing.bezier(0.2, 0, 0, 1)
  // verbatim. `decelerate`/`accelerate` have no entry here: they are
  // Reanimated's named power-curve easings (Easing.out(Easing.cubic) /
  // Easing.in(Easing.cubic)), not bezier curves, so approximating them as
  // bezier points would drift from the spec - theme/index.ts constructs
  // them directly from the named curves instead.
  easing: {
    standard: [0.2, 0, 0, 1],
  },
  spring: {
    snappy: { damping: 18, stiffness: 260, mass: 0.9 },
    gentle: { damping: 22, stiffness: 140, mass: 1 },
  },
} as const;
