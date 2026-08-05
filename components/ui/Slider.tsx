import RNSlider from '@react-native-community/slider';

import { color } from '@/theme/tokens';

export interface SliderProps {
  value: number;
  onValueChange: (value: number) => void;
  minimumValue?: number | undefined;
  maximumValue?: number | undefined;
  step?: number | undefined;
  disabled?: boolean | undefined;
  accessibilityLabel: string;
  testID?: string | undefined;
}

/**
 * Thin token-styled wrapper over `@react-native-community/slider` -
 * RN core dropped its built-in `Slider` and this is the standard
 * replacement. It comes with adjustable-role accessibility (VoiceOver/
 * TalkBack increment/decrement) for free, which a hand-rolled
 * gesture-handler slider would have to reimplement.
 */
export function Slider({
  value,
  onValueChange,
  minimumValue = 0,
  maximumValue = 1,
  step,
  disabled = false,
  accessibilityLabel,
  testID,
}: SliderProps) {
  return (
    <RNSlider
      value={value}
      onValueChange={onValueChange}
      minimumValue={minimumValue}
      maximumValue={maximumValue}
      // Spread rather than `step={step}` - the third-party prop type
      // declares `step?: number` without `| undefined`, so passing the
      // literal `undefined` through explicitly (as opposed to the key being
      // entirely absent) fails under this project's `exactOptionalPropertyTypes`.
      {...(step !== undefined ? { step } : null)}
      disabled={disabled}
      minimumTrackTintColor={color.accent}
      maximumTrackTintColor={color.surfaceElevated}
      thumbTintColor={disabled ? color.textDisabled : color.accent}
      // `@react-native-community/slider`'s native component doesn't supply
      // an accessibility role itself outside its web fallback (confirmed by
      // inspecting the rendered tree) - unlike Switch/Checkbox, which each
      // set one explicitly, this has to be added here (accessibility audit,
      // reports/accessibility-2026-08-05-p1.md, Slider.test.tsx). It also
      // doesn't set `accessible` itself, same gap as SegmentedControl's
      // container and DraggableList's handle - without it, neither RNTL nor
      // a real screen reader treats this node as a focusable accessibility
      // element at all, role and label included.
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      {...(testID !== undefined ? { testID } : null)}
    />
  );
}
