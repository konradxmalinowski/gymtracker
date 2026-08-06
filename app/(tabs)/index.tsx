import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Home route. There is no `home` feature to render yet (P10 in
 * docs/ROADMAP.md) - this is a genuinely finished, minimal wordmark screen
 * for P0, not a stub for one to be built later.
 */
export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text className="text-4xl font-bold tracking-tight text-text-primary">GymTracker</Text>
        <Text className="text-center text-base text-text-secondary">
          Log a set in seconds. Fully offline.
        </Text>
      </View>
    </SafeAreaView>
  );
}
