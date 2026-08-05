export { Text } from './Text';
export type { TextProps, TextVariant, TextColor } from './Text';
export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';
export { IconButton } from './IconButton';
export type { IconButtonProps, IconButtonSize, IconButtonVariant } from './IconButton';
export { Chip } from './Chip';
export type { ChipProps, ChipSize } from './Chip';
export { SegmentedControl } from './SegmentedControl';
export type { SegmentedControlProps, SegmentedControlOption } from './SegmentedControl';
export { Card } from './Card';
export type { CardProps, CardVariant } from './Card';
export { Surface } from './Surface';
export type { SurfaceProps, SurfaceLevel } from './Surface';
export { ListRow } from './ListRow';
export type { ListRowProps } from './ListRow';
export { TextField } from './TextField';
export type { TextFieldProps } from './TextField';
export { NumberField } from './NumberField';
export type { NumberFieldProps } from './NumberField';
export { StepperField } from './StepperField';
export type { StepperFieldProps } from './StepperField';
export { Switch } from './Switch';
export type { SwitchProps } from './Switch';
export { Slider } from './Slider';
export type { SliderProps } from './Slider';
export { Checkbox } from './Checkbox';
export type { CheckboxProps } from './Checkbox';
export { Avatar } from './Avatar';
export type { AvatarProps, AvatarSize } from './Avatar';
export { Badge } from './Badge';
export type { BadgeTone, BadgeSize } from './Badge';
export { StatTile } from './StatTile';
export type { StatTileProps, StatTileTrend } from './StatTile';
export { ProgressRing } from './ProgressRing';
export type { ProgressRingProps } from './ProgressRing';
export { Divider } from './Divider';
export type { DividerProps } from './Divider';
export { Spacer } from './Spacer';
export type { SpacerProps } from './Spacer';
export { Section } from './Section';
export type { SectionProps } from './Section';
export { SectionHeader } from './SectionHeader';
export type { SectionHeaderProps } from './SectionHeader';

// EmptyState, ErrorState, Skeleton, Toast, UndoToast, BottomSheet and
// ConfirmDialog are listed in both the `ui` and `feedback` tables in
// ARCHITECTURE.md section 11.7. They are implemented once, in
// components/feedback (the more specific location - they're all reactions
// to data/async state, not bare visual primitives), and re-exported here so
// `@/components/ui` stays a complete single import surface for the whole
// primitive inventory.
export {
  EmptyState,
  ErrorState,
  Skeleton,
  Toast,
  UndoToast,
  ConfirmDialog,
  BottomSheet,
} from '@/components/feedback';
export type {
  EmptyStateProps,
  ErrorStateProps,
  SkeletonProps,
  ToastProps,
  UndoToastProps,
  ConfirmDialogProps,
  BottomSheetProps,
} from '@/components/feedback';
