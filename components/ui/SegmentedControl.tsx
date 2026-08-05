import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { haptics } from '@/services/haptics';
import { color, hitSlop, motion, radius, space } from '@/theme/tokens';

import { Text } from './Text';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  testID?: string | undefined;
}

/**
 * A single-selection tab strip. Selection is announced via
 * `accessibilityRole="tab"` + `accessibilityState.selected` on each segment
 * (a `radiogroup`/`radio` pairing would also be defensible; `tablist`/`tab`
 * matches how VoiceOver/TalkBack users already expect this exact visual
 * pattern - a row of mutually-exclusive, always-visible options - to behave).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  testID,
}: SegmentedControlProps<T>) {
  return (
    <View
      accessibilityRole="tablist"
      // A plain `View` defaults `accessible` to `false`, so without this the
      // `tablist` role above is invisible to both RNTL and real screen
      // readers (TalkBack/VoiceOver) - they skip any host element that
      // isn't itself opted in via `accessible` (accessibility audit,
      // reports/accessibility-2026-08-05-p1.md; SegmentedControl.test.tsx).
      // The individual `tab`-role segments are unaffected - `Pressable`
      // defaults `accessible` to `true` on its own.
      accessible
      style={{
        flexDirection: 'row',
        backgroundColor: color.surface,
        borderRadius: radius.md,
        padding: space['0.5'],
      }}
      testID={testID}
    >
      {options.map((option) => (
        <Segment
          key={option.value}
          option={option}
          selected={option.value === value}
          onSelect={() => {
            if (option.value !== value) {
              haptics.select();
              onChange(option.value);
            }
          }}
        />
      ))}
    </View>
  );
}

function Segment<T extends string>({
  option,
  selected,
  onSelect,
}: {
  option: SegmentedControlOption<T>;
  selected: boolean;
  onSelect: () => void;
}) {
  const highlight = useSharedValue(selected ? 1 : 0);
  highlight.value = withTiming(selected ? 1 : 0, { duration: motion.duration.fast });

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: highlight.value > 0.5 ? color.surfaceElevated : 'transparent',
  }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={option.label}
      accessibilityState={{ selected }}
      onPress={onSelect}
      // The segment's own visual height (paddingVertical[2]*2 + callout line
      // height) is ~36pt, short of the 44pt minimum - hitSlop makes up the
      // difference the same way IconButton's `sm` size does (accessibility
      // audit, reports/accessibility-2026-08-05-p1.md, A11Y-003).
      hitSlop={hitSlop.small}
      style={{ flex: 1 }}
    >
      <Animated.View
        style={[
          {
            paddingVertical: space[2],
            alignItems: 'center',
            borderRadius: radius.sm,
          },
          animatedStyle,
        ]}
      >
        <Text variant="callout" color={selected ? 'primary' : 'secondary'} numberOfLines={1}>
          {option.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}
