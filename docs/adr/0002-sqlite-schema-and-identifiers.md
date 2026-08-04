# ADR-0002: UUIDv7 text keys, epoch-millisecond timestamps, canonical units, soft delete

- Status: accepted
- Date: 2026-08-04

## Context

Four schema-wide conventions have to be decided once, before the first table is
written, because changing any of them later is a migration across every table and a
rewrite of every repository. The brief mandates "prepare repository interfaces for
future synchronization" but forbids implementing sync, which constrains the identifier
choice specifically.

## Decision 1: primary keys are `TEXT` UUIDv7, generated on the client

### Options

**A. `INTEGER PRIMARY KEY AUTOINCREMENT`.** Smallest, fastest, aliases `rowid`, best
join and index performance. Fatal for sync: two devices both mint id 4,731 for
different sessions, so a merge requires an id-remapping table and rewriting every
foreign key at sync time. That is precisely the "rewrite" the brief says to avoid.

**B. `INTEGER` surrogate key plus a separate `uuid TEXT UNIQUE` column.** Best of both
on paper. In practice the app then has two identities per row, and every DTO, every
export file and every navigation param has to pick one. Mistakes are silent. Rejected
for the added cognitive cost, not for performance.

**C. `TEXT` UUIDv4.** Globally unique, but random, so index inserts scatter across the
B-tree and the index fragments as history grows.

**D. `TEXT` UUIDv7.** Globally unique, time-ordered in its high bits, so inserts stay
append-mostly and `ORDER BY id` approximates creation order. 36 characters.

### Decision

**Option D.** UUIDv7 as `TEXT` primary keys on every table except the lookup tables
(`muscle`, `equipment`, which use natural slug keys) and `app_setting` (natural key).

### Cost, stated plainly

A UUIDv7 text key costs roughly 32 extra bytes per row versus an integer, plus the same
again in every index that includes it. At the section 7.11 storage estimate (78,000
sets after ten years) that is single-digit megabytes. Query performance on indexed
lookups is unaffected in practice at this scale. The trade is worth it because it is
the one decision that cannot be retrofitted cheaply.

## Decision 2: timestamps are `INTEGER` epoch milliseconds, UTC, plus a `local_date` string

Options were ISO-8601 strings (readable, sortable, but 24 bytes and string comparison
on every range query), SQLite `julianday` reals (compact, awkward), and epoch integers.

**Epoch milliseconds in `INTEGER`** wins on size and on range-query speed, and maps
directly to JavaScript's `Date.now()` with no parsing.

The important part is the companion column. Every row a user thinks of as belonging to
a calendar day (`workout_session`, `body_metric_entry`, `progress_photo`) also stores
`local_date TEXT` as `YYYY-MM-DD`, computed in the user's timezone at write time and
never recomputed. Streaks, the calendar and "this week's volume" query `local_date`
exclusively.

Without it, a workout finished at 22:30 local time in UTC+2 is stored at 20:30 UTC,
and a naive `date(started_at/1000,'unixepoch')` puts it on the correct day - until the
user travels, or DST shifts, at which point historical days start moving. Freezing the
local date at write time makes history immutable, which is what users expect from a
training log.

`tz_offset_minutes` is stored alongside so a future feature can still reconstruct the
absolute local time.

## Decision 3: weights are canonical kilograms, lengths canonical centimetres

All persisted numeric measurements are metric. `lb` and `in` exist only in the
presentation layer, converted by the `Weight` and `Length` value objects.

Rejected alternative: storing the value in the unit the user entered plus a `unit`
column. That makes every aggregate query (`SUM(weight_kg * reps)`) wrong unless it
joins a conversion, and makes a user who switches units mid-history see a broken chart.
Storing canonically means switching units is a display toggle with zero data impact.

Consequence: a user entering `225 lb` stores `102.05829 kg`, and displaying it back
rounds to `225.0 lb`. Round-trip stability is guaranteed by rounding display values to
the increment granularity (0.5 lb / 0.25 kg) and is covered by property-based tests.

## Decision 4: soft delete by default, hard delete only via explicit `purge`

Every user-owned table has `deleted_at INTEGER NULL`. Reads filter
`deleted_at IS NULL`; partial indexes carry the same predicate so they stay free of
tombstones.

This is justified independently of sync by two v1 requirements: FR-20's swipe-to-delete
needs an undo affordance (the brief also says to avoid confirmation dialogs, which
makes undo mandatory rather than optional), and deleting an exercise must not vaporize
years of history that reference it.

Cost: every query carries an extra predicate, and the database never shrinks on its own.
Mitigation: `purge()` exists as an explicit repository operation, Settings offers
"Permanently remove deleted items", and `replace`-mode import purges as part of its
transaction.

## Consequences overall

- The schema is sync-ready without a line of sync code (see ADR-0004).
- Repository base classes must generate ids, stamp `created_at`/`updated_at`, compute
  `local_date`, and apply the soft-delete predicate. Callers must never do any of these,
  which is enforced by keeping those columns out of the `TCreate`/`TUpdate` types.
- Export files carry the same ids, which makes `merge`-mode import idempotent.
