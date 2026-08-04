# ADR-0012: Photos and avatars live in the document directory, referenced by relative name

- Status: accepted
- Date: 2026-08-04
- Accepted: 2026-08-04. The stakeholder confirmed excluding photo binaries from the JSON
  export. Nothing in this ADR remains open.

## Context

FR-24 requires progress photos with history, and FR-01 an optional avatar. Both are
binary files in an app whose entire persistence story is otherwise SQLite.

There is a specific, well-known, silent data-loss bug waiting here, and avoiding it is
the main reason this ADR exists.

## The bug being designed around

On iOS the application container directory is `.../Application/<UUID>/Documents/...`,
and **the UUID changes when the app is updated**. Any absolute `file://` URI persisted
today is a dangling path after the next App Store update. The failure is silent: the
row is still there, the image just never loads again, and the user's progress photos
from before the update are gone as far as they can tell.

Camera and image-picker APIs hand back exactly such absolute URIs, so persisting the
value they return is the natural, wrong thing to do.

## Options considered

**A. Store the picker's returned URI directly.** Rejected - the bug above.

**B. Store the image bytes as a `BLOB` in SQLite.** Keeps everything in one file, so
backup and export are trivially consistent. Rejected: multi-megabyte blobs bloat the
database file, defeat the page cache that the hot workout queries depend on, and make
every `SELECT *` a landmine. SQLite's own guidance puts the crossover around 100 KB;
photos are an order of magnitude past it.

**C. Copy the file into the app's document directory under a generated name, store only
the relative name in SQLite, and compose the absolute path at read time.** **Chosen.**

**D. Option C plus the media library (`expo-media-library`), storing photos in the user's
camera roll.** Photos would survive an uninstall and be visible in the gallery. Rejected
for v1: progress photos are the most private data the app holds, and putting them in the
shared camera roll (where they sync to iCloud Photos and appear in shared albums) is a
privacy regression the user did not ask for. It also requires a permission the app
otherwise does not need.

## Decision

```
FileSystem.documentDirectory
  ├── avatars/
  │     └── avatar-<uuidv7>.jpg
  └── progress-photos/
        ├── <uuidv7>.jpg          full image, long edge capped at 1600 px, JPEG q80
        └── <uuidv7>-thumb.jpg    240 px square cover crop, JPEG q70
```

- `progress_photo.file_name` and `progress_photo.thumb_name` store **file names only**.
  `user_profile.avatar_file_name` likewise.
- `services/files/FileStorage` is the only module that composes absolute paths. It
  exposes `resolve(bucket, fileName): string` and every read goes through it.
- Files live in `documentDirectory`, not `cacheDirectory`. The OS may evict the cache
  directory under storage pressure; user photos must not be evictable.

### Write ordering

The file is written first, verified to exist and have a non-zero size, and only then is
the database row committed. This ordering means the possible inconsistency is an orphan
file with no row - recoverable, invisible, cleaned up by a maintenance sweep - rather
than a row pointing at a file that does not exist, which is a broken UI.

Deletion is the reverse: the row is soft-deleted first, and the file is removed only by
`purge()`. A soft-deleted photo can therefore be restored by the undo toast, which would
be impossible if the file were deleted eagerly.

### Integrity maintenance

`ProgressPhotoRepository.verifyIntegrity()` lists the directory, compares it against
non-purged rows, and reports orphan files and dangling rows. It is exposed in the dev
diagnostics screen and runs automatically after any import. Dangling rows are marked so
the UI shows a "photo missing" placeholder rather than an infinite spinner.

### Thumbnails are mandatory, not an optimization

`PhotoGrid` renders thumbnails exclusively. Rendering a dozen 1600 px JPEGs in a scroll
view is a reliable way to run a mid-range Android device out of memory. The full image
is loaded only in the single-photo and compare views.

## Export

Photos are **excluded from the JSON export in v1** (decided). Two options were weighed:

- Base64-embedding them makes the export a genuine complete backup, at the cost of a
  file that is 33% larger than the photos themselves - realistically hundreds of
  megabytes - which then has to be held in memory as a JavaScript string during both
  export and import. That is an out-of-memory crash on a mid-range device, not a
  theoretical risk.
- Excluding them makes the JSON export small, fast and reliable, but means it is not a
  complete backup, which the export screen must say plainly.

Decided: exclude, state it explicitly in the UI ("Progress photos are not included in
this file"), and provide a separate "Share progress photos" action that hands the raw
files to the OS share sheet so the user can put them wherever they want.

Proper photo backup needs a streaming archive format (a real zip writer) rather than a
JSON string, and that is a well-scoped post-1.0 feature rather than something to bolt
onto the export path.

## Consequences

Positive:
- App updates cannot break photo references, which is the entire point.
- The database stays small and its page cache stays useful for the queries that matter.
- Photos never leave the device by default (ARCHITECTURE.md section 13).

Negative:
- Two storage systems must be kept consistent, and the consistency is maintained by
  convention plus a verification routine rather than by a transaction. The write ordering
  above makes the failure mode benign, but it is not atomic and cannot be.
- The JSON export is not a full backup, which is a real limitation the user must be told
  about rather than discovering after a reinstall.
- Uninstalling the app deletes every photo irrecoverably. This is true of all app data
  here (NFR-06) but is more painful for photos, so the export screen says so.
