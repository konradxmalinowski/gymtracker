import { HomeScreen } from '@/features/home/screens/HomeScreen';

/**
 * Thin wrapper into `HomeScreen` (CLAUDE.md: "app/ never contains screen
 * bodies"), imported by direct file path rather than the `home` barrel - the
 * same precedent every other tab-root wrapper follows (`PlanListScreen`/
 * `ExerciseLibraryScreen`'s own route wrappers; screens are never
 * barrel-exported in this codebase).
 */
export default function HomeIndex() {
  return <HomeScreen />;
}
