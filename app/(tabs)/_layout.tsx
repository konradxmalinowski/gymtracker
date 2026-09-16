import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import { t } from '@/i18n';
import { color } from '@/theme/tokens';

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * The 6-tab route graph (ARCHITECTURE.md section 10.1 predates the UI/UX
 * polish sweep that added Goals as a 6th tab - previously reachable only
 * via `home`'s `TodaysGoalsCard`). Icons are Ionicons (`@expo/vector-icons`)
 * - the only icon family used anywhere in the app from this phase on
 * (CLAUDE.md "Known gaps": "pick one and use it everywhere, don't let two
 * icon systems coexist"). Outline glyphs for the inactive state, filled
 * glyphs for the active one - the standard iOS/Android tab bar convention.
 */
const TAB_ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  index: { active: 'home', inactive: 'home-outline' },
  plans: { active: 'clipboard', inactive: 'clipboard-outline' },
  exercises: { active: 'barbell', inactive: 'barbell-outline' },
  stats: { active: 'stats-chart', inactive: 'stats-chart-outline' },
  // `flag`/`flag-outline` mirrors `TodaysGoalsCard`'s own icon
  // (`flag-outline`, always inactive-styled there) rather than
  // `checkmark-circle`, since a daily goal isn't always a one-shot
  // completion (a `numeric`/`counter` goal has ongoing progress, not just a
  // done/not-done state) - `flag` reads as "a target to reach" regardless of
  // goal type, matching this app's existing icon vocabulary for the feature.
  goals: { active: 'flag', inactive: 'flag-outline' },
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
      {/* Points at the folder, not "goals/index" - same P4/P5 restructure
          reasoning as `plans`/`exercises`/`stats` above, now applied to the
          UI/UX polish sweep's own nested Stack (index -> manage -> create/
          edit -> reminders). See `app/(tabs)/goals/_layout.tsx`'s file
          header for the full reasoning. */}
      <Tabs.Screen name="goals" options={{ title: t('tabs.goals') }} />
      <Tabs.Screen name="profile/index" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
