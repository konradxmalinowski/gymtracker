import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { Tabs } from 'expo-router';

import { ActiveWorkoutBanner } from '@/features/workout-logging/components/ActiveWorkoutBanner';
import { t } from '@/i18n';
import { color } from '@/theme/tokens';

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * The 5-tab route graph (ARCHITECTURE.md section 10.1). Icons are Ionicons
 * (`@expo/vector-icons`) - the only icon family used anywhere in the app
 * from this phase on (CLAUDE.md "Known gaps": "pick one and use it
 * everywhere, don't let two icon systems coexist"). Outline glyphs for the
 * inactive state, filled glyphs for the active one - the standard iOS/
 * Android tab bar convention.
 */
const TAB_ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  index: { active: 'home', inactive: 'home-outline' },
  plans: { active: 'clipboard', inactive: 'clipboard-outline' },
  exercises: { active: 'barbell', inactive: 'barbell-outline' },
  stats: { active: 'stats-chart', inactive: 'stats-chart-outline' },
  // `app/(tabs)/profile/` has no nested `_layout.tsx` of its own (still a
  // single flat screen, unlike `plans`/`exercises`/`stats`), so it's
  // registered below by its literal leaf path, `"profile/index"` - which is
  // exactly what `route.name` resolves to here. Keying only `profile` (with
  // no nested Stack to produce that bare route name) silently fell through
  // to the `?? TAB_ICONS['index']` fallback, showing Home's icon on this
  // tab. Add the folder-nested-Stack key too if `profile` ever gets one.
  'profile/index': { active: 'person', inactive: 'person-outline' },
};

export default function TabsLayout() {
  return (
    // `flex: 1` wrapper is the one structural addition this mount point
    // needs: `ActiveWorkoutBanner` positions itself absolutely (see its own
    // file header for why - no `useBottomTabBarHeight()` available without a
    // new dependency), and an absolutely positioned child anchors to its
    // nearest parent regardless of that parent's own `position` value in
    // RN's layout model, so this wrapper needs nothing beyond `flex: 1`.
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: color.accent,
          tabBarInactiveTintColor: color.textTertiary,
          tabBarStyle: {
            backgroundColor: color.backgroundElevated,
            borderTopColor: color.border,
          },
          tabBarIcon: ({ focused, color: tintColor, size }) => {
            const icons = TAB_ICONS[route.name] ?? TAB_ICONS['index'];
            return (
              <Ionicons
                name={focused ? icons!.active : icons!.inactive}
                size={size}
                color={tintColor}
              />
            );
          },
        })}
      >
        <Tabs.Screen name="index" options={{ title: t('tabs.home') }} />
        {/* Points at the folder, not "plans/index" - `app/(tabs)/plans/` has its
            own `_layout.tsx` (a nested Stack: list -> detail -> day) as of P5,
            the exact same restructure `exercises` went through in P4.
            Registering the leaf file directly here would bypass that nested
            Stack entirely, breaking `router.push()` to any sibling route
            within the tab. See `app/(tabs)/plans/_layout.tsx`'s file header,
            and `app/(tabs)/exercises/_layout.tsx`'s original for the full
            reasoning. */}
        <Tabs.Screen name="plans" options={{ title: t('tabs.plans') }} />
        {/* Points at the folder, not "exercises/index" - `app/(tabs)/exercises/`
            has its own `_layout.tsx` (a nested Stack: list -> detail ->
            create/edit). Registering the leaf file directly here would bypass
            that nested Stack entirely, breaking `router.push()` to any sibling
            route within the tab. See `app/(tabs)/exercises/_layout.tsx`'s file
            header for the full reasoning. */}
        <Tabs.Screen name="exercises" options={{ title: t('tabs.exercises') }} />
        {/* Points at the folder, not "stats/index" - same P4/P5 restructure
            reasoning as `plans`/`exercises` above, now applied to P11's own
            nested Stack (list -> per-exercise progression). See
            `app/(tabs)/stats/_layout.tsx`'s file header for the full
            reasoning. */}
        <Tabs.Screen name="stats" options={{ title: t('tabs.stats') }} />
        <Tabs.Screen name="profile/index" options={{ title: t('tabs.profile') }} />
      </Tabs>
      {/* P6: mounted above the tab bar (ADR-0007), visible whenever a
          workout is minimized. See `ActiveWorkoutBanner.tsx`'s own header
          for why its positioning is absolute rather than a `tabBar`-prop
          wrap around the real tab bar. */}
      <ActiveWorkoutBanner />
    </View>
  );
}
