import '../global.css';

import { useCallback } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { color } from '@/theme/tokens';

// Keep the native splash screen mounted until the root view has laid out.
// P0 bundles no custom fonts or bootstrap assets to wait on, so "ready" is
// the first layout pass; P1 extends this gate with `useFonts` once
// assets/fonts/ has real font files to load.
void SplashScreen.preventAutoHideAsync().catch(() => {});

// One QueryClient instance for the app's lifetime. Server/DB-read state goes
// through TanStack Query per feature hooks (ARCHITECTURE.md section 3.1, rule
// 3); this provider is the only place that instance is created.
const queryClient = new QueryClient();

export default function RootLayout() {
  const onLayoutRootView = useCallback(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: color.background },
            }}
          />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
