import { t } from '@/i18n';

import { Toast, type ToastProps } from './Toast';

export type UndoToastProps = ToastProps;

/**
 * Same API surface as `Toast` (ARCHITECTURE.md section 11.7 lists them
 * together) - this is a semantic preset, not a different component: it
 * defaults `actionLabel` to "Undo" so call sites for the app's most common
 * toast pattern (delete-with-undo) don't repeat that string themselves.
 */
export function UndoToast({ actionLabel, ...rest }: UndoToastProps) {
  return <Toast actionLabel={actionLabel ?? t('common.undo')} {...rest} />;
}
