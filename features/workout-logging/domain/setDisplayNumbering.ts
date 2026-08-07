/**
 * ADR-0006's display and counting rules for drop sets, as a pure function:
 *
 * > Drop segments render indented under their parent, sharing the parent's set
 * > number. `set_index` is not incremented for drop segments; the "sets
 * > completed" counter counts parents only.
 *
 * The ADR also notes the consequence - "`set_index` no longer equals 'position
 * in the list' once drop sets exist, so display numbering is computed rather
 * than read. Handled once, in the set-list view model." This is that one place.
 * It lives in the domain layer rather than in whichever component renders a set
 * row so the workout screen, a history detail screen and an export all number
 * the same list identically.
 */

export interface NumberableSet {
  id: string;
  /** `workout_set.set_index` - 1-based within a `session_exercise`, shared by a parent and all of its drop segments. */
  setIndex: number;
  /** `workout_set.parent_set_id` - non-null exactly for drop segments. */
  parentSetId: string | null;
}

export interface SetDisplayNumber {
  /** The number shown to the user. A drop segment repeats its parent's number. */
  displayNumber: number;
  isDropSegment: boolean;
  /** 1-based position within its parent's drop chain (`1` = first drop), `null` for a parent set. */
  dropOrdinal: number | null;
  /** `"3"` for a parent, `"3.1"` / `"3.2"` for its drop segments - the drop chain rendered as a decimal so it sorts and reads correctly. */
  label: string;
}

/**
 * Numbers a single `session_exercise`'s sets. Parents are numbered `1..n` in
 * the order given (their `set_index` is not trusted as the display number:
 * deleting set 2 of 3 leaves indices `1, 3`, and the user should still see
 * `1, 2`). Drop segments take their parent's display number and are ordered
 * within the chain by their position in the input.
 *
 * A drop segment whose parent is not in the input (its parent was soft-deleted
 * and filtered out, say) is numbered as if it were a parent, so it can never
 * render unnumbered.
 */
export function assignSetDisplayNumbers(
  sets: readonly NumberableSet[],
): Map<string, SetDisplayNumber> {
  const result = new Map<string, SetDisplayNumber>();
  const parentNumbers = new Map<string, number>();
  const dropCounts = new Map<string, number>();
  let nextNumber = 1;

  for (const set of sets) {
    if (set.parentSetId === null) {
      const displayNumber = nextNumber;
      nextNumber += 1;
      parentNumbers.set(set.id, displayNumber);
      result.set(set.id, {
        displayNumber,
        isDropSegment: false,
        dropOrdinal: null,
        label: String(displayNumber),
      });
    }
  }

  for (const set of sets) {
    if (set.parentSetId === null) {
      continue;
    }
    const parentNumber = parentNumbers.get(set.parentSetId);
    if (parentNumber === undefined) {
      const displayNumber = nextNumber;
      nextNumber += 1;
      result.set(set.id, {
        displayNumber,
        isDropSegment: true,
        dropOrdinal: null,
        label: String(displayNumber),
      });
      continue;
    }
    const dropOrdinal = (dropCounts.get(set.parentSetId) ?? 0) + 1;
    dropCounts.set(set.parentSetId, dropOrdinal);
    result.set(set.id, {
      displayNumber: parentNumber,
      isDropSegment: true,
      dropOrdinal,
      label: `${parentNumber}.${dropOrdinal}`,
    });
  }

  return result;
}

/**
 * The same list, reordered for rendering: every parent immediately followed by
 * its own drop segments, in chain order. The repository returns sets ordered by
 * `set_index` then creation, which already produces this order for normally
 * built data - this function makes it true by construction for any input.
 */
export function orderSetsForDisplay<T extends NumberableSet>(sets: readonly T[]): T[] {
  const dropsByParent = new Map<string, T[]>();
  const orphans: T[] = [];

  for (const set of sets) {
    if (set.parentSetId === null) {
      continue;
    }
    const existing = dropsByParent.get(set.parentSetId);
    if (existing) {
      existing.push(set);
    } else {
      dropsByParent.set(set.parentSetId, [set]);
    }
  }

  const parentIds = new Set(sets.filter((set) => set.parentSetId === null).map((set) => set.id));
  for (const set of sets) {
    if (set.parentSetId !== null && !parentIds.has(set.parentSetId)) {
      orphans.push(set);
    }
  }

  const ordered: T[] = [];
  for (const set of sets) {
    if (set.parentSetId !== null) {
      continue;
    }
    ordered.push(set);
    ordered.push(...(dropsByParent.get(set.id) ?? []));
  }
  ordered.push(...orphans);
  return ordered;
}
