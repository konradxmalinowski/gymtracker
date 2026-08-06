import { Text } from 'react-native';

/**
 * Stand-in for `@expo/vector-icons`'s `Ionicons` in tests. `expo-font` (a
 * transitive dependency of `@expo/vector-icons`) requires `expo-asset` at
 * module load time; `expo-asset` is missing from this repo's installed
 * dependency tree (it exists nested under `expo`'s own `node_modules`, not
 * hoisted to the top level `expo-font` itself resolves against) - a
 * pre-existing, repo-wide gap unrelated to this phase's screens, surfaced here
 * only because this is the first test suite to render an Ionicons-using
 * component. Kept as its own module (not an inline `jest.mock()` factory)
 * because NativeWind's Babel plugin wraps `react-native` host components
 * (`Text` here) with a `cssInterop()` call that imports a module-level
 * helper - injecting that import into a `jest.mock()` factory's closure trips
 * Jest's out-of-scope-variable guard for mock factories.
 */
export function Ionicons({ name }: { name?: string; [key: string]: unknown }) {
  return <Text>{name ?? ''}</Text>;
}
