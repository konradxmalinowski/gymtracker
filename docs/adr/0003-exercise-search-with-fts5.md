# ADR-0003: Exercise search via SQLite FTS5 with diacritic folding

- Status: accepted
- Date: 2026-08-04

## Context

FR-06 requires instant search across ~900 catalog exercises plus user-created ones, by
name, muscle, equipment and body part, with favorites surfaced first. FR-04 adds Polish
names, which brings diacritics: a user typing `lezac` or `sztanga` on a hurried
one-handed keyboard must match `leżąc` and `sztangą`.

NFR-03 sets the budget at under 50 ms.

## Options considered

**A. Load all exercises into memory once and filter in JavaScript.**
Roughly 900 objects with muscle arrays is maybe 1.5 MB of JS heap. Filtering is
sub-millisecond. Genuinely the fastest option and the simplest to write. Rejected for
two reasons: custom exercises and favorite changes require cache invalidation logic
that reimplements what the database already does, and diacritic folding plus relevance
ranking has to be hand-written and then maintained. It also does not degrade gracefully
if the catalog is ever expanded.

**B. `LIKE '%query%'` over a normalized `name_search` column.**
Simple, no extra table. A leading wildcard cannot use an index, so it is a full scan -
at 900 rows still under 5 ms, so performance is not the objection. The objections are
that it cannot rank results (an exact prefix match should beat a mid-word match), and
that combining it with muscle and equipment filters produces increasingly awkward SQL.

**C. FTS5 virtual table with `unicode61 remove_diacritics 2`.**
Built into the SQLite that ships with `expo-sqlite`, so no dependency. Gives prefix
matching (`bench*`), BM25 relevance ranking, diacritic folding for free, and composes
with normal `WHERE` clauses through a join on `rowid`.

**D. A dedicated search library (Fuse.js, MiniSearch) in JS.**
Adds fuzzy matching and typo tolerance. Rejected: another dependency, another index to
keep in sync, and fuzzy matching on exercise names produces confusing results ("Bench
Press" matching "French Press" is worse than no match).

## Decision

**Option C.** A contentless FTS5 table:

```sql
CREATE VIRTUAL TABLE exercise_fts USING fts5(
    name_en, name_pl, aliases, equipment_slug, muscles,
    content = '',
    tokenize = "unicode61 remove_diacritics 2"
);
```

Maintained by `ExerciseRepository` inside the same transaction as any write to
`exercise` or `exercise_muscle`, and rebuilt wholesale by the catalog seeder.

Search executes as: FTS5 match to get candidate rowids and BM25 rank, joined to
`exercise` and `exercise_user_data` for filtering and favorites-first ordering, with
`ORDER BY is_favorite DESC, rank, name_en`. An empty query skips FTS entirely and runs
a plain filtered list.

## Why triggers are not used to maintain the index

The obvious implementation is `AFTER INSERT/UPDATE/DELETE` triggers on `exercise`. That
fails for the `muscles` column, which is derived from `exercise_muscle` - a row trigger
on `exercise` cannot see muscle rows that have not been inserted yet, and a trigger on
`exercise_muscle` would have to re-read and rewrite the whole FTS row on every muscle
insert. Maintaining the index explicitly in the repository, once per aggregate write,
is both correct and cheaper. It is also visible in TypeScript, where a trigger is
invisible until it misbehaves.

## Consequences

Positive:
- Diacritic-insensitive Polish search works with zero custom code, which is what makes
  FR-04 actually usable rather than decorative.
- Ranking is real (BM25), so "bench" puts "Bench Press" above "Dumbbell Bench Fly".
- No JS-side cache to invalidate; favorites and custom exercises are searchable the
  instant they are written.

Negative:
- The FTS index is a second thing that can drift out of sync with `exercise`. Mitigated
  by writing it only through the repository, by a `rebuildSearchIndex()` maintenance
  operation, and by a repository test asserting index consistency after every mutation
  path.
- Contentless FTS5 tables cannot return column values, only rowids - so every search is
  a join. Acceptable and explicit.
- `remove_diacritics 2` requires SQLite 3.27+; every Expo SDK 50+ runtime is well past
  that, and the version is asserted in the dev diagnostics screen.

## Revisit if

The catalog grows past ~10,000 exercises, or the search needs typo tolerance. At that
point option D becomes worth reconsidering, layered on top of FTS5 rather than
replacing it.
