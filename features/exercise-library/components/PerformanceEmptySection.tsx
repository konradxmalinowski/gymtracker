import type { ReactNode } from 'react';

import { Section, Surface } from '@/components/ui';
import { EmptyState } from '@/components/feedback';

export interface PerformanceEmptySectionProps {
  /** The `SectionHeader` label (e.g. "Personal records"). */
  sectionTitle: string;
  /** `EmptyState`'s own title - deliberately specific ("No records yet"), never the component's generic default fallback ("Nothing here yet"), per this phase's own acceptance criterion. */
  emptyTitle: string;
  message: string;
  icon: ReactNode;
  testID?: string | undefined;
}

/**
 * The three detail-screen performance sections (previous performance, personal
 * records, progress chart) render this in every real build until P8 fills them
 * with actual history - a genuinely finished empty state per ROADMAP.md P4's
 * acceptance criterion, not a placeholder that happens to render nothing. Each
 * caller supplies its own icon/title/message so the three sections read as
 * distinct reasons ("no sessions logged yet" vs "no PR yet"), not one generic
 * "nothing here" repeated three times.
 */
export function PerformanceEmptySection({
  sectionTitle,
  emptyTitle,
  message,
  icon,
  testID,
}: PerformanceEmptySectionProps) {
  return (
    <Section title={sectionTitle}>
      <Surface level={1} radius="lg">
        <EmptyState illustration={icon} title={emptyTitle} message={message} testID={testID} />
      </Surface>
    </Section>
  );
}
