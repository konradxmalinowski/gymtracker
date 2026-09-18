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
    // P17 (daily-goals): without this, `expo-notifications`' own
    // ExpoSchedulingDelegate.setupAlarm() falls back to
    // AlarmManagerCompat.setAndAllowWhileIdle() (inexact) on Android 12+,
    // and its DateTrigger.nextTriggerDate() has zero delivery-delay
    // tolerance - the instant the OS's inexact delivery window pushes
    // firing past the target timestamp, the notification is silently
    // dropped rather than shown late. Confirmed live on a real emulator:
    // an inexact alarm delivered ~2 minutes late was discarded with zero
    // notification ever posted. Declaring SCHEDULE_EXACT_ALARM lets
    // `canScheduleExactAlarms()` return true so the delegate uses
    // `setExactAndAllowWhileIdle()` instead, which is what rest-timer's
    // own P7 notification already relies on implicitly. This is a normal
    // (not "special"/runtime-dangerous) permission, auto-granted on
    // install through Android 12; Android 13+ requires the user to grant
    // it via Settings > Apps > GymTracker > Alarms & reminders - this app
    // has no in-app deep link into that screen yet (a real, documented
    // follow-up, not silently dropped - see CLAUDE.md's Known gaps).
    permissions: ['android.permission.SCHEDULE_EXACT_ALARM'],
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    'expo-sharing',
    // P14: the data-transfer import screen's file picker. Registered
    // defensively, the same reasoning `expo-sharing`'s own entry above
    // documents in `CLAUDE.md`'s P9 write-up: `expo-document-picker`'s own
    // config plugin (`node_modules/expo-document-picker/plugin`) only ever
    // touches iOS entitlements, and only when `ios.usesIcloudStorage` is
    // set - which this app's config does not - so this is currently a
    // confirmed no-op, added so the module isn't literally absent from the
    // plugins list rather than because it changes anything today.
    'expo-document-picker',
    // Device-locale detection for the P1 i18n layer (@/i18n) - only the
    // English catalog ships in v1 (D-11), but reading the device locale now
    // means a future Polish catalog is a data-only addition, not a refactor.
    'expo-localization',
    [
      // P3 (onboarding avatar) originally set `cameraPermission: false` here
      // since only `launchImageLibraryAsync` was called. Body-metrics'
      // progress-photo sheet (`PhotoSourceSheetContent`) now also calls
      // `launchCameraAsync`, so `false` was wrong: on Android it makes the
      // plugin emit `<uses-permission android:name="android.permission.CAMERA"
      // tools:node="remove"/>`, which strips CAMERA from the merged manifest
      // entirely - `requestCameraPermissionsAsync()` then resolves denied
      // without ever showing the OS dialog, since the app declares no camera
      // use at all. Confirmed live: a real `android/app/src/main/
      // AndroidManifest.xml` prebuild had exactly that `tools:node="remove"`
      // line. A real usage string restores the permission declaration on both
      // platforms (NSCameraUsageDescription on iOS, CAMERA on Android) and
      // requires a native rebuild (`npx expo prebuild`) to take effect - a
      // Metro reload alone does not regenerate the manifest/Info.plist.
      'expo-image-picker',
      {
        photosPermission: 'GymTracker uses your photo library to set a profile avatar.',
        cameraPermission: 'GymTracker uses your camera to take progress photos.',
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
