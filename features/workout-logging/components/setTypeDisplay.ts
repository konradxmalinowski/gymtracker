import { SET_TYPES, type SetType } from '@/features/workout-logging';
import { t } from '@/i18n';
import { color } from '@/theme/tokens';

/** Every non-`drop` type - `drop` is never offered on the picker itself; a drop segment is created via "Add drop set" on its parent, not by picking a type. */
export const PICKABLE_SET_TYPES: readonly SetType[] = SET_TYPES.filter((type) => type !== 'drop');

const LABEL_KEY: Record<SetType, Parameters<typeof t>[0]> = {
  warmup: 'workoutLogging.set.typeWarmup',
  normal: 'workoutLogging.set.typeNormal',
  drop: 'workoutLogging.set.typeDrop',
  failure: 'workoutLogging.set.typeFailure',
  assisted: 'workoutLogging.set.typeAssisted',
  partial: 'workoutLogging.set.typePartial',
};

const BADGE_COLOR: Record<SetType, string> = {
  warmup: color.setWarmup,
  normal: color.setNormal,
  drop: color.setDrop,
  failure: color.setFailure,
  assisted: color.setAssisted,
  partial: color.setPartial,
};

export function setTypeLabel(type: SetType): string {
  return t(LABEL_KEY[type]);
}

export function setTypeBadgeColor(type: SetType): string {
  return BADGE_COLOR[type];
}
