import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { Column } from '@/components/layout';
import { Button, Surface, Text, TextField } from '@/components/ui';
import { t } from '@/i18n';

export interface TypedConfirmationGateProps {
  /** The exact phrase the user must type - case-sensitive, matching the phrase shown in `instructionLabel`. */
  requiredPhrase: string;
  instructionLabel: string;
  confirmButtonLabel: string;
  onConfirm: () => void;
  disabled?: boolean | undefined;
  loading?: boolean | undefined;
  testID?: string | undefined;
}

/**
 * ADR-0013's "seatbelt" for replace-mode import: a `ConfirmDialog` tap is
 * one gesture, easy to fire by reflex on a "yes, do the destructive thing"
 * prompt a user has seen a hundred times for lower-stakes actions elsewhere
 * in this app (`PlanListScreen`'s delete-plan flow, `WorkoutHistoryDetailScreen`'s
 * delete-workout flow). Replace import purges every table in the schema
 * (`DataTransferRepository.purgeAllUserData`) - ADR-0013 explicitly asks for
 * something stricter: "guarded by a typed confirmation." This component is
 * that stricter gate, built as its own small piece (per this phase's own
 * brief) rather than stretched out of `ConfirmDialog`, which has no concept
 * of a required text match at all.
 *
 * Deliberately dumb: it owns only the typed-text state and a case-sensitive
 * equality check against `requiredPhrase`, matching `SetRow`'s own
 * "controlled input, no side effects until an explicit action" convention
 * rather than firing `onConfirm` automatically the instant the phrase
 * matches - the user still has to tap the (now-enabled) button, an
 * intentional second gesture on top of the typed one.
 */
export function TypedConfirmationGate({
  requiredPhrase,
  instructionLabel,
  confirmButtonLabel,
  onConfirm,
  disabled = false,
  loading = false,
  testID,
}: TypedConfirmationGateProps) {
  const [typedValue, setTypedValue] = useState('');
  const isPhraseMatched = typedValue === requiredPhrase;

  // Mirrors `TextField`'s own error-announcement pattern (its doc comment:
  // VoiceOver never hears a purely visual state change on its own) - here
  // for the *positive* transition, since there's no error message for the
  // field itself to announce once the phrase matches.
  useEffect(() => {
    if (isPhraseMatched) {
      AccessibilityInfo.announceForAccessibility(
        t('dataTransfer.import.replaceConfirmPhraseMatchedAnnouncement'),
      );
    }
  }, [isPhraseMatched]);

  return (
    <Surface level={1} radius="lg" padding={4}>
      <Column gap={3}>
        <Text variant="body" color="primary">
          {instructionLabel}
        </Text>
        <TextField
          label={t('dataTransfer.import.replaceConfirmFieldLabel')}
          value={typedValue}
          onChangeText={setTypedValue}
          placeholder={requiredPhrase}
          disabled={disabled || loading}
          testID={testID ? `${testID}-field` : undefined}
        />
        <Button
          variant="destructive"
          label={confirmButtonLabel}
          onPress={onConfirm}
          disabled={disabled || !isPhraseMatched}
          loading={loading}
          fullWidth
          testID={testID ? `${testID}-button` : undefined}
        />
        <Text variant="footnote" color="tertiary">
          {t('dataTransfer.import.replaceConfirmHint', { phrase: requiredPhrase })}
        </Text>
      </Column>
    </Surface>
  );
}
