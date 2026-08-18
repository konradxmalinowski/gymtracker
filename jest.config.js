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

  // Gesture Handler's own jestSetup mocks its native module (`SwipeableRow`,
  // `DraggableList`) the same way `moduleNameMapper` below stands in for
  // Reanimated's - both are the libraries' own documented Jest entry points,
  // not hand-rolled mocks.
  setupFiles: ['react-native-gesture-handler/jestSetup'],

  clearMocks: true,

  // Reanimated 4 / react-native-worklets try to load a real native module at
  // import time (`NativeWorklets.native.ts`'s `loadUnpackers`), which has no
  // native side under Jest's Node environment and throws before any test
  // runs. Both packages ship their own JS-only mock for exactly this
  // (shared values become plain refs, `useAnimatedStyle` returns a static
  // style object, `withSpring`/`withTiming` resolve immediately) - but
  // Reanimated's `mock.js` alone isn't enough on 4.x, since it still imports
  // its real `./index`, which in turn imports the real (native-module-
  // touching) `react-native-worklets`. Mocking `react-native-worklets` too
  // is what actually breaks that chain, letting every component built on
  // Reanimated (`PressScale`, `SegmentedControl`, `SwipeableRow`,
  // `DraggableList`) render under RNTL without a real worklets runtime.
  moduleNameMapper: {
    '^react-native-worklets$': 'react-native-worklets/lib/module/mock',
    '^react-native-reanimated$': 'react-native-reanimated/mock',
    // P11 (statistics): `victory-native` renders through `@shopify/react-native-skia`'s
    // Canvas, which needs a WASM CanvasKit runtime under Jest - see
    // `__tests__/__mocks__/victoryNativeMock.tsx`'s own header comment for why a
    // project-owned mock is used instead of the library's official (heavyweight,
    // testEnvironment-changing) Jest setup.
    '^victory-native$': '<rootDir>/__tests__/__mocks__/victoryNativeMock.tsx',
  },

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
