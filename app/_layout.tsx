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
import { ConfirmDialog, ErrorState, SheetHost, ToastHost } from '@/components/feedback';
import { Text } from '@/components/ui';
import { ExpoSqlExecutor, openDatabase } from '@/database/client';
import { runMigrations } from '@/database/migrations';
import { loadCatalogAsset, runSeed } from '@/database/seed';
import type { ActiveSessionSnapshot } from '@/features/workout-logging';
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
import { useToastStore } from '@/stores/toastStore';
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

        // Runs on every boot, not just first launch - `runSeed()` is idempotent
        // (a true no-op once the bundled catalog version has already been seeded).
        // Placed before `createContainer()` so `container.exerciseService` never
        // observes an empty catalog on a fresh install; held under the same
        // splash-screen gate as migrations (see the comment above
        // `preventAutoHideAsync()`), via the same try/catch as the rest of
        // `bootstrap()` so a seed failure surfaces as boot `{status: 'error'}`
        // rather than an unhandled rejection.
        await runSeed(executor, loadCatalogAsset());

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
 * P6 / ADR-0005 mechanism 6-7: after the profile gate resolves, checks the
 * `session.active` MMKV flag and reads `sessionService.findInProgress()` -
 * a fresh in-progress session redirects straight into `workout/active`, a
 * stale one (`isStale`, ADR-0005 mechanism 7) shows a finish-or-discard
 * prompt rather than silently resuming, and a flag that turns out to be
 * stale itself (`findInProgress()` returns `null` despite the flag being
 * true) is corrected in place - "the database wins" per the ADR, not the
 * cached flag.
 *
 * This check does not hold the splash screen the way the profile query does
 * (`useEffect` below still hides it once `isLoading` clears): the MMKV flag
 * read itself is synchronous (ADR-0007 rule 8 only requires the *flag* be
 * read before the splash lifts, not the subsequent async
 * `findInProgress()` resolution), and blocking cold start on a second SQLite
 * round trip risks NFR-02's budget for a case that is, by definition, not
 * the common path. The brief `<Redirect>` conditionally rendered alongside
 * `<Stack>` mirrors the same pattern this file already uses for the
 * onboarding gate below it.
 */
type SessionGateState =
  | { status: 'checking' }
  | { status: 'none' }
  | { status: 'resume' }
  | { status: 'stale'; snapshot: ActiveSessionSnapshot };

function useSessionResumeGate(ready: boolean): SessionGateState {
  const container = useContainer();
  const [state, setState] = useState<SessionGateState>({ status: 'checking' });

  useEffect(() => {
    if (!ready) {
      return;
    }
    let cancelled = false;

    void (async () => {
      if (!kv.get('session.active')) {
        if (!cancelled) {
          setState({ status: 'none' });
        }
        return;
      }

      const snapshot = await container.sessionService.findInProgress();
      if (cancelled) {
        return;
      }

      if (!snapshot) {
        // The flag disagreed with the database - the database wins
        // (ADR-0005 mechanism 6), so the flag is corrected here rather than
        // trusted on the next boot too.
        kv.set('session.active', false);
        kv.delete('session.activeId');
        setState({ status: 'none' });
        return;
      }

      setState(snapshot.isStale ? { status: 'stale', snapshot } : { status: 'resume' });
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, container]);

  return state;
}

/**
 * Holds the native splash screen for the last two gate conditions (profile
 * query resolved), then routes to onboarding or the tab bar - the "no
 * profile -> onboarding, profile exists -> tabs" branch of ARCHITECTURE.md
 * section 10.1's route graph. Mirrors `app/dev/db-health.tsx` /
 * `app/dev/gallery.tsx`'s existing "early-return `<Redirect>`" pattern
 * rather than introducing a new gating mechanism. Extended in P6 with the
 * crash-recovery session gate above - only checked once a profile exists,
 * since a fresh install with no profile always goes to onboarding first
 * regardless of any leftover session state.
 */
export function RootNavigationGate() {
  const container = useContainer();
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => container.profileService.getProfile(),
  });

  const sessionGate = useSessionResumeGate(!isLoading && profile !== null && profile !== undefined);
  const [staleGateResolved, setStaleGateResolved] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLoading]);

  if (isLoading) {
    return null;
  }

  async function resolveStale(action: 'finish' | 'discard', sessionId: string) {
    // Resolved immediately so the dialog dismisses on tap rather than
    // waiting on the write - this is a boot-time prompt, not the hot
    // set-completion path, but the same "the UI doesn't wait on the
    // database" principle still applies to not leaving a dialog open. A
    // fresh cold boot re-evaluates the whole gate from scratch regardless of
    // this component's local state, so dismissing early here is safe even
    // though the write below might still fail.
    setStaleGateResolved(true);
    try {
      if (action === 'finish') {
        await container.sessionService.finish(sessionId);
      } else {
        await container.sessionService.discard(sessionId);
      }
      // Only clear the flags once the write has actually committed -
      // matching `useFinishDiscardWorkout.clearAndExit()`'s pattern
      // (clear-on-success only, never in a `finally`). ADR-0005 mechanism 6:
      // "when the flag and the database disagree, the database wins, and
      // the flag is corrected" - clearing unconditionally on a failed write
      // would do the opposite, silently orphaning an `in_progress` row that
      // no later boot would ever check for again.
      kv.set('session.active', false);
      kv.delete('session.activeId');
    } catch {
      // Boot-time best-effort: a failure here must not trap the user behind
      // a dialog they cannot get past, so the dialog still dismisses (see
      // `setStaleGateResolved` above). The MMKV flags are deliberately left
      // untouched so the next cold boot re-triggers this same stale-session
      // gate instead of silently losing track of the row.
      useToastStore.getState().show({
        message: t(
          action === 'finish'
            ? 'workoutLogging.active.finishErrorMessage'
            : 'workoutLogging.active.discardErrorMessage',
        ),
      });
    }
  }

  const showStaleDialog = sessionGate.status === 'stale' && !staleGateResolved;

  return (
    <>
      {profile === null ? <Redirect href={routes.onboarding()} /> : null}
      {sessionGate.status === 'resume' ? <Redirect href={routes.workout.active()} /> : null}
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
      {sessionGate.status === 'stale' ? (
        <ConfirmDialog
          visible={showStaleDialog}
          title={t('workoutLogging.stale.title')}
          message={t('workoutLogging.stale.messageTemplate', {
            hours: sessionGate.snapshot.staleAfterHours,
          })}
          confirmLabel={t('workoutLogging.stale.finishButtonLabel')}
          cancelLabel={t('workoutLogging.stale.discardButtonLabel')}
          onConfirm={() => void resolveStale('finish', sessionGate.snapshot.session.id)}
          onCancel={() => void resolveStale('discard', sessionGate.snapshot.session.id)}
          testID="stale-session-dialog"
        />
      ) : null}
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
