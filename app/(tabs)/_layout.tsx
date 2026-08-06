import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

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
  profile: { active: 'person', inactive: 'person-outline' },
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
      <Tabs.Screen name="plans/index" options={{ title: t('tabs.plans') }} />
      <Tabs.Screen name="exercises/index" options={{ title: t('tabs.exercises') }} />
      <Tabs.Screen name="stats/index" options={{ title: t('tabs.stats') }} />
      <Tabs.Screen name="profile/index" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
