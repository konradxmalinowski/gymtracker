const { createJiti } = require('jiti');

// theme/tokens.ts is the single source of truth for design tokens
// (ARCHITECTURE.md section 11.1). jiti lets this plain-Node config file read
// the same TypeScript module the app imports at runtime, so colors are never
// duplicated between here and `theme/tokens.ts`.
const jiti = createJiti(__filename);
const { color } = jiti('./theme/tokens.ts');

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
        'text-primary': color.textPrimary,
        'text-secondary': color.textSecondary,
        accent: color.accent,
      },
    },
  },
  plugins: [],
};
