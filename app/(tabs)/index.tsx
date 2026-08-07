import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/feedback';
import { Button } from '@/components/ui';
// P6: `useStartWorkout` is the one deliberate presentation-layer export off
// this barrel (see its doc comment in `features/workout-logging/index.ts`).
// Home has no `home` feature of its own yet (P10) to own this instead.
import { useStartWorkout } from '@/features/workout-logging';
import { t } from '@/i18n';
import { useContainer } from '@/services/container';

/**
 * Home route. There is no `home` feature to render yet (P10 in
 * docs/ROADMAP.md) - this is still a genuinely finished, minimal wordmark
 * screen, not a stub for a later phase's dashboard. The one addition this
 * phase makes is a "Quick Start" action: P6's brief calls out that Home "has
 * no card system yet" so a full entry-point treatment waits for P10, but a
 * plain button calling `startEmpty()` is a small, minimal-diff way to give
 * Quick Start *a* home now rather than none at all.
 */
export default function HomeScreen() {
  const { sessionService } = useContainer();
  const { startEmpty, isStarting, blockedSession, dismissBlocked, resumeBlocked } =
    useStartWorkout(sessionService);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text className="text-4xl font-bold tracking-tight text-text-primary">GymTracker</Text>
        <Text className="text-center text-base text-text-secondary">
          Log a set in seconds. Fully offline.
        </Text>
        <View className="mt-4">
          <Button
            variant="primary"
            label={t('workoutLogging.quickStartButtonLabel')}
            onPress={() => void startEmpty()}
            loading={isStarting}
            testID="home-quick-start-button"
          />
        </View>
      </View>

      <ConfirmDialog
        visible={blockedSession !== null}
        title={t('workoutLogging.start.blockedTitle')}
        message={t('workoutLogging.start.blockedMessageTemplate', {
          title: blockedSession?.session.title ?? '',
        })}
        confirmLabel={t('workoutLogging.start.resumeButtonLabel')}
        onConfirm={resumeBlocked}
        onCancel={dismissBlocked}
        testID="home-start-blocked-dialog"
      />
    </SafeAreaView>
  );
}
