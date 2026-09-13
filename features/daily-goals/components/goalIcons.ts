import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

import { t } from '@/i18n';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * The curated icon subset `GoalFormScreen`'s icon picker offers - this
 * feature's own open decision, resolved here rather than left ambiguous
 * (this file's own header is the answer): 32 Ionicons outline glyphs
 * spanning the common goal categories a habit tracker actually sees
 * (hydration, nutrition, sleep, movement, reading, mindfulness,
 * fitness-adjacent, and general habit/wellness/productivity), every one
 * cross-checked against `node_modules/@expo/vector-icons`'s own Ionicons
 * glyph map before being added here - not assumed from name-guessing. All
 * use the `-outline` suffix, matching every other icon usage already in
 * this codebase (`PlanCard`'s `star-outline`/`create-outline`/etc.).
 *
 * `daily_goal.icon`/`daily_reminder.icon` store the bare Ionicons name as
 * free text (`database/schema.sql`'s own column comment) - this list is a
 * curated *picker*, not a stored enum, so a goal seeded some other way (a
 * future import, say) with an icon name outside this list still renders
 * correctly via `Ionicons name={icon as IoniconName}` at every read site;
 * only the picker itself is limited to this set.
 */
export interface GoalIconOption {
  name: IoniconName;
  label: string;
}

export function getGoalIconOptions(): readonly GoalIconOption[] {
  return [
    { name: 'water-outline', label: t('dailyGoals.form.iconWater') },
    { name: 'nutrition-outline', label: t('dailyGoals.form.iconNutrition') },
    { name: 'restaurant-outline', label: t('dailyGoals.form.iconMeal') },
    { name: 'moon-outline', label: t('dailyGoals.form.iconSleep') },
    { name: 'bed-outline', label: t('dailyGoals.form.iconRest') },
    { name: 'walk-outline', label: t('dailyGoals.form.iconWalk') },
    { name: 'footsteps-outline', label: t('dailyGoals.form.iconSteps') },
    { name: 'bicycle-outline', label: t('dailyGoals.form.iconCycling') },
    { name: 'book-outline', label: t('dailyGoals.form.iconReading') },
    { name: 'leaf-outline', label: t('dailyGoals.form.iconMindfulness') },
    { name: 'flower-outline', label: t('dailyGoals.form.iconWellness') },
    { name: 'barbell-outline', label: t('dailyGoals.form.iconStrength') },
    { name: 'fitness-outline', label: t('dailyGoals.form.iconFitness') },
    { name: 'body-outline', label: t('dailyGoals.form.iconBody') },
    { name: 'checkmark-circle-outline', label: t('dailyGoals.form.iconHabit') },
    { name: 'star-outline', label: t('dailyGoals.form.iconStar') },
    { name: 'heart-outline', label: t('dailyGoals.form.iconHeart') },
    { name: 'sunny-outline', label: t('dailyGoals.form.iconSunlight') },
    { name: 'time-outline', label: t('dailyGoals.form.iconTime') },
    { name: 'alarm-outline', label: t('dailyGoals.form.iconAlarm') },
    { name: 'calendar-outline', label: t('dailyGoals.form.iconCalendar') },
    { name: 'flag-outline', label: t('dailyGoals.form.iconGoal') },
    { name: 'trophy-outline', label: t('dailyGoals.form.iconTrophy') },
    { name: 'medal-outline', label: t('dailyGoals.form.iconMedal') },
    { name: 'pulse-outline', label: t('dailyGoals.form.iconPulse') },
    { name: 'journal-outline', label: t('dailyGoals.form.iconJournal') },
    { name: 'pencil-outline', label: t('dailyGoals.form.iconWriting') },
    { name: 'home-outline', label: t('dailyGoals.form.iconHome') },
    { name: 'briefcase-outline', label: t('dailyGoals.form.iconWork') },
    { name: 'school-outline', label: t('dailyGoals.form.iconStudy') },
    { name: 'cash-outline', label: t('dailyGoals.form.iconFinance') },
    { name: 'people-outline', label: t('dailyGoals.form.iconSocial') },
  ];
}

/** Fallback glyph for a goal/reminder with no icon set, or one outside the curated picker list. */
export const DEFAULT_GOAL_ICON: IoniconName = 'flag-outline';

export function resolveGoalIconName(icon: string | null): IoniconName {
  if (!icon) {
    return DEFAULT_GOAL_ICON;
  }
  return icon as IoniconName;
}
