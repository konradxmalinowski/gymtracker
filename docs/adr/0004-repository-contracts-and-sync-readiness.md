# ADR-0004: Repository contracts that make sync additive, without building sync

- Status: accepted
- Date: 2026-08-04

## Context

The brief is precise and slightly contradictory on purpose: "Prepare repository
interfaces for future synchronization. Do NOT implement a backend." It also says
"never create placeholder code" and "never leave TODOs".

Those two rules together rule out the usual approach of stubbing a `SyncService`, a
`change_log` table and a `findChangedSince()` method that nothing calls. Untested code
that no caller exercises is exactly the placeholder the brief forbids, and it rots.

So the question is: what can be built now that is *independently justified today* and
also happens to be everything a sync layer would need later?

## Options considered

**A. Build the sync scaffolding now (outbox table, `SyncableRepository` decorator,
`server_id` columns, tombstone propagation, conflict resolution hooks).**
Rejected. Dead code, untestable without a server, and the design would almost certainly
be wrong because it would be written without a real protocol to satisfy.

**B. Ignore sync entirely; deal with it if it ever happens.**
Rejected on one specific ground: integer autoincrement primary keys. Everything else in
a sync retrofit is additive, but changing every primary key and every foreign key in a
shipped app, on users' devices, with their only copy of their data, is the definition of
a rewrite.

**C. Build only the invariants that are independently justified today, and design the
interfaces so a sync decorator can wrap them.** **Chosen.**

## Decision

Adopt option C. Concretely, v1 guarantees these seven properties, each with a reason
that stands on its own merits **today**:

| Property | Independent justification today | What sync would have needed |
|----------|--------------------------------|------------------------------|
| Client-generated UUIDv7 primary keys | Export/import idempotency: a re-imported backup must not duplicate rows (ADR-0002, ADR-0013) | Merge without id remapping |
| `updated_at` written by the repository base on every mutation | `merge`-mode import conflict resolution (last write wins); cache staleness | Change detection |
| `deleted_at` soft delete, `purge()` separate | Undo on swipe-to-delete (FR-20); history survives exercise deletion | Delete propagation |
| Aggregate-scoped repositories (session, plan, exercise) | Transactional correctness of set completion + PR update (FR-19, ADR-0005) | A meaningful conflict unit - a half-merged workout is nonsense to a user |
| Every write goes through a repository; SQL nowhere else (lint-enforced) | Testability; the invariants above are only enforceable at one choke point | A single place to add change tracking |
| Derived data is rebuildable (`PersonalRecordService.rebuildAll()`, session totals) | Correct results after editing or deleting a historical workout, and after import | Recomputing after a merge |
| Versioned migrations + a versioned export envelope | Safe app updates on a user's only copy of their data | Schema agreement between client and server |

And explicitly does **not** build: `change_log`, `sync_status` columns, `server_id`,
`findChangedSince()`, `applyRemote()`, vector clocks, or a `SyncableRepository`.

## The interface shape that makes the retrofit additive

```ts
export interface WriteRepository<TEntity, TCreate, TUpdate> {
  create(input: TCreate, tx?: SqlExecutor): Promise<TEntity>;
  update(id: EntityId, patch: TUpdate, tx?: SqlExecutor): Promise<TEntity>;
  softDelete(id: EntityId, tx?: SqlExecutor): Promise<void>;
  restore(id: EntityId, tx?: SqlExecutor): Promise<void>;
  purge(id: EntityId, tx?: SqlExecutor): Promise<void>;
}
```

Two details do the work:

1. **The optional `tx` parameter.** A future `SyncingRepository<T>` decorator can wrap
   any repository, call through to it inside a transaction it opened itself, and append
   an outbox row in the same commit. Without `tx`, the decorator could not make the
   domain write and the outbox write atomic, and sync would lose changes on crash.
2. **No method returns a SQLite row or takes SQL.** The contract is entities and DTOs
   only, so the implementation can change from "write locally" to "write locally and
   enqueue" without touching a single call site.

The concrete retrofit, if sync ever ships, is: one migration adding `change_log`, one
decorator class, one registration change in `services/container.ts`. No feature code
changes.

## What sync would still have to decide later, and this ADR does not

Recorded so that the "sync-ready" claim is honest rather than absolute:

- **Authentication and authorization.** The app has neither (ARCHITECTURE.md section
  13). Adding sync means adding an entire auth model, which is genuinely new work.
- **Conflict policy.** Last-write-wins per aggregate is the obvious default and is what
  the `updated_at` column supports, but "I logged this workout on my phone and edited it
  on my tablet" has no universally right answer.
- **The catalog.** Catalog exercises are shipped with the binary and identified by
  `catalog_slug`, not by UUID, so two devices independently seeding the catalog mint
  different UUIDs for the same exercise. A sync layer must match catalog rows on
  `catalog_slug` and remap. This is why `catalog_slug` is `UNIQUE` and never null for
  catalog rows - it is the one deliberate concession made now for a future sync.
- **Progress photo files.** Row sync is easy; blob sync is a separate problem.

## Consequences

Positive: zero dead code, every guarantee tested by a test that exists for its own
reasons, and a retrofit that touches three files.

Negative: the guarantees are only as good as the discipline maintaining them. If a
future feature bypasses the repository and writes SQL directly, or forgets `updated_at`,
the property silently breaks and nothing fails until sync is attempted. Mitigation: the
ESLint rule forbidding `expo-sqlite` outside `database/**` and `**/repository/**`, and
a repository test asserting that every mutation method bumps `updated_at`.
