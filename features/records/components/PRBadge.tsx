import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef } from 'react';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { t } from '@/i18n';
import { haptics } from '@/services/haptics';
import { color, motion, radius, space } from '@/theme/tokens';

import type { PersonalRecord } from '../repository/PersonalRecordRepository';

export interface PRBadgeProps {
  records: readonly PersonalRecord[];
  testID?: string | undefined;
}

/**
 * Presentational only - `records` receives already-evaluated data, it never
 * fetches. Renders nothing when `records` is empty: a clean absence (P4's
 * `PerformanceEmptySection` "genuinely empty, not a stub" precedent applied
 * here too), not a hidden/zero-height placeholder.
 *
 * `haptics.personalRecord()` (declared when haptics was built, never invoked
 * anywhere in the codebase since) fires here for the first time, exactly once
 * per distinct non-empty `records` value this component receives - keyed on
 * the records' own ids so a parent re-render that passes the *same* PRs back
 * (e.g. an unrelated state update one level up) never re-fires it, while a
 * genuinely new completion that beats a different set of records does. A
 * `useEffect` is the right tool here (not a render-time call): firing haptics
 * is a side effect, not a state derivation, so this isn't the "you might not
 * need an effect" case `UnitsSettingsScreen.tsx` avoids - that one derives
 * local state from a prop, this one calls an imperative API in response to a
 * prop change.
 */
export function PRBadge({ records, testID }: PRBadgeProps) {
  const firedForKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (records.length === 0) {
      return;
    }
    const key = records.map((record) => record.id).join(',');
    if (firedForKeyRef.current === key) {
      return;
    }
    firedForKeyRef.current = key;
    haptics.personalRecord();
  }, [records]);

  if (records.length === 0) {
    return null;
  }

  return (
    <Animated.View
      // A celebratory pop for a personal record, not a routine content swap -
      // `ZoomIn`'s spring matches `motion.spring.snappy` (the same feel
      // `PressScale`'s own press-in uses) rather than the plain fades used
      // elsewhere for routine appearance/disappearance.
      entering={ZoomIn.springify()
        .damping(motion.spring.snappy.damping)
        .stiffness(motion.spring.snappy.stiffness)
        .mass(motion.spring.snappy.mass)}
      accessible
      accessibilityRole="text"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[1],
        minHeight: 24,
        paddingHorizontal: space[2],
        borderRadius: radius.full,
        backgroundColor: color.achievementSubtle,
        alignSelf: 'flex-start',
      }}
      testID={testID}
    >
      <Ionicons name="trophy" size={14} color={color.achievement} />
      <Text variant="caption" color="achievement" numberOfLines={1}>
        {t('records.badge.label', { count: records.length })}
      </Text>
    </Animated.View>
  );
}
