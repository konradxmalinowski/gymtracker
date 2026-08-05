/**
 * Jest configuration - ARCHITECTURE.md section 14.
 *
 * `jest-expo` is used rather than a bare `react-native` preset because it is the
 * only preset that mirrors how Expo actually resolves platform extensions and
 * mocks the Expo native modules this app depends on. Its default
 * `transformIgnorePatterns` already covers `expo*`, `react-native*`,
 * `react-native-svg` and `@sentry/react-native`; it is deliberately not
 * overridden here, because a hand-rolled pattern that drifts from the preset
 * fails as an opaque "unexpected token" at some later phase. Extend it when a
 * test actually pulls in an untranspiled package, not before.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  preset: 'jest-expo',

  // Only files explicitly named `*.test.ts(x)` are suites. Jest's default
  // pattern treats *everything* under `__tests__/` as a test file, which breaks
  // the moment a fixture, factory or schema helper lands there - and per
  // ARCHITECTURE.md section 14.2 the repository tests will need exactly that.
  testMatch: ['**/__tests__/**/*.test.ts?(x)', '**/*.test.ts?(x)'],

  clearMocks: true,

  collectCoverageFrom: [
    'domain/**/*.ts',
    'features/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'repositories/**/*.ts',
    'services/**/*.ts',
    'utils/**/*.ts',
    '!**/index.ts',
    '!**/*.d.ts',
  ],
};
