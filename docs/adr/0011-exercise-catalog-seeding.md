# ADR-0011: Build-time catalog pipeline, bundled imagery, overlay files for Polish names and videos

- Status: accepted
- Date: 2026-08-04
- Accepted: 2026-08-04. The stakeholder chose full imagery bundling (option A below).
  Nothing in this ADR remains open.

## Context

The brief fixes the data source: the Free Exercise DB (`yuhonas/free-exercise-db`),
extended with optional Polish display names and curated YouTube technique links.

Verified upstream on 2026-08-04: Unlicense (public domain, so redistribution inside a
commercial app is unencumbered), 800+ exercises, each a JSON document with
`id, name, force, level, mechanic, equipment, primaryMuscles, secondaryMuscles,
instructions, category, images`. `force`, `mechanic` and `equipment` are nullable in
practice. Images are per-exercise JPEG files (roughly two per exercise, ~2,600 files
total, including about 25 duplicates).

Three questions follow: when does the data get into SQLite, where do the images live,
and how do Polish names and videos attach without forking the upstream dataset.

## Decision 1: normalize at build time, seed at first run

Options were (a) parse the raw upstream JSON at runtime on first launch, (b) ship a
pre-built SQLite file as an asset and copy it into place, (c) normalize upstream JSON
into an app-shaped JSON at build time and seed from that.

**(c) is chosen.** A `scripts/build-catalog.ts` step, run manually when the upstream
dataset is refreshed and committed to the repo, produces
`assets/data/exercises.catalog.json` with the app's own shape: slugs normalized,
nullable fields explicit, muscles mapped to the `muscle` lookup slugs, equipment mapped
to `equipment` slugs, a precomputed diacritic-folded `name_search`, and image references
rewritten to bundled asset keys.

Rejected (a): parsing 800 raw documents plus mapping on the device's first launch is
slow and puts data-cleaning logic in the shipped app, where it runs once and is never
exercised again.

Rejected (b): shipping a pre-built `.db` is the fastest first launch, but it makes the
migration story ugly - the bundled database has a schema version that must be reconciled
with the migration runner, and a user upgrading from v1 to v2 needs the *migration*
path, not the bundled file. It also makes the catalog and user data share a file's
history, which complicates the catalog-refresh path below.

**Seeding is idempotent and versioned.** `catalogSeeder` compares the bundled
`catalogVersion` against the `catalog.version` app setting and, when they differ,
upserts catalog rows by `catalog_slug` inside one transaction, then rebuilds the FTS
index. It touches only rows where `source = 'catalog'`.

**This is why `exercise_user_data` is a separate table** (ARCHITECTURE.md section 7.4).
Favorites, personal notes and per-exercise rest overrides live there, keyed by
`exercise_id`, so a catalog refresh in a future app release can rewrite every catalog
row without touching a single thing the user created. Merging them into one table would
mean either losing user data on refresh or writing a merge routine that gets it subtly
wrong.

Seeding runs behind the splash screen on first launch, target under 2 seconds for ~900
rows plus muscle joins plus FTS - achievable with a single transaction and prepared
statements, and asserted by a benchmark.

## Decision 2: images are bundled and downscaled

The options were genuinely balanced; the stakeholder decided in favor of A.

**A. Bundle every image, downscaled.** The build script fetches upstream images, resizes
to 512 px on the long edge, converts to WebP at quality 70, removes the known duplicate
sets, and writes them to `assets/exercises/`. Estimated 15-25 KB each, ~2,600 files, so
roughly **30-55 MB** added to the binary before store compression.
Pro: true offline (NFR-08), no network code path, no cache invalidation, no failure state.
Con: the largest single contributor to binary size (NFR-09 budget is 120 MB).

**B. Bundle one thumbnail per exercise (~8 KB each, ~7 MB), lazy-download the gallery
from `raw.githubusercontent.com` on first view, cache in the file system.**
Pro: small binary.
Con: breaks the offline promise for the exercise detail screen - and a gym basement with
no signal is the exact place a user opens it. Adds a network layer, a cache, a failure
UI and a "clear image cache" setting to an app that otherwise has none of those.

**Decision: option A, confirmed by the stakeholder.** Every thumbnail and every gallery
image for the ~1,600 exercise images is bundled, downscaled to 512 px WebP. There is no
network-dependent gallery loading path anywhere in the app, and none is to be added:
"everything works offline" is a product promise in the brief, not a nice-to-have, and a
40 MB fitness app is unremarkable on either store.

This is final for P2. If the size measured at P2 or P16 is uncomfortable, the escalation
order is: tighten WebP quality, then drop to one image per exercise (halves it). Lazy
downloading is off the table.

Fallback if imagery is dropped or missing for an exercise: the list row and detail
header render a generated placeholder derived from the primary muscle group's token
color plus the exercise initials. No broken image states.

## Decision 3: Polish names and videos are overlay files, not forks

```
assets/data/exercises.catalog.json    upstream-derived, regenerable, never hand-edited
assets/data/exercises.pl.json         { "<catalog_slug>": { "name": "...", "aliases": [...] } }
assets/data/exercises.videos.json     { "<catalog_slug>": [ { url, title, channel, language } ] }
```

The overlays are hand-curated and keyed by `catalog_slug`. The seeder applies them on
top of the catalog. Regenerating the catalog from a newer upstream release never
clobbers curation work, and a missing key is simply absent - the exercise shows its
English name and an empty video section, both of which are correct states rather than
error states.

Display convention per FR-04, implemented once in `formatExerciseName()`:
`"Bench Press (Wyciskanie sztangi leżąc)"` when `name_pl` exists, otherwise
`"Bench Press"`.

**Curation is content work and is explicitly scoped** (risk R-02): v1 targets Polish
names and 2-4 curated videos for roughly the 150 most-used exercises - the compound
lifts and their common variations. The app is fully functional at 0% coverage, so this
never blocks a release. Videos are stored as URLs only and opened in the system browser
or the YouTube app; nothing is embedded or downloaded, per the brief.

Each video row stores `channel` and `title` alongside the URL so that when a link
eventually rots, the entry is still identifiable and replaceable rather than being an
opaque dead ID.

## Consequences

Positive:
- The runtime app contains no data-cleaning code; it seeds a file that is already in its
  own shape.
- Catalog refreshes in future releases are safe by construction.
- Curation is additive, versionable and reviewable as plain JSON diffs.

Negative:
- `scripts/build-catalog.ts` is a build tool that must be kept working; it is not covered
  by the app's test suite and will bit-rot if the upstream schema changes. Mitigated by
  validating its output against a Zod schema in CI, so a broken regeneration fails the
  build rather than shipping bad data.
- Bundled imagery is the dominant term in binary size and cannot be reduced after
  release without a full app update.
- The three JSON files are large enough (several MB for the catalog) that they should be
  reviewed with `--stat` rather than inline in pull requests.
