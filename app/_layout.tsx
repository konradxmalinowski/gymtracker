import '../global.css';

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Redirect, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { Screen } from '@/components/layout';
import { ErrorState, SheetHost, ToastHost } from '@/components/feedback';
import { Text } from '@/components/ui';
import { ExpoSqlExecutor, openDatabase } from '@/database/client';
import { runMigrations } from '@/database/migrations';
import { routes } from '@/navigation/routes';
import {
  ContainerProvider,
  createContainer,
  useContainer,
  type AppContainer,
} from '@/services/container';
import { kv } from '@/services/kv';
import { createLogger } from '@/services/logging';
import { t } from '@/i18n';
import { color, space } from '@/theme/tokens';

// Keep the native splash screen mounted until the root gate below decides
// where to send the user (ARCHITECTURE.md section 10.2: "held until fonts
// loaded, migrations applied, profile query resolved, MMKV active-session
// flag read"). P0 bundles no custom fonts to wait on and no route yet reads
// the active-session flag for redirect purposes (workout-logging doesn't
// exist until a later phase) - those two conditions are added when the
// phases that actually need them land, the same way this comment already
// predicted for fonts. Migrations + profile query are this phase's job.
void SplashScreen.preventAutoHideAsync().catch(() => {});

// ADR-0008 "Why TanStack Query at all" - global defaults: nothing external
// can change local SQLite data, so a stale local read only gets fresher via
// an explicit mutation invalidating it, never via a timer or a retry.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: 30 * 60 * 1000,
      retry: 0,
      refetchOnWindowFocus: false,
    },
  },
});

type BootState =
  | { status: 'booting' }
  | { status: 'ready'; container: AppContainer }
  | { status: 'unsupported-version'; databaseVersion: number; highestKnownVersion: number }
  | { status: 'error'; message: string };

export default function RootLayout() {
  const [boot, setBoot] = useState<BootState>({ status: 'booting' });

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const db = await openDatabase();
        const executor = new ExpoSqlExecutor(db);
        const appVersion = Constants.expoConfig?.version ?? '0.0.0';
        const migrationResult = await runMigrations(executor, appVersion);

        if (migrationResult.status === 'unsupported-future-version') {
          if (!cancelled) {
            setBoot({
              status: 'unsupported-version',
              databaseVersion: migrationResult.databaseVersion,
              highestKnownVersion: migrationResult.highestKnownVersion,
            });
          }
          return;
        }

        const container = createContainer(executor);

        // ADR-0008 MMKV key inventory: units.*/haptics.enabled are mirrored
        // into MMKV so presentation code can read them synchronously; SQLite
        // stays authoritative and the mirror is re-synced from it on every
        // boot (this is that re-sync - the mutation-time write happens in
        // features/profile's settings hooks).
        const [weightUnit, lengthUnit, hapticsEnabled] = await Promise.all([
          container.settings.get('units.weight'),
          container.settings.get('units.length'),
          container.settings.get('haptics.enabled'),
        ]);
        kv.set('units.weight', weightUnit);
        kv.set('units.length', lengthUnit);
        kv.set('haptics.enabled', hapticsEnabled);

        if (!cancelled) {
          setBoot({ status: 'ready', container });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        createLogger().error('app.boot.failed', { message });
        if (!cancelled) {
          setBoot({ status: 'error', message });
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  if (boot.status === 'booting') {
    // Native splash screen is still up - nothing to paint yet.
    return null;
  }

  if (boot.status === 'error' || boot.status === 'unsupported-version') {
    return <BootFailureScreen boot={boot} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ContainerProvider container={boot.container}>
          <QueryClientProvider client={queryClient}>
            <RootNavigationGate />
          </QueryClientProvider>
        </ContainerProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Holds the native splash screen for the last two gate conditions (profile
 * query resolved), then routes to onboarding or the tab bar - the "no
 * profile -> onboarding, profile exists -> tabs" branch of ARCHITECTURE.md
 * section 10.1's route graph. Mirrors `app/dev/db-health.tsx` /
 * `app/dev/gallery.tsx`'s existing "early-return `<Redirect>`" pattern
 * rather than introducing a new gating mechanism.
 */
function RootNavigationGate() {
  const container = useContainer();
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => container.profileService.getProfile(),
  });

  useEffect(() => {
    if (!isLoading) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLoading]);

  if (isLoading) {
    return null;
  }

  return (
    <>
      {profile === null ? <Redirect href={routes.onboarding()} /> : null}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.background },
        }}
      />
      {/* Single root-level hosts (ARCHITECTURE.md section 11.7) - every
          feature triggers a toast/sheet through stores/toastStore.ts and
          stores/sheetStore.ts rather than mounting its own. */}
      <ToastHost />
      <SheetHost />
    </>
  );
}

/**
 * Section 15.1's "the app refuses to run if PRAGMA user_version is higher
 * than the highest migration the bundle knows about, showing a 'please
 * update the app' screen instead of corrupting data" plus a plain fallback
 * for any other boot failure (e.g. `openDatabase` itself throwing). Kept
 * deliberately minimal - a fuller diagnostics/recovery screen is a later
 * phase's concern - but real, finished copy rather than a placeholder,
 * since a user can legitimately land here.
 */
function BootFailureScreen({
  boot,
}: {
  boot: Extract<BootState, { status: 'error' | 'unsupported-version' }>;
}) {
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  const message =
    boot.status === 'unsupported-version'
      ? t('boot.unsupportedVersionMessage', {
          databaseVersion: boot.databaseVersion,
          highestKnownVersion: boot.highestKnownVersion,
        })
      : t('boot.genericErrorMessage', { detail: boot.message });

  return (
    <SafeAreaProvider>
      <Screen edges={['top', 'bottom']} testID="boot-failure-screen">
        <View style={{ flex: 1, gap: space[6], justifyContent: 'center' }}>
          <Text variant="title2" color="primary" align="center">
            GymTracker
          </Text>
          <ErrorState error={message} />
        </View>
      </Screen>
    </SafeAreaProvider>
  );
}
