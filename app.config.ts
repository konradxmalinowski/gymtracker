import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'GymTracker',
  slug: 'gymtracker',
  owner: 'konradxmalinowski-2',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'gymtracker',
  userInterfaceStyle: 'dark',
  icon: './assets/images/icon.png',
  ios: {
    bundleIdentifier: 'com.konradmalinowski.gymtracker',
    supportsTablet: false,
  },
  android: {
    package: 'com.konradmalinowski.gymtracker',
    adaptiveIcon: {
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    'expo-sharing',
    // Device-locale detection for the P1 i18n layer (@/i18n) - only the
    // English catalog ships in v1 (D-11), but reading the device locale now
    // means a future Polish catalog is a data-only addition, not a refactor.
    'expo-localization',
    [
      // P3: onboarding's optional avatar picker. Only `launchImageLibraryAsync`
      // is ever called (no camera-capture screen exists) - `cameraPermission:
      // false` tells the plugin to omit the camera permission/entitlement
      // entirely (NSCameraUsageDescription on iOS, android.permission.CAMERA
      // on Android) rather than requesting an access scope the app never
      // exercises. Add a real `cameraPermission` string only if/when a screen
      // actually calls `launchCameraAsync`.
      'expo-image-picker',
      {
        photosPermission: 'GymTracker uses your photo library to set a profile avatar.',
        cameraPermission: false,
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#09090B',
      },
    ],
    [
      // D-05: the Sentry config plugin is wired in unconditionally, in P0, even
      // though reporting ships off. The plugin only touches the *native* project
      // (links the SDK, writes sentry.properties for source-map upload) - adding
      // it later would be exactly the native change right before store
      // submission that D-05 exists to avoid. It carries no DSN: the DSN is a
      // runtime Sentry.init() argument, see `extra.sentry` below.
      //
      // `organization`/`project` are read from the environment at build time and
      // are only used to upload source maps. They are declared as keys (rather
      // than omitted) on purpose: the plugin warns on every config resolution
      // for a *missing* key, but falls back silently to SENTRY_ORG/
      // SENTRY_PROJECT when the key exists and is undefined - which is the
      // quiet, correct behaviour for a repo where they legitimately are not set.
      '@sentry/react-native',
      {
        organization: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
      },
    ],
  ],
  extra: {
    eas: {
      projectId: '9c25b5d1-7371-49ec-aaee-f6884a31e820',
    },
    sentry: {
      // P15 (settings) adds the user-facing toggle that overrides this default and is the only place Sentry.init() is ever called.
      defaultEnabled: false,
      // Never committed - unset here and in CI, which is the correct P0 state.
      // The key is omitted rather than set to null when the env var is missing:
      // Expo's config serializer rewrites a `null` in `extra` into `{}`, which
      // is truthy, so a later `if (extra.sentry.dsn)` would initialize the SDK
      // against an empty object instead of staying off.
      ...(process.env.SENTRY_DSN ? { dsn: process.env.SENTRY_DSN } : {}),
    },
  },
  experiments: {
    typedRoutes: true,
  },
};

export default config;
