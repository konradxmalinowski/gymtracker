import { ActiveWorkoutScreen } from '@/features/workout-logging/screens/ActiveWorkoutScreen';

/** Thin wrapper into `ActiveWorkoutScreen` - CLAUDE.md's "`app/` never contains screen bodies." */
export default function WorkoutActive() {
  return <ActiveWorkoutScreen />;
}
