# ADR-0013: JSON is the backup format, CSV is the interchange format

- Status: accepted
- Date: 2026-08-04
- Accepted: 2026-08-04. The stakeholder confirmed photo exclusion from backups and
  deferring third-party CSV import past v1. Nothing in this ADR remains open.

## Context

FR-25 requires CSV export, JSON export, CSV import and JSON import. The brief lists them
as four peers. They are not peers, and treating them as such produces either a CSV
importer that silently loses data or a JSON format contorted into rows.

With no cloud and no account, the export file is the **only** backup a user will ever
have (NFR-06). That raises the stakes: a lossy backup that the user believes is complete
is worse than no backup.

## Decision: two formats with two different jobs

| | JSON | CSV |
|---|------|-----|
| Purpose | Complete backup and restore | Spreadsheet analysis, moving data to another tool |
| Fidelity | Lossless (except progress photo binaries, ADR-0012) | Deliberately lossy and denormalized |
| Shape | Versioned envelope, one array per entity, ids preserved | One flat file, one row per set |
| Import | Full merge or replace, idempotent by id | Best-effort reconstruction of sessions |
| Marketed as | "Backup" | "Export for spreadsheets" |

The UI uses those words. The export screen does not offer "Export" with a format
dropdown; it offers "Create backup (JSON)" and "Export workout log (CSV)", because the
format choice is really a purpose choice.

## JSON format

```jsonc
{
  "format": "gymtracker.backup",
  "version": 1,
  "exportedAt": 1754323200000,
  "app": { "version": "1.0.0", "schemaVersion": 1 },
  "units": { "weight": "kg", "length": "cm" },   // always canonical; recorded for clarity
  "counts": { "sessions": 412, "sets": 11834, "exercises": 903 },
  "data": {
    "profile": { },
    "settings": [ ],
    "customExercises": [ ],        // source='custom' only; catalog rows are not exported
    "exerciseUserData": [ ],       // favorites, notes, per-exercise rest overrides
    "exerciseVideos": [ ],         // source='user' only
    "plans": [ { "days": [ { "exercises": [ ] } ] } ],
    "sessions": [ { "exercises": [ { "sets": [ ] } ] } ],
    "personalRecords": [ ],
    "bodyMetrics": [ ],
    "progressPhotos": [ ]          // metadata only; binaries excluded (ADR-0012)
  }
}
```

Design points:

- **Catalog exercises are not exported.** They ship with the binary and are identified
  by `catalog_slug`. Exporting 900 unchanged catalog rows would multiply the file size
  for zero information. References from sessions and plans carry both `exercise_id` and
  `catalog_slug`, and the importer resolves catalog references by slug against the local
  catalog, falling back to creating a custom exercise from the embedded name snapshot if
  the slug is unknown (which happens when restoring onto an older app version).
- **Nested rather than flat.** Sessions embed their exercises and sets. This makes the
  file readable, makes a partial file obviously partial, and matches the aggregate
  boundaries from ADR-0004 so import can transact per aggregate.
- **Ids are preserved.** That is what makes `merge` mode idempotent: importing the same
  file twice produces no duplicates. This is a direct payoff of the UUIDv7 decision in
  ADR-0002.
- **`version` is an envelope version, not the app version.** A `migrateExport(input)`
  chain upgrades v1 files to the current shape, exactly like database migrations, so old
  backups keep working.
- Every level is parsed with a Zod schema before a single row is written.

### Import modes

**Merge (default).** Rows are upserted by id. On conflict, the row with the newer
`updated_at` wins. Soft-deleted rows in the file soft-delete their local counterparts.
Nothing local is destroyed.

**Replace.** All user data is purged and replaced by the file's contents. Guarded by a
typed confirmation, and **the app automatically writes a JSON backup of the current
state to the cache directory first**, surfacing its path in the result screen. Import is
the only operation in the app that can destroy years of history; it gets a seatbelt.

Both modes run inside one transaction per entity batch, and any failure rolls the whole
import back. A failed import leaves the database byte-identical.

After any successful import: `PersonalRecordService.rebuildAll()` runs, session totals
are recomputed, the FTS index is rebuilt, `ProgressPhotoRepository.verifyIntegrity()`
runs, and the entire query cache is cleared. Derived data is never trusted from a file.

## CSV format

One file, one row per set, denormalized so it opens usefully in any spreadsheet:

```
date,time,session_id,session_title,plan,day,exercise,exercise_slug,exercise_id,
set_number,set_type,is_warmup,weight_kg,weight_lb,reps,rpe,duration_seconds,
distance_m,volume_kg,estimated_1rm_kg,is_pr,set_note,session_note
```

- `date` is `local_date`, so rows group by the day the user trained.
- Both `weight_kg` and `weight_lb` are emitted. Canonical values are metric (ADR-0009),
  but a user in an imperial gym opening a spreadsheet wants the pounds column present,
  not a formula.
- `volume_kg` and `estimated_1rm_kg` are computed per the ADR-0006 semantics table, so
  the CSV agrees with what the app shows.
- RFC 4180 quoting, `\r\n` line endings, UTF-8 **with BOM** - the BOM is what makes Excel
  open Polish exercise names correctly instead of as mojibake, and its absence is the
  single most common complaint about CSV exports.

What CSV loses, stated plainly in the export screen: plans, body measurements, progress
photos, settings, per-exercise notes, favorites, superset grouping and drop-set
parentage. It is a log, not a backup.

### CSV import

Accepts the app's own column layout. Rows are grouped into sessions by
`(date, session_id)` when `session_id` is present, or by `(date, session_title)` when it
is not. Exercises resolve by `exercise_slug`, then `exercise_id`, then exact name, then
diacritic-folded name; unresolved names become custom exercises. The import preview
screen shows exactly what will be created and which rows could not be resolved,
**before** anything is written.

**Third-party CSV (Strong, Hevy, FitNotes) is out of scope for v1** (decided). Each has its own
column layout, its own set-type vocabulary and its own unit conventions, and each needs
its own parser, its own fixtures and its own tests. Doing one badly is worse than not
doing it. This is a well-shaped post-1.0 feature: a `CsvDialect` interface plus one
implementation per source, sharing the existing import pipeline.

## Consequences

Positive:
- Users get a real, verifiable backup, which is the only safety net an offline app can
  offer.
- Idempotent merge means restoring onto a device that already has data is safe.
- The formats' names match what they do, so a user cannot mistake the CSV for a backup.

Negative:
- Two formats, two parsers, two sets of fixtures, and CSV's lossiness must be
  communicated in the UI rather than assumed obvious.
- Large exports are built in memory as a JavaScript string. At the section 7.11 worst
  case (78,000 sets) the JSON is roughly 30-40 MB, which is at the edge of comfortable on
  a low-memory Android device. Mitigation: the exporter streams entity batches to the
  file via `FileSystem` appends rather than building one string, and the benchmark suite
  includes an export of the large fixture.
- Progress photos are absent from backups (ADR-0012), which is a genuine gap. The
  stakeholder accepted it knowingly; the export screen must say so plainly rather than
  letting a user discover it after a reinstall. A streaming zip export that includes them
  is a post-1.0 backlog item.
