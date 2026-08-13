import { Ionicons } from '@expo/vector-icons';
import { forwardRef } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { Column, Row } from '@/components/layout';
import { Text } from '@/components/ui';
import { Weight } from '@/domain/Weight';
import { t } from '@/i18n';
import { color, radius, space } from '@/theme/tokens';

import { formatSessionDurationSeconds } from './formatSessionDuration';

export interface ShareableSummaryCardProps {
  title: string;
  localDate: string;
  durationSeconds: number;
  totalVolumeKg: number;
  totalSets: number;
  totalReps: number;
  estimatedKcal: number | null;
  exerciseCount: number;
  newPRCount: number;
  /** Fires on this card's own first (and every subsequent) layout pass - `WorkoutSummaryScreen` uses this, not a fixed timeout, to know when `captureRef` has real, laid-out content to snapshot (this phase's own "capture too early" edge case). */
  onLayout?: ((event: LayoutChangeEvent) => void) | undefined;
  testID?: string | undefined;
}

/**
 * The exact subtree `react-native-view-shot`'s `captureRef` captures
 * (`WorkoutSummaryScreen`'s share action) - Step 0 decision 2's "share as
 * image." Deliberately not the on-screen `WorkoutSummaryScreen` body itself:
 * a shared image needs to stand alone (no header chrome, no Done/Share
 * buttons, a fixed opaque background regardless of scroll position) and be
 * legible without the surrounding app context, so this is its own small,
 * self-contained layout rather than a capture of whatever the screen happens
 * to be showing. Off-screen by design (`WorkoutSummaryScreen` renders it
 * inside a zero-opacity, non-interactive wrapper) - it exists purely to be
 * captured, never to be looked at directly in the running app.
 */
export const ShareableSummaryCard = forwardRef<View, ShareableSummaryCardProps>(
  function ShareableSummaryCard(
    {
      title,
      localDate,
      durationSeconds,
      totalVolumeKg,
      totalSets,
      totalReps,
      estimatedKcal,
      exerciseCount,
      newPRCount,
      onLayout,
      testID,
    },
    ref,
  ) {
    const stats: { label: string; value: string }[] = [
      {
        label: t('workoutLogging.summary.durationLabel'),
        value: formatSessionDurationSeconds(durationSeconds),
      },
      { label: t('workoutLogging.summary.exercisesLabel'), value: String(exerciseCount) },
      { label: t('workoutLogging.summary.setsLabel'), value: String(totalSets) },
      { label: t('workoutLogging.summary.repsLabel'), value: String(totalReps) },
      {
        label: t('workoutLogging.summary.volumeLabel'),
        value: t('workoutLogging.summary.volumeValueTemplate', {
          value: Weight.fromKilograms(totalVolumeKg).toDisplayString('kg'),
        }),
      },
    ];
    if (estimatedKcal !== null) {
      stats.push({
        label: t('workoutLogging.summary.caloriesLabel'),
        value: t('workoutLogging.summary.caloriesValueTemplate', { value: estimatedKcal }),
      });
    }

    return (
      <View
        ref={ref}
        collapsable={false}
        onLayout={onLayout}
        testID={testID}
        style={{
          width: 360,
          backgroundColor: color.background,
          borderRadius: radius.xl,
          padding: space[6],
        }}
      >
        <Column gap={5}>
          <Column gap={1}>
            <Text variant="label" color="accent">
              {t('workoutLogging.summary.shareCardEyebrow')}
            </Text>
            <Text variant="title2" color="primary" numberOfLines={2}>
              {title}
            </Text>
            <Text variant="footnote" color="secondary">
              {localDate}
            </Text>
          </Column>

          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: space[4],
            }}
          >
            {stats.map((stat) => (
              <Column key={stat.label} gap={1} style={{ minWidth: 140 }}>
                <Text variant="label" color="secondary">
                  {stat.label}
                </Text>
                <Text variant="numericLarge" color="primary">
                  {stat.value}
                </Text>
              </Column>
            ))}
          </View>

          {newPRCount > 0 ? (
            <Row
              gap={2}
              align="center"
              style={{
                paddingHorizontal: space[3],
                paddingVertical: space[2],
                borderRadius: radius.full,
                backgroundColor: color.accentSubtle,
                alignSelf: 'flex-start',
              }}
            >
              <Ionicons name="trophy" size={16} color={color.accentText} />
              <Text variant="bodyMedium" color="accent">
                {t('records.badge.label', { count: newPRCount })}
              </Text>
            </Row>
          ) : null}

          <Text variant="caption" color="tertiary">
            {t('workoutLogging.summary.shareCardFooter')}
          </Text>
        </Column>
      </View>
    );
  },
);
