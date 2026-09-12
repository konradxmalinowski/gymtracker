import { View } from 'react-native';

import { Column, Row } from '@/components/layout';
import { EmptyState } from '@/components/feedback';
import { Card, Divider, Text } from '@/components/ui';
import type { RepMaxEntry } from '@/features/records';
import { t } from '@/i18n';
import { space } from '@/theme/tokens';

export interface RepMaxTableCardProps {
  entries: readonly RepMaxEntry[];
  testID?: string | undefined;
}

/**
 * Gravitus-inspired refresh: a 1-12 rep-max table, derived from the current
 * estimated 1RM (`ExerciseProgressionScreen`'s own current-PR read) via
 * `computeRepMaxTable` (`@/features/records` - the same `statistics -> records`
 * pure-domain-calculator edge `exerciseProgression`'s own `e1rm` metric
 * already established, ADR-0015). Presentational only, like every other card
 * in this directory - it never fetches, `entries` is already computed.
 *
 * Weight is shown in kg without a unit-setting conversion, matching this
 * screen's own chart labels/accessibility summaries (e.g.
 * `exerciseProgression.accessibilityLabelTemplate`'s hardcoded "kg") rather
 * than introducing a `units.weight`-aware read this card would be the only
 * place in `statistics` to have.
 */
export function RepMaxTableCard({ entries, testID }: RepMaxTableCardProps) {
  return (
    <Card variant="elevated" padding={4} testID={testID}>
      <Column gap={3}>
        <Text variant="title3" color="primary">
          {t('statistics.repMaxTable.title')}
        </Text>

        {entries.length === 0 ? (
          <EmptyState
            title={t('statistics.repMaxTable.emptyTitle')}
            message={t('statistics.repMaxTable.emptyMessage')}
            testID={testID ? `${testID}-empty` : undefined}
          />
        ) : (
          <Column>
            {entries.map((entry, index) => (
              <Column key={entry.reps}>
                {index > 0 ? <Divider /> : null}
                <View
                  accessible
                  accessibilityLabel={t('statistics.repMaxTable.rowAccessibilityLabelTemplate', {
                    reps: entry.reps,
                    weight: Math.round(entry.weightKg * 4) / 4,
                  })}
                >
                  <Row justify="space-between" align="center" style={{ paddingVertical: space[2] }}>
                    <Text variant="body" color="secondary">
                      {t('statistics.repMaxTable.repsLabelTemplate', { reps: entry.reps })}
                    </Text>
                    <Text variant="numeric" color="primary">
                      {t('statistics.repMaxTable.weightValueTemplate', {
                        value: Math.round(entry.weightKg * 4) / 4,
                      })}
                    </Text>
                  </Row>
                </View>
              </Column>
            ))}
          </Column>
        )}
      </Column>
    </Card>
  );
}
