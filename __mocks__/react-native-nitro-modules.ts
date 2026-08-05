/**
 * Manual Jest mock for `react-native-nitro-modules` - picked up automatically
 * for every test file because it lives in a root-level `__mocks__/` folder
 * adjacent to `node_modules` (Jest's documented convention for mocking a node
 * module without a `jest.mock()` call at every use site).
 *
 * Why this is needed: `react-native-mmkv` v4 (`services/kv/MmkvStore.ts`)
 * correctly branches to its own `createMockMMKV()` under Jest
 * (`react-native-mmkv/src/isTest.ts` checks `process.env.JEST_WORKER_ID`) -
 * but that branch is inside `createMMKV()`'s function body, while
 * `react-native-mmkv/lib/getMMKVFactory.js` does a real, *top-level*
 * `import { NitroModules } from 'react-native-nitro-modules'`. Nitro's own
 * `src/index.ts` eagerly calls `TurboModuleRegistry.getEnforcing('NitroModules')`
 * at that same top level, which throws immediately - before `isTest()` ever
 * gets a chance to run - because no real native TurboModule is registered
 * under `jest-environment-node`. This mirrors the exact reason
 * `jest.config.js` already maps `react-native-reanimated`/`react-native-worklets`
 * to their own JS-only mocks: a native module whose *import*, not just its
 * use, has a real native side effect.
 *
 * `getMMKVFactory()`/`getPlatformContext()` (the only functions that touch
 * `NitroModules`) are never actually called once `createMMKV()` takes the
 * test branch, so this stub never needs to do anything - it only has to exist
 * so importing it doesn't crash.
 */
export const NitroModules = {
  createHybridObject: () => ({}),
};
