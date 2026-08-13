/**
 * Pure client-side month grouping for `WorkoutHistoryListScreen`'s FlashList
 * data array - no existing month-grouped-FlashList precedent in this
 * codebase to copy (`plans/2026-08-13-p9-workout-summary-history.md`'s own
 * note), so this is a small, independently testable calculator rather than
 * inline logic in the screen: given the already-paginated, already-ordered
 * (`most recently started first`) `SessionListItem[]` a page of
 * `listHistory` returns, produce one flat array mixing header and row
 * entries FlashList can render with `getItemType` distinguishing the two -
 * grouping happens over the *whole* flattened, multi-page list each time
 * (not per page), so a month boundary that happens to fall on a page
 * boundary still gets exactly one header, not two.
 */
import type { SessionListItem } from '../repository/WorkoutSessionRepository';

export interface HistoryHeaderEntry {
  type: 'header';
  key: string;
  label: string;
}

export interface HistoryRowEntry {
  type: 'row';
  key: string;
  session: SessionListItem;
}

export type HistoryListEntry = HistoryHeaderEntry | HistoryRowEntry;

/** `YYYY-MM` slice of `local_date` - stable, locale-independent grouping key. */
function monthKeyOf(localDate: string): string {
  return localDate.slice(0, 7);
}

/** `en-US` "August 2026" - a coarser sibling of `personalRecordFormatting.ts`'s `formatAchievedDate`, which formats a single day rather than a month. */
function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) {
    return monthKey;
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function groupSessionHistoryByMonth(
  sessions: readonly SessionListItem[],
): HistoryListEntry[] {
  const entries: HistoryListEntry[] = [];
  let currentMonthKey: string | null = null;

  for (const session of sessions) {
    const monthKey = monthKeyOf(session.localDate);
    if (monthKey !== currentMonthKey) {
      entries.push({
        type: 'header',
        key: `header-${monthKey}`,
        label: formatMonthLabel(monthKey),
      });
      currentMonthKey = monthKey;
    }
    entries.push({ type: 'row', key: session.id, session });
  }

  return entries;
}
