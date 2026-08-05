const { createJiti } = require('jiti');

// theme/tokens.ts is the single source of truth for design tokens
// (ARCHITECTURE.md section 11.1). jiti lets this plain-Node config file read
// the same TypeScript module the app imports at runtime, so no token value
// is ever duplicated between here and `theme/tokens.ts` - every entry below
// is a reference into the imported objects, never a literal hex/number
// copied out of them.
const jiti = createJiti(__filename);
const { color, space, radius, font } = jiti('./theme/tokens.ts');

// NativeWind resolves spacing/fontSize to raw React Native style values, not
// CSS - unitless numbers (px), not rem strings, are correct here.
const spacing = Object.fromEntries(Object.entries(space).map(([key, value]) => [key, value]));

const borderRadius = Object.fromEntries(Object.entries(radius).map(([key, value]) => [key, value]));

const fontSize = Object.fromEntries(
  Object.entries(font.size).map(([key, value]) => [
    key,
    [value, { lineHeight: `${font.lineHeight[key]}px` }],
  ]),
);

const fontWeight = { ...font.weight };

const letterSpacing = Object.fromEntries(
  Object.entries(font.tracking).map(([key, value]) => [key, `${value}px`]),
);

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './features/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: color.background,
        'background-elevated': color.backgroundElevated,
        surface: color.surface,
        'surface-elevated': color.surfaceElevated,
        'surface-pressed': color.surfacePressed,
        'surface-overlay': color.surfaceOverlay,

        border: color.border,
        'border-strong': color.borderStrong,
        'border-accent': color.borderAccent,

        'text-primary': color.textPrimary,
        'text-secondary': color.textSecondary,
        'text-tertiary': color.textTertiary,
        'text-disabled': color.textDisabled,
        'text-inverse': color.textInverse,

        accent: color.accent,
        'accent-pressed': color.accentPressed,
        'accent-subtle': color.accentSubtle,
        'accent-text': color.accentText,

        success: color.success,
        'success-subtle': color.successSubtle,
        warning: color.warning,
        danger: color.danger,
        'danger-subtle': color.dangerSubtle,

        'set-warmup': color.setWarmup,
        'set-normal': color.setNormal,
        'set-drop': color.setDrop,
        'set-failure': color.setFailure,
        'set-assisted': color.setAssisted,
        'set-partial': color.setPartial,

        'chart-1': color.chart[0],
        'chart-2': color.chart[1],
        'chart-3': color.chart[2],
        'chart-4': color.chart[3],
        'chart-5': color.chart[4],
        'chart-6': color.chart[5],
        'chart-grid': color.chartGrid,
        'chart-axis': color.chartAxis,
      },
      spacing,
      borderRadius,
      fontSize,
      fontWeight,
      letterSpacing,
      fontFamily: {
        sans: [font.family.sans],
        mono: [font.family.mono],
      },
    },
  },
  plugins: [],
};
